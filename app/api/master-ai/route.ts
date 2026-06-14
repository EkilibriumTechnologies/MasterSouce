import { stat } from "node:fs/promises";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import type { MasterAiResponse } from "@/lib/api/adaptive-master";
import { toPublicMetrics } from "@/lib/audio/public-analysis";
import { runAdaptiveMasteringPipeline } from "@/lib/audio/adaptive-mastering-pipeline";
import { buildApiUser } from "@/lib/identity/api-user";
import { attachSessionCookieIfNeeded, prepareSessionForRequest } from "@/lib/identity/session-cookie";
import {
  AdaptiveOpenAIError,
  getAdaptiveOpenAiTimeoutDiagnostics,
  isAdaptiveMasteringOpenAiFatalError
} from "@/lib/openai/adaptive-mastering";
import { createJobId } from "@/lib/jobs/job-id";
import { cleanupExpiredTempFiles, registerExistingFile, resolveTempRecord } from "@/lib/storage/temp-files";
import { incrementProductMetric } from "@/lib/product-metrics";
import { getEntitlementsForUser } from "@/lib/subscriptions/entitlements";
import {
  logWavExportEntitlementResolution,
  resolveEntitlementBillingContext,
  resolveEncodeOutputQuality
} from "@/lib/subscriptions/resolve-entitlement-billing-context";
import { resolveCodecForQuality } from "@/lib/audio/wav-export-codec";
import { consumeRateLimit, getClientIp, hashIdentifier, logAbuseGuard, tooManyAttemptsResponse } from "@/lib/security/abuse-guard";

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
    const clientIp = getClientIp(request);
    const masteringRate = consumeRateLimit({
      bucket: "master_process_ip",
      key: clientIp,
      limit: 10,
      windowMs: 60 * 60 * 1000
    });
    if (!masteringRate.allowed) {
      logAbuseGuard("rate_limited", {
        endpoint: "/api/master-ai",
        bucket: "master_process_ip",
        ipHash: hashIdentifier(clientIp),
        retryAfterSec: masteringRate.retryAfterSec
      });
      const res = tooManyAttemptsResponse(masteringRate.retryAfterSec);
      attachSessionCookieIfNeeded(res, sessionPrep);
      return res;
    }

    const user = buildApiUser(request, sessionPrep.sessionId);

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

    const billingEmailHint =
      body && typeof body === "object" && "billingEmail" in body && typeof (body as { billingEmail?: unknown }).billingEmail === "string"
        ? (body as { billingEmail: string }).billingEmail
        : undefined;
    const billingResolution = resolveEntitlementBillingContext(request, user, { billingEmailHint });

    const entitlements = await getEntitlementsForUser(user, billingResolution.billingContext);

    await cleanupExpiredTempFiles();

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
    const outputQuality = resolveEncodeOutputQuality(
      entitlements.quality,
      billingResolution.emailSource,
      billingResolution.normalizedEmail
    );
    const outputCodec = resolveCodecForQuality(outputQuality);
    const deliveryCodec = resolveCodecForQuality(entitlements.quality);
    logWavExportEntitlementResolution({
      endpoint: "/api/master-ai",
      jobId,
      userId: user.id,
      normalizedEmail: billingResolution.normalizedEmail,
      emailSource: billingResolution.emailSource,
      planId: entitlements.planId,
      outputQuality: entitlements.quality,
      outputCodec: billingResolution.emailSource === "none" ? deliveryCodec : outputCodec
    });
    console.log("[master-ai] adaptive_preview:start", {
      standardJobId: parsed.data.standardMasterJobId,
      adaptiveJobId: jobId
    });
    // Safe preflight before adaptive OpenAI path (no secrets, no audio payloads).
    const timeoutDiag = getAdaptiveOpenAiTimeoutDiagnostics();
    console.info("[master-ai] adaptive_openai_preflight", {
      OPENAI_ADAPTIVE_MODEL: process.env.OPENAI_ADAPTIVE_MODEL ?? null,
      OPENAI_ADAPTIVE_TIMEOUT_MS: process.env.OPENAI_ADAPTIVE_TIMEOUT_MS ?? null,
      rawEnvTimeoutMs: timeoutDiag.rawEnvTimeoutMs,
      resolvedTimeoutMs: timeoutDiag.resolvedTimeoutMs,
      resolvedModel: timeoutDiag.model,
      openaiApiKeyConfigured: Boolean(process.env.OPENAI_API_KEY?.trim()),
      nodeEnv: process.env.NODE_ENV
    });
    const adaptive = await runAdaptiveMasteringPipeline({
      inputPath: standardRecord.filePath,
      jobId,
      genre: parsed.data.preset,
      loudnessMode: parsed.data.loudnessMode,
      userIntent: parsed.data.user_intent,
      outputQuality
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
      validation: adaptive.validation,
      ...(adaptive.adaptiveAiFallback === true &&
      adaptive.adaptiveAiFallbackReason &&
      adaptive.adaptiveAiFallbackMessage
        ? {
            adaptiveAiFallback: true as const,
            adaptiveAiFallbackReason: adaptive.adaptiveAiFallbackReason,
            adaptiveAiFallbackMessage: adaptive.adaptiveAiFallbackMessage
          }
        : {})
    };

    console.log("[master-ai] adaptive_preview:completed", {
      jobId,
      planId: entitlements.planId,
      settingsSource: adaptive.instructionSummary.source,
      correctivePasses: adaptive.validation.correctivePasses,
      outputSize: outputStats?.size ?? null
    });

    if (process.env.NODE_ENV !== "production") {
      console.log("[MASTER_AI_DEBUG] response", {
        jobId,
        outputStats,
        planId: entitlements.planId,
        settingsSource: adaptive.instructionSummary.source,
        correctivePasses: adaptive.validation.correctivePasses
      });
    }

    await incrementProductMetric("previews");

    const response = NextResponse.json(payload);
    attachSessionCookieIfNeeded(response, sessionPrep);
    return response;
  } catch (error) {
    if (error instanceof AdaptiveOpenAIError) {
      const diag = getAdaptiveOpenAiTimeoutDiagnostics();
      console.error("[master-ai] adaptive_openai_error", {
        errorCode: error.code,
        model: error.debug?.model ?? diag.model,
        timeoutMs: error.debug?.timeoutMs ?? diag.resolvedTimeoutMs,
        rawEnvTimeoutMs: diag.rawEnvTimeoutMs,
        resolvedTimeoutMs: diag.resolvedTimeoutMs,
        hasOpenAIApiKey: error.debug?.hasOpenAIApiKey ?? Boolean(process.env.OPENAI_API_KEY?.trim()),
        openAiHttpStatus: error.debug?.openAiHttpStatus ?? null
      });
      if (process.env.NODE_ENV !== "production") {
        console.error("[MASTER_AI_DEBUG] adaptive_ai_unavailable", {
          adaptiveOpenAIErrorCode: error.code,
          model: error.debug?.model ?? null,
          hasOpenAIApiKey: error.debug?.hasOpenAIApiKey ?? Boolean(process.env.OPENAI_API_KEY?.trim()),
          timeoutMs: error.debug?.timeoutMs ?? diag.resolvedTimeoutMs,
          requestBody: error.debug?.requestBody ?? null,
          openAiHttpStatus: error.debug?.openAiHttpStatus ?? null,
          openAiErrorPayload: error.debug?.openAiErrorPayload ?? null
        });
        console.error("[MASTER_AI_DEBUG] adaptive_503_failure_classification", error.code);
      }
      if (error.code === "timeout") {
        console.error("[master-ai] Unexpected AdaptiveOpenAI timeout at route boundary (should be handled in pipeline).");
        return NextResponse.json(
          {
            error: "adaptive_mastering_unexpected",
            message: "Adaptive preview failed unexpectedly. Please retry."
          },
          { status: 500 }
        );
      }
      if (!isAdaptiveMasteringOpenAiFatalError(error)) {
        return NextResponse.json(
          {
            error: "adaptive_mastering_unexpected",
            message: "Adaptive preview failed unexpectedly. Please retry."
          },
          { status: 500 }
        );
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
