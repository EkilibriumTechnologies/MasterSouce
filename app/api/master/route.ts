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
import { API_ERROR_CODES, apiErrorResponse, logApiError, sanitizeLogDetails } from "@/lib/api/error-responses";
import { GENRE_PRESETS, LOUDNESS_MODES } from "@/lib/genre-presets";
import { buildApiUser } from "@/lib/identity/api-user";
import { attachSessionCookieIfNeeded, prepareSessionForRequest } from "@/lib/identity/session-cookie";
import { cleanupExpiredTempFiles, registerExistingFile, saveTempFile } from "@/lib/storage/temp-files";
import { getEntitlementsForUser } from "@/lib/subscriptions/entitlements";
import {
  logWavExportEntitlementResolution,
  resolveEntitlementBillingContext,
  resolveEncodeOutputQuality
} from "@/lib/subscriptions/resolve-entitlement-billing-context";
import { resolveCodecForQuality } from "@/lib/audio/wav-export-codec";
import { MAX_UPLOAD_FILE_SIZE_BYTES, MAX_UPLOAD_FILE_SIZE_LABEL } from "@/lib/upload/limits";
import { probeFfmpegSpawnVersion } from "@/lib/audio/ffmpeg-spawn-diagnostics";
import { createJobId } from "@/lib/jobs/job-id";
import { incrementProductMetric } from "@/lib/product-metrics";
import {
  logMasteringFunnelEvent,
  masteringFunnelBillingSnapshot,
  normalizeEmailForFunnelLog
} from "@/lib/analytics/mastering-funnel";
import { consumeRateLimit, getClientIp, hashIdentifier, logAbuseGuard, tooManyAttemptsResponse } from "@/lib/security/abuse-guard";

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
    const earlySessionPrep = prepareSessionForRequest(request);
    const clientIp = getClientIp(request);
    const masteringRate = consumeRateLimit({
      bucket: "master_process_ip",
      key: clientIp,
      limit: 10,
      windowMs: 60 * 60 * 1000
    });
    if (!masteringRate.allowed) {
      logAbuseGuard("rate_limited", {
        endpoint: "/api/master",
        bucket: "master_process_ip",
        ipHash: hashIdentifier(clientIp),
        retryAfterSec: masteringRate.retryAfterSec
      });
      const res = tooManyAttemptsResponse(masteringRate.retryAfterSec);
      attachSessionCookieIfNeeded(res, earlySessionPrep);
      return res;
    }

    console.log("[MASTER_DEBUG] temp:cleanup:before");
    await cleanupExpiredTempFiles();
    console.log("[MASTER_DEBUG] temp:cleanup:after");

    const sessionPrep = prepareSessionForRequest(request);
    const user = buildApiUser(request, sessionPrep.sessionId);

    let formData: FormData;
    try {
      console.log("[MASTER_DEBUG] formData:start");
      formData = await request.formData();
      console.log("[MASTER_DEBUG] formData:success", {
        keys: Array.from(formData.keys())
      });
    } catch (formErr) {
      const name = formErr instanceof Error ? formErr.name : "Error";
      console.log("[MASTER_DEBUG] formData:error", sanitizeLogDetails({ name, error: formErr }));
      throw formErr;
    }

    const billingEmailField = formData.get("billingEmail");
    const billingEmailHint = typeof billingEmailField === "string" ? billingEmailField : undefined;
    const billingResolution = resolveEntitlementBillingContext(request, user, { billingEmailHint });
    console.log("[MASTER_DEBUG] user:context", {
      hasUserEmail: Boolean(user.email),
      hasBillingEmail: Boolean(billingResolution.normalizedEmail),
      emailSource: billingResolution.emailSource,
      hasBillingFormHint: Boolean(billingEmailHint?.trim())
    });

    const entitlements = await getEntitlementsForUser(user, billingResolution.billingContext);
    console.log("[MASTER_DEBUG] branch:entitlements_snapshot", {
      planId: entitlements.planId,
      outputQuality: entitlements.quality,
      emailSource: billingResolution.emailSource,
      canMaster: entitlements.canMaster,
      mastersQuotaKnown: entitlements.mastersUsedThisPeriod !== null,
      mastersUsedThisPeriod: entitlements.mastersUsedThisPeriod,
      remainingMonthlyMasters: entitlements.remainingMonthlyMasters
    });

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
    logMasteringFunnelEvent("mastering_preview_api_started", {
      source_component: "api_master",
      job_id: jobId,
      normalized_email: normalizeEmailForFunnelLog(billingResolution.normalizedEmail),
      ...masteringFunnelBillingSnapshot(entitlements)
    });
    const outputQuality = resolveEncodeOutputQuality(
      entitlements.quality,
      billingResolution.emailSource,
      billingResolution.normalizedEmail,
      { planIdBeforeOverride: entitlements.planId, billingEmailHint }
    );
    const outputCodec = resolveCodecForQuality(outputQuality);
    const deliveryCodec = resolveCodecForQuality(entitlements.quality);
    logWavExportEntitlementResolution({
      endpoint: "/api/master",
      jobId,
      userId: user.id,
      normalizedEmail: billingResolution.normalizedEmail,
      emailSource: billingResolution.emailSource,
      planId: entitlements.planId,
      outputQuality,
      outputCodec
    });
    if (billingResolution.emailSource === "none") {
      console.log("[MASTER_DEBUG] wav:deferred_delivery_codec", {
        jobId,
        archiveCodec: outputCodec,
        deliveryCodec,
        planIdAtEncode: entitlements.planId
      });
    }

    console.log("[MASTER_DEBUG] temp:write:before", {
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
    console.log("[MASTER_DEBUG] temp:write:after", { jobId, kind: uploadRecord.kind });

    const resolution = getFfmpegResolutionDiagnostics();
    const execPath = resolution.resolvedPath || getFfmpegExecutablePath();

    console.log("[MASTER_DEBUG] ffmpeg:start", {
      phase: "preflight",
      executableResolved: Boolean(execPath)
    });

    const asyncProbe = await probeFfmpegSpawnVersion(resolution.resolvedPath);
    ffmpegRuntimePreflight = { resolution, asyncProbe };
    const spawnOk = asyncProbe.spawnError === null && asyncProbe.exitCode === 0 && !asyncProbe.timedOut;

    if (!spawnOk) {
      console.log("[MASTER_DEBUG] ffmpeg:error", {
        phase: "preflight",
        exitCode: asyncProbe.exitCode,
        timedOut: asyncProbe.timedOut
      });
    } else {
      console.log("[MASTER_DEBUG] ffmpeg:success", {
        phase: "preflight",
        exitCode: asyncProbe.exitCode
      });
    }

    console.info(
      "[api/master] ffmpeg preflight",
      JSON.stringify({
        jobId,
        fileExists: resolution.fileExists,
        platform: resolution.platform,
        nodeEnv: resolution.nodeEnv,
        asyncSpawnOk: spawnOk,
        asyncProbeExitCode: asyncProbe.exitCode,
        asyncProbeTimedOut: asyncProbe.timedOut,
        asyncProbeSpawnError: asyncProbe.spawnError ? "present" : null,
        stderrSummary: asyncProbe.stderrSummary ? "present" : null,
        stdoutSummary: asyncProbe.stdoutSummary ? "present" : null
      })
    );

    console.log("[MASTER_DEBUG] ffmpeg:start", {
      phase: "pipeline",
      executableResolved: Boolean(execPath)
    });

    let result: Awaited<ReturnType<typeof runMasteringPipeline>>;
    try {
      result = await runMasteringPipeline({
        inputPath: uploadRecord.filePath,
        genre: parsed.data.genre,
        loudnessMode: parsed.data.loudnessMode,
        outputFormat: "wav",
        outputQuality,
        jobId
      });
    } catch (pipeErr) {
      console.log("[MASTER_DEBUG] ffmpeg:error", {
        phase: "pipeline",
        exitCode: parseFfmpegExitCodeFromMessage(pipeErr instanceof Error ? pipeErr.message : String(pipeErr))
      });
      throw pipeErr;
    }

    console.log("[MASTER_DEBUG] ffmpeg:success", {
      phase: "pipeline",
      executableResolved: Boolean(execPath)
    });

    console.log("[MASTER_DEBUG] temp:register:before", { jobId });
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
      jobId,
      masteredRegistered: Boolean(masteredRecord.id),
      originalPreviewRegistered: Boolean(originalPreviewRecord.id),
      masteredPreviewRegistered: Boolean(masteredPreviewRecord.id)
    });

    const nextEntitlements = await getEntitlementsForUser(user, billingResolution.billingContext);

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

    const hasMeteredQuota =
      nextEntitlements.mastersUsedThisPeriod !== null &&
      nextEntitlements.monthlyMastersLimit !== null &&
      nextEntitlements.remainingMonthlyMasters !== null &&
      nextEntitlements.remainingMasters !== null;
    const hasUnlimitedQuota =
      nextEntitlements.mastersUsedThisPeriod !== null &&
      nextEntitlements.monthlyMastersLimit === null &&
      nextEntitlements.planId === "pro_studio_monthly";

    const quotaSnapshot = hasMeteredQuota
      ? {
          mastersUsedThisPeriod: nextEntitlements.mastersUsedThisPeriod!,
          monthlyMastersLimit: nextEntitlements.monthlyMastersLimit,
          remainingMonthlyMasters: nextEntitlements.remainingMonthlyMasters,
          creditPackBalance: nextEntitlements.creditPackBalance ?? 0,
          remainingMasters: nextEntitlements.remainingMasters,
          planId: nextEntitlements.planId
        }
      : hasUnlimitedQuota
        ? {
            mastersUsedThisPeriod: nextEntitlements.mastersUsedThisPeriod!,
            monthlyMastersLimit: null,
            remainingMonthlyMasters: null,
            creditPackBalance: nextEntitlements.creditPackBalance ?? 0,
            remainingMasters: null,
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

    await incrementProductMetric("previews");
    logMasteringFunnelEvent("mastering_preview_api_succeeded", {
      source_component: "api_master",
      job_id: jobId,
      file_id: masteredRecord.id,
      normalized_email: normalizeEmailForFunnelLog(billingResolution.normalizedEmail),
      export_quality: outputQuality,
      ...masteringFunnelBillingSnapshot(nextEntitlements)
    });
    if ((nextEntitlements.creditPackBalance ?? 0) > 0) {
      logMasteringFunnelEvent("mastering_user_has_unused_credits", {
        source_component: "api_master",
        normalized_email: normalizeEmailForFunnelLog(billingResolution.normalizedEmail),
        ...masteringFunnelBillingSnapshot(nextEntitlements)
      });
    }

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
    const errorCode =
      error instanceof FfmpegBinaryMissingError ? API_ERROR_CODES.ffmpegUnavailable : API_ERROR_CODES.masteringFailed;
    console.log("[MASTER_DEBUG] catch:error", sanitizeLogDetails({ code: errorCode, error }));
    logMasteringFunnelEvent("mastering_preview_api_failed", {
      source_component: "api_master",
      error_code: errorCode
    });

    const errSession = prepareSessionForRequest(request);
    logApiError("api/master", errorCode, error, {
      ffmpegPreflightAvailable: Boolean(ffmpegRuntimePreflight),
      ffmpegSpawnOk:
        ffmpegRuntimePreflight?.asyncProbe.spawnError === null &&
        ffmpegRuntimePreflight?.asyncProbe.exitCode === 0 &&
        !ffmpegRuntimePreflight?.asyncProbe.timedOut
    });

    if (error instanceof FfmpegBinaryMissingError) {
      const res = apiErrorResponse({
        status: 503,
        code: API_ERROR_CODES.ffmpegUnavailable,
        message: "Mastering is temporarily unavailable. Please try again."
      });
      attachSessionCookieIfNeeded(res, errSession);
      return res;
    }
    const res = apiErrorResponse({
      status: 500,
      code: API_ERROR_CODES.masteringFailed,
      message: "Mastering failed. Please try again."
    });
    attachSessionCookieIfNeeded(res, errSession);
    return res;
  }
}
