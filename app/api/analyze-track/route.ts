import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { API_ERROR_CODES, apiErrorResponse, logApiError } from "@/lib/api/error-responses";
import { assessAudioArtifacts } from "@/lib/audio/audio-artifact-assessment";
import { analyzeTrackWithV2 } from "@/lib/audio/analyze-track-combined";
import { evaluateTrackReadiness } from "@/lib/audio/readiness";
import {
  isAiAudioRestorationAuthorized,
  resolveAiAudioRestorationFeatureConfig
} from "@/lib/features/ai-audio-restoration";
import { resolveTrackAnalysisV2Enablement } from "@/lib/features/track-analysis-v2";
import { isMasterAdminBypassGranted } from "@/lib/subscriptions/master-admin-bypass";
import { createJobId } from "@/lib/jobs/job-id";
import { cleanupExpiredTempFiles, saveTempFile } from "@/lib/storage/temp-files";
import { MAX_UPLOAD_FILE_SIZE_BYTES, MAX_UPLOAD_FILE_SIZE_LABEL } from "@/lib/upload/limits";

const ACCEPTED_MIME = new Set(["audio/mpeg", "audio/mp3", "audio/wav", "audio/x-wav", "audio/wave"]);
const ACCEPTED_EXT = new Set(["wav", "mp3"]);

const InputSchema = z.object({
  genre: z.enum(["pop", "hiphop", "edm", "rock", "reggaeton", "rnb", "lofi"]).optional(),
  loudnessMode: z.enum(["clean", "balanced", "loud"]).optional()
});

export async function POST(request: NextRequest) {
  try {
    await cleanupExpiredTempFiles();

    const formData = await request.formData();
    const file = formData.get("audio");
    const genre = formData.get("genre");
    const loudnessMode = formData.get("loudnessMode");

    const parsed = InputSchema.safeParse({ genre, loudnessMode });
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid genre or loudness mode." }, { status: 400 });
    }

    if (!(file instanceof File)) {
      return NextResponse.json({ error: "Audio file is required." }, { status: 400 });
    }
    if (file.size > MAX_UPLOAD_FILE_SIZE_BYTES) {
      return NextResponse.json(
        { error: `File exceeds the maximum upload size of ${MAX_UPLOAD_FILE_SIZE_LABEL}.` },
        { status: 400 }
      );
    }

    const filename = file.name || "track";
    const ext = filename.split(".").pop()?.toLowerCase() ?? "";
    const mimeAccepted = ACCEPTED_MIME.has(file.type);
    const extAccepted = ACCEPTED_EXT.has(ext);
    if (!mimeAccepted && !extAccepted) {
      return NextResponse.json({ error: "Only WAV or MP3 are supported for MVP." }, { status: 400 });
    }

    const normalizedExt = ext === "wav" || file.type.includes("wav") ? "wav" : "mp3";
    const jobId = createJobId("analysis");

    const buffer = Buffer.from(await file.arrayBuffer());
    const uploadRecord = await saveTempFile({
      data: buffer,
      extension: normalizedExt,
      kind: "upload",
      mime: normalizedExt === "wav" ? "audio/wav" : "audio/mpeg",
      jobId
    });

    // TrackAnalysisV2 is DISABLED BY DEFAULT behind a server-side feature flag.
    //
    // Disabled (default production behavior): only the required existing analysis
    // runs — no V2 FFmpeg subprocesses are spawned and `analysisV2` is not
    // returned, preserving the exact existing response.
    //
    // Enabled (experimental): the required existing analysis and the additive,
    // fail-open V2 analysis run concurrently from the same upload (no duplicate
    // read / no second copy). Existing analysis semantics are unchanged; V2 is
    // omitted if it fails or times out and never delays/affects the existing
    // response beyond its bound.
    const trackAnalysisV2Enabled = resolveTrackAnalysisV2Enablement(() =>
      isMasterAdminBypassGranted(request)
    );
    const { analysis, analysisV2 } = await analyzeTrackWithV2(uploadRecord.filePath, {
      enableV2: trackAnalysisV2Enabled,
      onV2Error: (v2Error) => {
        if (process.env.NODE_ENV !== "production") {
          console.warn(
            "[analyze-track] analysisV2 unavailable:",
            v2Error instanceof Error ? v2Error.message : v2Error
          );
        }
      }
    });
    const readiness = evaluateTrackReadiness(analysis);
    const restorationFeatureConfig = resolveAiAudioRestorationFeatureConfig();
    const restorationOwnerAuthorized = isMasterAdminBypassGranted(request);
    const restorationAuthorized = isAiAudioRestorationAuthorized({
      config: restorationFeatureConfig,
      ownerAuthorized: restorationOwnerAuthorized
    });
    // Fail-open: artifact assessment is additive and must never fail track analysis.
    let audioRestoration:
      | {
          available: true;
          assessment: Awaited<ReturnType<typeof assessAudioArtifacts>>;
        }
      | undefined;
    if (restorationAuthorized) {
      try {
        audioRestoration = {
          available: true,
          assessment: await assessAudioArtifacts(uploadRecord.filePath)
        };
      } catch (assessmentError) {
        if (process.env.NODE_ENV !== "production") {
          console.warn(
            "[analyze-track] audioRestoration assessment unavailable:",
            assessmentError instanceof Error ? assessmentError.message : assessmentError
          );
        }
        audioRestoration = undefined;
      }
    }

    const debug =
      process.env.NODE_ENV !== "production"
        ? {
            filename,
            fileSize: file.size,
            rawMetrics: {
              integratedLufs: analysis.integratedLufs,
              peakDb: analysis.peakDb,
              crestDb: analysis.crestDb
            }
          }
        : undefined;

    if (process.env.NODE_ENV !== "production") {
      console.log("[PREMASTER_DEBUG] /api/analyze-track response", {
        filename,
        fileSize: file.size,
        integratedLufs: analysis.integratedLufs,
        peakDb: analysis.peakDb,
        crestDb: analysis.crestDb,
        verdict: readiness.verdict,
        loudness: readiness.loudness,
        peakSafety: readiness.peakSafety,
        dynamicControl: readiness.dynamicControl,
        recommendation: readiness.recommendation,
        ...(debug ?? {})
      });
    }

    return NextResponse.json({
      analysis: readiness,
      source: {
        fileId: uploadRecord.id,
        jobId: uploadRecord.jobId
      },
      ...(audioRestoration ? { audioRestoration } : {}),
      ...(analysisV2 ? { analysisV2 } : {}),
      ...(debug ? { debug } : {})
    });
  } catch (error) {
    logApiError("api/analyze-track", API_ERROR_CODES.trackAnalysisFailed, error);
    return apiErrorResponse({
      status: 500,
      code: API_ERROR_CODES.trackAnalysisFailed,
      message: "Track analysis failed. Please try again."
    });
  }
}
