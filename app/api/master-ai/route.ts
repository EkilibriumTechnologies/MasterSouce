import { stat } from "node:fs/promises";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import type { MasterAiResponse } from "@/lib/api/adaptive-master";
import { toPublicMetrics } from "@/lib/audio/public-analysis";
import { runAdaptiveMasteringPipeline } from "@/lib/audio/adaptive-mastering-pipeline";
import { buildApiUser } from "@/lib/identity/api-user";
import { attachSessionCookieIfNeeded, prepareSessionForRequest } from "@/lib/identity/session-cookie";
import { AdaptiveOpenAIError } from "@/lib/openai/adaptive-mastering";
import { createJobId } from "@/lib/jobs/job-id";
import { cleanupExpiredTempFiles, registerExistingFile, resolveTempRecord } from "@/lib/storage/temp-files";
import { getEntitlementsForUser } from "@/lib/subscriptions/entitlements";

function isAdaptiveDevBypassEnabled(): boolean {
  const raw = process.env.ADAPTIVE_DEV_BYPASS?.trim().toLowerCase() ?? "";
  return raw === "1" || raw === "true" || raw === "yes" || raw === "on";
}

const BodySchema = z.object({
  standardMasterFileId: z.string().min(8),
  standardMasterJobId: z.string().min(4),
  preset: z.enum(["pop", "hiphop", "edm", "rock", "reggaeton", "rnb", "lofi"]).optional(),
  loudnessMode: z.enum(["clean", "balanced", "loud"]).optional(),
  user_intent: z.string().max(700).optional()
});

export async function POST(request: NextRequest) {
  try {
    const sessionPrep = prepareSessionForRequest(request);
    const user = buildApiUser(request, sessionPrep.sessionId);
    const entitlements = await getEntitlementsForUser(user);

    const isDevBypass = process.env.NODE_ENV !== "production" && isAdaptiveDevBypassEnabled();

    if (!isDevBypass && entitlements.planId === "free") {
      const res = NextResponse.json(
        {
          error: "adaptive_upgrade_required",
          code: "adaptive_upgrade_required",
          message: "Adaptive AI Mastering requires a paid plan before processing.",
          upgradeUrl: "/pricing"
        },
        { status: 402 }
      );
      attachSessionCookieIfNeeded(res, sessionPrep);
      return res;
    }
    await cleanupExpiredTempFiles();

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      const res = NextResponse.json({ error: "Expected JSON body." }, { status: 400 });
      attachSessionCookieIfNeeded(res, sessionPrep);
      return res;
    }

    const parsed = BodySchema.safeParse(body);
    if (!parsed.success) {
      const res = NextResponse.json({ error: "Invalid adaptive mastering request payload." }, { status: 400 });
      attachSessionCookieIfNeeded(res, sessionPrep);
      return res;
    }

    const standardRecord = await resolveTempRecord(parsed.data.standardMasterFileId);
    if (
      !standardRecord ||
      standardRecord.kind !== "mastered" ||
      standardRecord.jobId !== parsed.data.standardMasterJobId
    ) {
      const res = NextResponse.json({ error: "Standard master reference is missing or expired." }, { status: 404 });
      attachSessionCookieIfNeeded(res, sessionPrep);
      return res;
    }

    const jobId = createJobId("adaptive");
    const adaptive = await runAdaptiveMasteringPipeline({
      inputPath: standardRecord.filePath,
      jobId,
      genre: parsed.data.preset,
      loudnessMode: parsed.data.loudnessMode,
      userIntent: parsed.data.user_intent,
      outputQuality: entitlements.quality
    });

    const adaptiveMasterRecord = await registerExistingFile({
      filePath: adaptive.adaptiveMasteredPath,
      kind: "mastered",
      mime: adaptive.outputMime,
      jobId
    });
    const standardPreviewRecord = await registerExistingFile({
      filePath: adaptive.baselinePreviewPath,
      kind: "preview",
      mime: "audio/mpeg",
      jobId
    });
    const adaptivePreviewRecord = await registerExistingFile({
      filePath: adaptive.adaptivePreviewPath,
      kind: "preview",
      mime: "audio/mpeg",
      jobId
    });

    let outputStats: { size: number; mtimeMs: number } | null = null;
    try {
      const st = await stat(adaptive.adaptiveMasteredPath);
      outputStats = { size: st.size, mtimeMs: st.mtimeMs };
    } catch {
      outputStats = null;
    }

    const standardMetrics = toPublicMetrics(adaptive.baselineAnalysis);
    const adaptiveMetrics = adaptive.adaptiveAnalysis ? toPublicMetrics(adaptive.adaptiveAnalysis) : null;

    const payload: MasterAiResponse = {
      jobId,
      mode: "adaptive",
      previews: {
        standard: `/api/download?fileId=${standardPreviewRecord.id}&as=standard-master-preview.mp3`,
        adaptive: `/api/download?fileId=${adaptivePreviewRecord.id}&as=adaptive-master-preview.mp3`
      },
      download: {
        requiresEmail: true as const,
        fileId: adaptiveMasterRecord.id
      },
      analysis: {
        standard: {
          durationSec: standardMetrics.durationSec,
          integratedLufs: standardMetrics.integratedLufs,
          peakDb: standardMetrics.peakDb,
          crestDb: standardMetrics.crestDb,
          notes: adaptive.baselineAnalysis.notes,
          original: standardMetrics
        },
        adaptive: adaptiveMetrics
          ? {
              durationSec: adaptiveMetrics.durationSec,
              integratedLufs: adaptiveMetrics.integratedLufs,
              peakDb: adaptiveMetrics.peakDb,
              crestDb: adaptiveMetrics.crestDb,
              notes: adaptive.adaptiveAnalysis?.notes ?? [],
              original: adaptiveMetrics
            }
          : null
      },
      readiness: adaptive.adaptiveReadiness
        ? {
            verdict: adaptive.adaptiveReadiness.verdict,
            recommendation: adaptive.adaptiveReadiness.recommendation
          }
        : null,
      adaptiveSettings: adaptive.instructionSummary,
      validation: adaptive.validation
    };

    if (process.env.NODE_ENV !== "production") {
      console.log("[MASTER_AI_DEBUG] response", {
        jobId,
        outputStats,
        planId: entitlements.planId,
        settingsSource: adaptive.instructionSummary.source,
        correctivePasses: adaptive.validation.correctivePasses
      });
    }

    const response = NextResponse.json(payload);
    attachSessionCookieIfNeeded(response, sessionPrep);
    return response;
  } catch (error) {
    if (error instanceof AdaptiveOpenAIError) {
      if (process.env.NODE_ENV !== "production") {
        console.error("[MASTER_AI_DEBUG] adaptive_ai_unavailable", {
          adaptiveOpenAIErrorCode: error.code,
          model: error.debug?.model ?? null,
          hasOpenAIApiKey: error.debug?.hasOpenAIApiKey ?? Boolean(process.env.OPENAI_API_KEY?.trim()),
          timeoutMs: error.debug?.timeoutMs ?? Number(process.env.OPENAI_ADAPTIVE_TIMEOUT_MS ?? "12000"),
          requestBody: error.debug?.requestBody ?? null,
          openAiHttpStatus: error.debug?.openAiHttpStatus ?? null,
          openAiErrorPayload: error.debug?.openAiErrorPayload ?? null
        });
        // Temporary local-only marker to quickly classify 503 root cause.
        console.error("[MASTER_AI_DEBUG] adaptive_503_failure_classification", error.code);
      }
      return NextResponse.json(
        {
          error: "adaptive_ai_unavailable",
          code: "adaptive_ai_unavailable",
          message: "Adaptive AI decisions are currently unavailable. Please retry in a moment.",
          detail: error.code
        },
        { status: 503 }
      );
    }
    const detail = error instanceof Error ? error.message : "Unknown adaptive mastering error.";
    return NextResponse.json(
      {
        error: `Adaptive mastering failed. Detail: ${detail}`
      },
      { status: 500 }
    );
  }
}
