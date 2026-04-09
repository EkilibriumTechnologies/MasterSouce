import { stat } from "node:fs/promises";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { runMasteringPipeline } from "@/lib/audio/mastering-pipeline";
import { hasAnyMetric, toPublicMetrics } from "@/lib/audio/public-analysis";
import {
  FfmpegBinaryMissingError,
  getFfmpegExecutablePath,
  getFfmpegResolutionDiagnostics
} from "@/lib/audio/ffmpeg-bin";
import { GENRE_PRESETS, LOUDNESS_MODES } from "@/lib/genre-presets";
import { buildApiUser } from "@/lib/identity/api-user";
import { attachSessionCookieIfNeeded, prepareSessionForRequest } from "@/lib/identity/session-cookie";
import { cleanupExpiredTempFiles, getTempRoot, registerExistingFile, saveTempFile } from "@/lib/storage/temp-files";
import { getEntitlementsForUser } from "@/lib/subscriptions/entitlements";
import { MAX_UPLOAD_FILE_SIZE_BYTES, MAX_UPLOAD_FILE_SIZE_LABEL } from "@/lib/upload/limits";
import { probeFfmpegSpawnVersion } from "@/lib/audio/ffmpeg-spawn-diagnostics";
import { createJobId } from "@/lib/jobs/job-id";

const ACCEPTED_MIME = new Set(["audio/mpeg", "audio/mp3", "audio/wav", "audio/x-wav", "audio/wave"]);
const ACCEPTED_EXT = new Set(["wav", "mp3"]);

const InputSchema = z.object({
  genre: z.enum(["pop", "hiphop", "edm", "rock", "reggaeton", "rnb", "lofi"]),
  loudnessMode: z.enum(["clean", "balanced", "loud"])
});

function parseFfmpegExitCodeFromMessage(message: string): number | undefined {
  const m = message.match(/ffmpeg failed \((-?\d+)\)/);
  if (m) return Number(m[1]);
  return undefined;
}

export async function POST(request: NextRequest) {
  let ffmpegRuntimePreflight: {
    resolution: ReturnType<typeof getFfmpegResolutionDiagnostics>;
    asyncProbe: Awaited<ReturnType<typeof probeFfmpegSpawnVersion>>;
  } | null = null;

  const reqUrl = request.nextUrl?.toString() ?? request.url;
  console.log("[MASTER_DEBUG] request:start", {
    method: request.method,
    url: reqUrl,
    contentType: request.headers.get("content-type"),
    contentLength: request.headers.get("content-length")
  });

  try {
    console.log("[MASTER_DEBUG] temp:cleanup:before", { tempRoot: getTempRoot() });
    await cleanupExpiredTempFiles();
    console.log("[MASTER_DEBUG] temp:cleanup:after", { tempRoot: getTempRoot() });

    const sessionPrep = prepareSessionForRequest(request);
    const user = buildApiUser(request, sessionPrep.sessionId);
    console.log("[MASTER_DEBUG] user:context", { hasEmail: Boolean(user.email) });

    const entitlements = await getEntitlementsForUser(user);
    console.log("[MASTER_DEBUG] branch:entitlements_snapshot", {
      planId: entitlements.planId,
      canMaster: entitlements.canMaster,
      mastersQuotaKnown: entitlements.mastersUsedThisPeriod !== null,
      mastersUsedThisPeriod: entitlements.mastersUsedThisPeriod,
      remainingMonthlyMasters: entitlements.remainingMonthlyMasters
    });

    let formData: FormData;
    try {
      console.log("[MASTER_DEBUG] formData:start");
      formData = await request.formData();
      console.log("[MASTER_DEBUG] formData:success", {
        keys: Array.from(formData.keys())
      });
    } catch (formErr) {
      const name = formErr instanceof Error ? formErr.name : "Error";
      const message = formErr instanceof Error ? formErr.message : String(formErr);
      const stack = formErr instanceof Error ? formErr.stack : undefined;
      console.log("[MASTER_DEBUG] formData:error", { name, message, stack });
      throw formErr;
    }

    const file = formData.get("audio");
    const genre = formData.get("genre");
    const loudnessMode = formData.get("loudnessMode");

    console.log("[MASTER_DEBUG] form:extracted", {
      hasFile: file instanceof File,
      fileName: file instanceof File ? file.name : null,
      fileType: file instanceof File ? file.type : null,
      fileSize: file instanceof File ? file.size : null,
      genre: typeof genre === "string" ? genre : genre == null ? null : String(genre),
      loudnessMode:
        typeof loudnessMode === "string" ? loudnessMode : loudnessMode == null ? null : String(loudnessMode),
      hasEmail: Boolean(user.email)
    });

    const parsed = InputSchema.safeParse({ genre, loudnessMode });
    if (!parsed.success) {
      console.log("[MASTER_DEBUG] return:invalid_form");
      const res = NextResponse.json({ error: "Invalid genre or loudness mode." }, { status: 400 });
      attachSessionCookieIfNeeded(res, sessionPrep);
      return res;
    }
    if (!(file instanceof File)) {
      console.log("[MASTER_DEBUG] return:missing_file");
      const res = NextResponse.json({ error: "Audio file is required." }, { status: 400 });
      attachSessionCookieIfNeeded(res, sessionPrep);
      return res;
    }
    if (file.size > MAX_UPLOAD_FILE_SIZE_BYTES) {
      console.log("[MASTER_DEBUG] return:file_too_large");
      const res = NextResponse.json(
        { error: `File exceeds the maximum upload size of ${MAX_UPLOAD_FILE_SIZE_LABEL}.` },
        { status: 400 }
      );
      attachSessionCookieIfNeeded(res, sessionPrep);
      return res;
    }

    const filename = file.name || "track";
    const ext = filename.split(".").pop()?.toLowerCase() ?? "";
    const mimeAccepted = ACCEPTED_MIME.has(file.type);
    const extAccepted = ACCEPTED_EXT.has(ext);
    if (!mimeAccepted && !extAccepted) {
      console.log("[MASTER_DEBUG] return:unsupported_format");
      const res = NextResponse.json({ error: "Only WAV or MP3 are supported for MVP." }, { status: 400 });
      attachSessionCookieIfNeeded(res, sessionPrep);
      return res;
    }

    const normalizedExt = ext === "wav" || file.type.includes("wav") ? "wav" : "mp3";
    const jobId = createJobId("job");

    console.log("[MASTER_DEBUG] temp:write:before", {
      tempRoot: getTempRoot(),
      jobId,
      extension: normalizedExt,
      byteLength: file.size
    });
    const buffer = Buffer.from(await file.arrayBuffer());
    const uploadRecord = await saveTempFile({
      data: buffer,
      extension: normalizedExt,
      kind: "upload",
      mime: normalizedExt === "wav" ? "audio/wav" : "audio/mpeg",
      jobId
    });
    console.log("[MASTER_DEBUG] temp:write:after", {
      inputFilePath: uploadRecord.filePath,
      tempRoot: getTempRoot()
    });

    const resolution = getFfmpegResolutionDiagnostics();
    const execPath = resolution.resolvedPath || getFfmpegExecutablePath();

    console.log("[MASTER_DEBUG] ffmpeg:start", {
      phase: "preflight",
      executablePath: execPath,
      inputPath: uploadRecord.filePath,
      outputPath: "(probe only)"
    });

    const asyncProbe = await probeFfmpegSpawnVersion(resolution.resolvedPath);
    ffmpegRuntimePreflight = { resolution, asyncProbe };
    const spawnOk = asyncProbe.spawnError === null && asyncProbe.exitCode === 0 && !asyncProbe.timedOut;

    if (!spawnOk) {
      console.log("[MASTER_DEBUG] ffmpeg:error", {
        phase: "preflight",
        message: asyncProbe.spawnError ?? "preflight spawn failed or non-zero exit",
        exitCode: asyncProbe.exitCode,
        timedOut: asyncProbe.timedOut,
        stderrSnippet: asyncProbe.stderrSummary
      });
    } else {
      console.log("[MASTER_DEBUG] ffmpeg:success", {
        phase: "preflight",
        executablePath: execPath,
        exitCode: asyncProbe.exitCode
      });
    }

    console.info(
      "[api/master] ffmpeg preflight",
      JSON.stringify({
        jobId,
        resolvedPath: resolution.resolvedPath,
        fileExists: resolution.fileExists,
        platform: resolution.platform,
        nodeEnv: resolution.nodeEnv,
        asyncSpawnOk: spawnOk,
        asyncProbeExitCode: asyncProbe.exitCode,
        asyncProbeSpawnError: asyncProbe.spawnError,
        asyncProbeTimedOut: asyncProbe.timedOut,
        stderrSummary: asyncProbe.stderrSummary,
        stdoutSummary: asyncProbe.stdoutSummary
      })
    );

    console.log("[MASTER_DEBUG] ffmpeg:start", {
      phase: "pipeline",
      executablePath: execPath,
      inputPath: uploadRecord.filePath,
      outputPath: "(mastered wav + previews under temp root)"
    });

    let result: Awaited<ReturnType<typeof runMasteringPipeline>>;
    try {
      result = await runMasteringPipeline({
        inputPath: uploadRecord.filePath,
        genre: parsed.data.genre,
        loudnessMode: parsed.data.loudnessMode,
        outputFormat: "wav",
        outputQuality: entitlements.quality,
        jobId
      });
    } catch (pipeErr) {
      const msg = pipeErr instanceof Error ? pipeErr.message : String(pipeErr);
      const stderrSnippet = msg.includes("stderr:") ? msg.slice(-800) : msg.slice(-800);
      console.log("[MASTER_DEBUG] ffmpeg:error", {
        phase: "pipeline",
        message: msg,
        exitCode: parseFfmpegExitCodeFromMessage(msg),
        stderrSnippet
      });
      throw pipeErr;
    }

    console.log("[MASTER_DEBUG] ffmpeg:success", {
      phase: "pipeline",
      executablePath: execPath,
      inputPath: uploadRecord.filePath,
      masteredPath: result.masteredPath,
      previewPath: result.previewPath,
      inputPreviewPath: result.inputPreviewPath
    });

    console.log("[MASTER_DEBUG] temp:register:before", { tempRoot: getTempRoot() });
    const masteredRecord = await registerExistingFile({
      filePath: result.masteredPath,
      kind: "mastered",
      mime: result.outputMime,
      jobId
    });
    const originalPreviewRecord = await registerExistingFile({
      filePath: result.inputPreviewPath,
      kind: "preview",
      mime: "audio/mpeg",
      jobId
    });
    const masteredPreviewRecord = await registerExistingFile({
      filePath: result.previewPath,
      kind: "preview",
      mime: "audio/mpeg",
      jobId
    });
    console.log("[MASTER_DEBUG] temp:register:after", {
      masteredId: masteredRecord.id,
      originalPreviewId: originalPreviewRecord.id,
      masteredPreviewId: masteredPreviewRecord.id
    });

    const nextEntitlements = await getEntitlementsForUser(user);

    const originalMetrics = toPublicMetrics(result.originalAnalysis);
    const masteredMetrics = result.masteredAnalysis ? toPublicMetrics(result.masteredAnalysis) : null;
    const hasMasteredMetrics = Boolean(masteredMetrics && hasAnyMetric(masteredMetrics));
    const analysisPrimary = hasMasteredMetrics && masteredMetrics ? masteredMetrics : originalMetrics;

    let masteredStat: { size: number; mtimeMs: number } | null = null;
    try {
      const st = await stat(result.masteredPath);
      masteredStat = { size: st.size, mtimeMs: st.mtimeMs };
    } catch {
      masteredStat = null;
    }

    const quotaSnapshot =
      nextEntitlements.mastersUsedThisPeriod !== null &&
      nextEntitlements.monthlyMastersLimit !== null &&
      nextEntitlements.remainingMonthlyMasters !== null &&
      nextEntitlements.remainingMasters !== null
        ? {
            mastersUsedThisPeriod: nextEntitlements.mastersUsedThisPeriod,
            monthlyMastersLimit: nextEntitlements.monthlyMastersLimit,
            remainingMonthlyMasters: nextEntitlements.remainingMonthlyMasters,
            creditPackBalance: nextEntitlements.creditPackBalance ?? 0,
            remainingMasters: nextEntitlements.remainingMasters,
            planId: nextEntitlements.planId
          }
        : null;

    const responsePayloadSummary = {
      jobId,
      preset: GENRE_PRESETS[parsed.data.genre].label,
      mode: LOUDNESS_MODES[parsed.data.loudnessMode].label,
      previewUrls: 2,
      downloadFileId: masteredRecord.id,
      analysisKeys: ["durationSec", "integratedLufs", "peakDb", "crestDb", "notes", "original", "mastered?"],
      quota: quotaSnapshot
    };

    console.log("[MASTER_DEBUG] response:ready", {
      outputFileStats: masteredStat,
      payloadSummary: responsePayloadSummary
    });
    console.log("[MASTER_DEBUG] return:success");

    const response = NextResponse.json({
      jobId,
      preset: GENRE_PRESETS[parsed.data.genre].label,
      mode: LOUDNESS_MODES[parsed.data.loudnessMode].label,
      previews: {
        original: `/api/download?fileId=${originalPreviewRecord.id}&as=original-preview.mp3`,
        mastered: `/api/download?fileId=${masteredPreviewRecord.id}&as=mastered-preview.mp3`
      },
      download: {
        requiresEmail: true as const,
        fileId: masteredRecord.id
      },
      // See `MasterJobAnalysis` in `lib/api/master-analysis.ts` for field semantics.
      analysis: {
        durationSec: analysisPrimary.durationSec,
        integratedLufs: analysisPrimary.integratedLufs,
        peakDb: analysisPrimary.peakDb,
        crestDb: analysisPrimary.crestDb,
        notes: result.originalAnalysis.notes,
        original: originalMetrics,
        ...(hasMasteredMetrics && masteredMetrics ? { mastered: masteredMetrics } : {})
      },
      ...(quotaSnapshot ? { quota: quotaSnapshot } : {}),
      subscription: {
        customerPortalEligible: nextEntitlements.customerPortalEligible,
        stripeReady: true,
        authReady: true
      }
    });
    attachSessionCookieIfNeeded(response, sessionPrep);
    return response;
  } catch (error) {
    const name = error instanceof Error ? error.name : "Error";
    const message = error instanceof Error ? error.message : String(error);
    const stack = error instanceof Error ? error.stack : undefined;
    console.log("[MASTER_DEBUG] catch:error", { name, message, stack });

    const errSession = prepareSessionForRequest(request);
    const errStack = error instanceof Error ? error.stack ?? error.message : String(error);
    console.error(
      "[api/master] caught error",
      errStack,
      ffmpegRuntimePreflight ? JSON.stringify(ffmpegRuntimePreflight) : "no ffmpeg preflight (failed earlier)"
    );

    if (error instanceof FfmpegBinaryMissingError) {
      const res = NextResponse.json(
        {
          error: error.message,
          code: error.code,
          candidatesTried: error.candidatesTried,
          ...(process.env.NODE_ENV !== "production"
            ? {
                diagnostics: {
                  errorStack: errStack,
                  ffmpegRuntimePreflight
                }
              }
            : {})
        },
        { status: 503 }
      );
      attachSessionCookieIfNeeded(res, errSession);
      return res;
    }
    const detail = error instanceof Error ? error.message : "Unknown mastering error.";
    const messageOut = detail.includes("Supabase")
      ? detail
      : `Mastering failed. Ensure ffmpeg is installed and available. Detail: ${detail}`;
    const res = NextResponse.json(
      {
        error: messageOut,
        code: detail.includes("Supabase") ? "SUPABASE_ERROR" : "MASTERING_FAILED",
        detail,
        ...(process.env.NODE_ENV !== "production"
          ? {
              diagnostics: {
                errorStack: errStack,
                ffmpegRuntimePreflight,
                stderrHintFromMessage: detail.includes("ffmpeg failed") ? detail.slice(-1200) : undefined
              }
            }
          : {})
      },
      { status: 500 }
    );
    attachSessionCookieIfNeeded(res, errSession);
    return res;
  }
}
