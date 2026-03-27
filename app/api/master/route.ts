import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { runMasteringPipeline } from "@/lib/audio/mastering-pipeline";
import { GENRE_PRESETS, LOUDNESS_MODES } from "@/lib/genre-presets";
import { buildApiUser } from "@/lib/identity/api-user";
import { attachSessionCookieIfNeeded, prepareSessionForRequest } from "@/lib/identity/session-cookie";
import { cleanupExpiredTempFiles, registerExistingFile, saveTempFile } from "@/lib/storage/temp-files";
import { isSupabaseConfigured } from "@/lib/supabase/admin";
import { getEntitlementsForUser } from "@/lib/subscriptions/entitlements";
import { incrementUsage } from "@/lib/usage/quota";
import {
  countCompletedMasterizationsForMonth,
  getCurrentMonthKeyUtc,
  insertCompletedMasteringUsage
} from "@/lib/usage/supabase-mastering-usage";
import { MAX_UPLOAD_FILE_SIZE_BYTES, MAX_UPLOAD_FILE_SIZE_LABEL } from "@/lib/upload/limits";
import { FfmpegBinaryMissingError, getFfmpegResolutionDiagnostics } from "@/lib/audio/ffmpeg-bin";
import { probeFfmpegSpawnVersion } from "@/lib/audio/ffmpeg-spawn-diagnostics";

const ACCEPTED_MIME = new Set(["audio/mpeg", "audio/mp3", "audio/wav", "audio/x-wav", "audio/wave"]);
const ACCEPTED_EXT = new Set(["wav", "mp3"]);

const InputSchema = z.object({
  genre: z.enum(["pop", "hiphop", "edm", "rock", "reggaeton", "rnb", "lofi"]),
  loudnessMode: z.enum(["clean", "balanced", "loud"])
});

export async function POST(request: NextRequest) {
  let ffmpegRuntimePreflight: {
    resolution: ReturnType<typeof getFfmpegResolutionDiagnostics>;
    asyncProbe: Awaited<ReturnType<typeof probeFfmpegSpawnVersion>>;
  } | null = null;

  try {
    await cleanupExpiredTempFiles();
    const sessionPrep = prepareSessionForRequest(request);
    const user = buildApiUser(request, sessionPrep.sessionId);
    const entitlements = await getEntitlementsForUser(user);
    if (!entitlements.canProcess) {
      const response = NextResponse.json(
        {
          error: "Free monthly mastering limit reached.",
          quota: {
            remainingFreeMasters: entitlements.remainingFreeMasters,
            planId: entitlements.planId
          }
        },
        { status: 402 }
      );
      attachSessionCookieIfNeeded(response, sessionPrep);
      return response;
    }

    const formData = await request.formData();
    const file = formData.get("audio");
    const genre = formData.get("genre");
    const loudnessMode = formData.get("loudnessMode");

    const parsed = InputSchema.safeParse({ genre, loudnessMode });
    if (!parsed.success) {
      const res = NextResponse.json({ error: "Invalid genre or loudness mode." }, { status: 400 });
      attachSessionCookieIfNeeded(res, sessionPrep);
      return res;
    }
    if (!(file instanceof File)) {
      const res = NextResponse.json({ error: "Audio file is required." }, { status: 400 });
      attachSessionCookieIfNeeded(res, sessionPrep);
      return res;
    }
    if (file.size > MAX_UPLOAD_FILE_SIZE_BYTES) {
      const res = NextResponse.json({ error: `File exceeds the maximum upload size of ${MAX_UPLOAD_FILE_SIZE_LABEL}.` }, { status: 400 });
      attachSessionCookieIfNeeded(res, sessionPrep);
      return res;
    }

    const filename = file.name || "track";
    const ext = filename.split(".").pop()?.toLowerCase() ?? "";
    const mimeAccepted = ACCEPTED_MIME.has(file.type);
    const extAccepted = ACCEPTED_EXT.has(ext);
    if (!mimeAccepted && !extAccepted) {
      const res = NextResponse.json({ error: "Only WAV or MP3 are supported for MVP." }, { status: 400 });
      attachSessionCookieIfNeeded(res, sessionPrep);
      return res;
    }

    const normalizedExt = ext === "wav" || file.type.includes("wav") ? "wav" : "mp3";
    const jobId = `job_${Date.now().toString(36)}`;
    const buffer = Buffer.from(await file.arrayBuffer());
    const uploadRecord = await saveTempFile({
      data: buffer,
      extension: normalizedExt,
      kind: "upload",
      mime: normalizedExt === "wav" ? "audio/wav" : "audio/mpeg",
      jobId
    });

    const resolution = getFfmpegResolutionDiagnostics();
    const asyncProbe = await probeFfmpegSpawnVersion(resolution.resolvedPath);
    ffmpegRuntimePreflight = { resolution, asyncProbe };
    const spawnOk =
      asyncProbe.spawnError === null && asyncProbe.exitCode === 0 && !asyncProbe.timedOut;
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

    const result = await runMasteringPipeline({
      inputPath: uploadRecord.filePath,
      genre: parsed.data.genre,
      loudnessMode: parsed.data.loudnessMode,
      outputFormat: "wav",
      jobId
    });

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

    const monthKey = getCurrentMonthKeyUtc();
    let usedThisMonth: number;
    if (isSupabaseConfigured()) {
      await insertCompletedMasteringUsage({
        email: user.email,
        sessionId: user.sessionId,
        monthKey,
        jobId
      });
      usedThisMonth = await countCompletedMasterizationsForMonth(user.email, user.sessionId, monthKey);
    } else {
      usedThisMonth = incrementUsage(user.id);
    }
    const nextEntitlements = await getEntitlementsForUser(user);

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
      analysis: {
        durationSec: result.analysis.durationSec,
        integratedLufs: result.analysis.integratedLufs,
        peakDb: result.analysis.peakDb,
        crestDb: result.analysis.crestDb,
        notes: result.analysis.notes
      },
      quota: {
        usedThisMonth,
        remainingFreeMasters: nextEntitlements.remainingFreeMasters,
        planId: nextEntitlements.planId
      },
      subscription: {
        customerPortalEligible: nextEntitlements.customerPortalEligible,
        stripeReady: true,
        authReady: true
      }
    });
    attachSessionCookieIfNeeded(response, sessionPrep);
    return response;
  } catch (error) {
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
    const message = detail.includes("Supabase")
      ? detail
      : `Mastering failed. Ensure ffmpeg is installed and available. Detail: ${detail}`;
    const res = NextResponse.json(
      {
        error: message,
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
