import { stat } from "node:fs/promises";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { API_ERROR_CODES, apiErrorResponse, logApiError } from "@/lib/api/error-responses";
import type { MasterAiResponse } from "@/lib/api/adaptive-master";
import { assessAudioArtifacts } from "@/lib/audio/audio-artifact-assessment";
import { runAudioArtifactRestoration } from "@/lib/audio/audio-restoration";
import {
  isAudioRestorationStrength,
  type AudioRestorationResult,
  type AudioRestorationStrength
} from "@/lib/audio/audio-restoration-types";
import { analyzeTrack } from "@/lib/audio/analyze-track";
import { toPublicMetrics } from "@/lib/audio/public-analysis";
import { runAdaptiveMasteringPipeline } from "@/lib/audio/adaptive-mastering-pipeline";
import {
  createAdaptiveTrackAnalyzer,
  resolveAdaptiveAnalysisRouting,
  type AdaptiveTrackAnalyzer
} from "@/lib/audio/adaptive-track-analysis";
import { combineAdaptiveUserIntent } from "@/lib/audio/combine-adaptive-user-intent";
import { resolveAdaptiveSourceAudio } from "@/lib/audio/resolve-adaptive-source-audio";
import {
  formDataToFieldRecord,
  normalizeAdaptiveNotes,
  normalizeReferenceArtist
} from "@/lib/audio/parse-adaptive-master-ai-fields";
import { buildApiUser } from "@/lib/identity/api-user";
import {
  isAiAudioRestorationAuthorized,
  resolveAiAudioRestorationFeatureConfig
} from "@/lib/features/ai-audio-restoration";
import { attachSessionCookieIfNeeded, prepareSessionForRequest } from "@/lib/identity/session-cookie";
import {
  AdaptiveOpenAIError,
  getAdaptiveOpenAiTimeoutDiagnostics,
  isAdaptiveMasteringOpenAiFatalError
} from "@/lib/openai/adaptive-mastering";
import { createJobId } from "@/lib/jobs/job-id";
import { cleanupExpiredTempFiles, registerExistingFile, saveTempFile } from "@/lib/storage/temp-files";
import { incrementProductMetric } from "@/lib/product-metrics";
import {
  logMasteringFunnelEvent,
  masteringFunnelBillingSnapshot,
  normalizeEmailForFunnelLog
} from "@/lib/analytics/mastering-funnel-server";
import { getEntitlementsForUser } from "@/lib/subscriptions/entitlements";
import {
  logWavExportEntitlementResolution,
  resolveEntitlementBillingContext,
  resolveEncodeOutputQuality
} from "@/lib/subscriptions/resolve-entitlement-billing-context";
import { resolveCodecForQuality } from "@/lib/audio/wav-export-codec";
import { isMasterAdminBypassGranted } from "@/lib/subscriptions/master-admin-bypass";
import { consumeRateLimit, getClientIp, hashIdentifier, logAbuseGuard, tooManyAttemptsResponse } from "@/lib/security/abuse-guard";
import { MAX_UPLOAD_FILE_SIZE_BYTES, MAX_UPLOAD_FILE_SIZE_LABEL } from "@/lib/upload/limits";

const ACCEPTED_MIME = new Set(["audio/mpeg", "audio/mp3", "audio/wav", "audio/x-wav", "audio/wave"]);
const ACCEPTED_EXT = new Set(["wav", "mp3"]);

const CoreBodySchema = z.object({
  standardMasterFileId: z.string().min(8).optional(),
  standardMasterJobId: z.string().min(4).optional(),
  preset: z.enum(["pop", "hiphop", "edm", "rock", "reggaeton", "rnb", "lofi"]).optional(),
  loudnessMode: z.enum(["clean", "balanced", "loud"]).optional(),
  applyAudioRestoration: z.boolean().optional(),
  audioRestorationStrength: z.enum(["light", "balanced", "strong"]).optional()
});

type ParsedMasterAiRequest = {
  data: z.infer<typeof CoreBodySchema>;
  billingEmailHint?: string;
  inlineAudio: File | null;
  referenceFile: File | null;
  adaptiveNotes: string;
  referenceArtist?: string;
};

function parseOptionalBooleanField(value: FormDataEntryValue | null): boolean | undefined {
  if (typeof value !== "string") return undefined;
  const normalized = value.trim().toLowerCase();
  if (!normalized) return undefined;
  if (["true", "1", "yes", "on"].includes(normalized)) return true;
  if (["false", "0", "no", "off"].includes(normalized)) return false;
  return undefined;
}

function sanitizeRestorationResultForResponse(
  result: AudioRestorationResult
): Omit<AudioRestorationResult, "inputPath" | "outputPath"> {
  return {
    attempted: result.attempted,
    applied: result.applied,
    success: result.success,
    strength: result.strength,
    fallbackUsed: result.fallbackUsed,
    ...(result.fallbackReason ? { fallbackReason: result.fallbackReason } : {}),
    modulesApplied: result.modulesApplied,
    ...(result.processingTimeMs !== undefined ? { processingTimeMs: result.processingTimeMs } : {})
  };
}

async function parseMasterAiRequest(request: NextRequest): Promise<ParsedMasterAiRequest | "invalid_json" | "invalid_payload"> {
  const contentType = request.headers.get("content-type") ?? "";

  if (contentType.includes("multipart/form-data")) {
    let formData: FormData;
    try {
      formData = await request.formData();
    } catch {
      return "invalid_json";
    }

    const billingEmailField = formData.get("billingEmail");
    const billingEmailHint = typeof billingEmailField === "string" ? billingEmailField : undefined;
    const referenceField = formData.get("referenceTrack");
    const referenceFile = referenceField instanceof File && referenceField.size > 0 ? referenceField : null;

    const fieldRecord = formDataToFieldRecord(formData);
    const parsed = CoreBodySchema.safeParse({
      standardMasterFileId: formData.get("standardMasterFileId") || undefined,
      standardMasterJobId: formData.get("standardMasterJobId") || undefined,
      preset: formData.get("preset") || undefined,
      loudnessMode: formData.get("loudnessMode") || undefined,
      applyAudioRestoration: parseOptionalBooleanField(formData.get("applyAudioRestoration")),
      audioRestorationStrength: formData.get("audioRestorationStrength") || undefined
    });
    if (!parsed.success) return "invalid_payload";
    const inlineAudioField = formData.get("audio");
    return {
      data: parsed.data,
      billingEmailHint,
      inlineAudio: inlineAudioField instanceof File && inlineAudioField.size > 0 ? inlineAudioField : null,
      referenceFile,
      adaptiveNotes: normalizeAdaptiveNotes(fieldRecord),
      referenceArtist: normalizeReferenceArtist(fieldRecord)
    };
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return "invalid_json";
  }

  const fieldRecord =
    body && typeof body === "object" && !Array.isArray(body) ? (body as Record<string, unknown>) : {};

  const parsed = CoreBodySchema.safeParse(body);
  if (!parsed.success) return "invalid_payload";

  const billingEmailHint =
    typeof fieldRecord.billingEmail === "string" ? fieldRecord.billingEmail : undefined;

  return {
    data: parsed.data,
    billingEmailHint,
    inlineAudio: null,
    referenceFile: null,
    adaptiveNotes: normalizeAdaptiveNotes(fieldRecord),
    referenceArtist: normalizeReferenceArtist(fieldRecord)
  };
}

async function resolveReferenceAnalysis(referenceFile: File, jobId: string, analyzeForAdaptive: AdaptiveTrackAnalyzer) {
  const filename = referenceFile.name || "reference";
  const ext = filename.split(".").pop()?.toLowerCase() ?? "";
  const mimeAccepted = ACCEPTED_MIME.has(referenceFile.type);
  const extAccepted = ACCEPTED_EXT.has(ext);
  if (!mimeAccepted && !extAccepted) {
    throw new Error("Reference track must be WAV or MP3.");
  }
  if (referenceFile.size > MAX_UPLOAD_FILE_SIZE_BYTES) {
    throw new Error(`Reference track exceeds ${MAX_UPLOAD_FILE_SIZE_LABEL}.`);
  }

  const normalizedExt = ext === "wav" || referenceFile.type.includes("wav") ? "wav" : "mp3";
  const buffer = Buffer.from(await referenceFile.arrayBuffer());
  const uploadRecord = await saveTempFile({
    data: buffer,
    extension: normalizedExt,
    kind: "upload",
    mime: normalizedExt === "wav" ? "audio/wav" : "audio/mpeg",
    jobId
  });
  const reference = await analyzeForAdaptive(uploadRecord.filePath);
  if (process.env.NODE_ENV !== "production") {
    console.log("[ADAPTIVE_ANALYSIS_DEBUG] reference", reference.diagnostics);
  }
  return reference.analysis;
}

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

    const parsedRequest = await parseMasterAiRequest(request);
    if (parsedRequest === "invalid_json") {
      const res = NextResponse.json({ error: "Expected JSON or multipart body." }, { status: 400 });
      attachSessionCookieIfNeeded(res, sessionPrep);
      return res;
    }
    if (parsedRequest === "invalid_payload") {
      const res = NextResponse.json({ error: "Invalid adaptive mastering request payload." }, { status: 400 });
      attachSessionCookieIfNeeded(res, sessionPrep);
      return res;
    }

    const { data: parsed, billingEmailHint, inlineAudio, referenceFile, adaptiveNotes, referenceArtist } = parsedRequest;

    const ownerEligible = isMasterAdminBypassGranted(request);
    const adaptiveAnalysisRouting = resolveAdaptiveAnalysisRouting({ ownerEligible });
    const analyzeForAdaptive = createAdaptiveTrackAnalyzer(adaptiveAnalysisRouting);

    const billingResolution = resolveEntitlementBillingContext(request, user, { billingEmailHint });

    const entitlements = await getEntitlementsForUser(user, billingResolution.billingContext);

    await cleanupExpiredTempFiles();

    const jobId = createJobId("adaptive");
    const sourceAudio = await resolveAdaptiveSourceAudio({
      inlineAudio,
      fileId: parsed.standardMasterFileId,
      jobId: parsed.standardMasterJobId,
      inlineJobId: jobId
    });
    if (!sourceAudio.ok) {
      const res = NextResponse.json({ error: sourceAudio.error, code: sourceAudio.code }, { status: sourceAudio.status });
      attachSessionCookieIfNeeded(res, sessionPrep);
      return res;
    }

    logMasteringFunnelEvent("mastering_preview_api_started", {
      source_component: "api_master_ai",
      job_id: jobId,
      mastering_mode: "adaptive",
      normalized_email: normalizeEmailForFunnelLog(billingResolution.normalizedEmail),
      ...masteringFunnelBillingSnapshot(entitlements)
    });
    const outputQuality = resolveEncodeOutputQuality(
      entitlements.quality,
      billingResolution.emailSource,
      billingResolution.normalizedEmail,
      {
        planIdBeforeOverride: entitlements.planId,
        billingEmailHint,
        adminOverrideAllowed: billingResolution.adminOverrideAllowed
      }
    );
    const outputCodec = resolveCodecForQuality(outputQuality);
    const deliveryCodec = resolveCodecForQuality(entitlements.quality);
    console.log(`[adaptive-mastering] outputQuality=${outputQuality}`);
    console.log(`[adaptive-mastering] outputCodec=${outputCodec}`);
    logWavExportEntitlementResolution({
      endpoint: "/api/master-ai",
      jobId,
      userId: user.id,
      normalizedEmail: billingResolution.normalizedEmail,
      emailSource: billingResolution.emailSource,
      planId: entitlements.planId,
      outputQuality,
      outputCodec,
      adminOverrideGranted: billingResolution.adminOverrideGranted
    });
    if (process.env.NODE_ENV !== "production") {
      console.log("[MASTER_AI_DEBUG] trusted_identity_quality_resolution", {
        jobId,
        normalizedEmail: billingResolution.normalizedEmail,
        emailSource: billingResolution.emailSource,
        adminOverrideAllowed: billingResolution.adminOverrideAllowed,
        adminOverrideGranted: billingResolution.adminOverrideGranted,
        planId: entitlements.planId,
        outputQuality,
        outputCodec
      });
      console.log("[ADAPTIVE_ANALYSIS_DEBUG] route", adaptiveAnalysisRouting);
    }
    console.log("[master-ai] adaptive_preview:start", {
      standardJobId: parsed.standardMasterJobId,
      adaptiveJobId: jobId,
      sourceResolvedBy: sourceAudio.resolvedBy,
      sourceJobId: sourceAudio.source.jobId,
      hasReferenceTrack: Boolean(referenceFile)
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
    let referenceAnalysis: Awaited<ReturnType<typeof analyzeTrack>> | undefined;
    if (referenceFile) {
      try {
        referenceAnalysis = await resolveReferenceAnalysis(referenceFile, jobId, analyzeForAdaptive);
      } catch (referenceError) {
        logApiError("master-ai", API_ERROR_CODES.trackAnalysisFailed, referenceError, { jobId }, "warn");
      }
    }

    const userIntent = combineAdaptiveUserIntent(adaptiveNotes || undefined, referenceArtist);

    const restorationFeatureConfig = resolveAiAudioRestorationFeatureConfig();
    const restorationOwnerAuthorized = ownerEligible;
    const restorationAuthorized = isAiAudioRestorationAuthorized({
      config: restorationFeatureConfig,
      ownerAuthorized: restorationOwnerAuthorized
    });
    const restorationRequested = parsed.applyAudioRestoration === true;
    let selectedRestorationStrength: AudioRestorationStrength =
      isAudioRestorationStrength(parsed.audioRestorationStrength) ? parsed.audioRestorationStrength : "balanced";
    // Fail-open: assessment/restoration errors must never block Adaptive Mastering.
    let restorationProfile: Awaited<ReturnType<typeof assessAudioArtifacts>> | null = null;
    if (restorationAuthorized) {
      try {
        restorationProfile = await assessAudioArtifacts(sourceAudio.record.filePath);
      } catch (assessmentError) {
        if (process.env.NODE_ENV !== "production") {
          console.warn(
            "[ai-audio-restoration] assessment unavailable:",
            assessmentError instanceof Error ? assessmentError.message : assessmentError
          );
        }
        restorationProfile = null;
      }
    }
    if (restorationProfile?.restorationRecommended && parsed.audioRestorationStrength === undefined) {
      selectedRestorationStrength = restorationProfile.recommendedStrength;
    }
    const shouldAttemptRestoration =
      restorationAuthorized && restorationProfile !== null && restorationRequested;
    let restorationResult: AudioRestorationResult | null = null;
    if (shouldAttemptRestoration && restorationProfile) {
      try {
        restorationResult = await runAudioArtifactRestoration({
          inputPath: sourceAudio.record.filePath,
          jobId,
          strength: selectedRestorationStrength,
          artifactProfile: restorationProfile,
          force: restorationRequested && !restorationProfile.restorationRecommended
        });
      } catch (restorationError) {
        if (process.env.NODE_ENV !== "production") {
          console.warn(
            "[ai-audio-restoration] processing unavailable:",
            restorationError instanceof Error ? restorationError.message : restorationError
          );
        }
        restorationResult = {
          attempted: true,
          applied: false,
          success: false,
          strength: selectedRestorationStrength,
          inputPath: sourceAudio.record.filePath,
          fallbackUsed: true,
          fallbackReason: "processing_error",
          modulesApplied: []
        };
      }
    }
    if (restorationResult?.success && restorationResult.outputPath) {
      try {
        await registerExistingFile({
          filePath: restorationResult.outputPath,
          kind: "restored",
          mime: "audio/wav",
          jobId
        });
      } catch (registerError) {
        // Keep restored intermediate usable; age-based temp cleanup covers orphans.
        if (process.env.NODE_ENV !== "production") {
          console.warn(
            "[ai-audio-restoration] restored temp registration failed:",
            registerError instanceof Error ? registerError.message : registerError
          );
        }
      }
    }
    const adaptiveSource =
      restorationAuthorized &&
      restorationResult?.success === true &&
      restorationResult.outputPath
        ? restorationResult.outputPath
        : sourceAudio.record.filePath;
    const selectedSource = adaptiveSource === sourceAudio.record.filePath ? "original_source" : "restored_source";
    const restorationFallbackReason =
      restorationResult?.fallbackReason ??
      (!restorationFeatureConfig.enabled
        ? "feature_disabled"
        : !restorationAuthorized
          ? "not_authorized"
          : !restorationRequested
            ? "not_requested"
            : "not_attempted");
    console.log("[ai-audio-restoration]", {
      featureEnabled: restorationFeatureConfig.enabled,
      ownerOnly: restorationFeatureConfig.ownerOnly,
      ownerAuthorized: restorationOwnerAuthorized,
      requested: restorationRequested,
      recommended: restorationProfile?.restorationRecommended ?? false,
      strength: selectedRestorationStrength,
      modules: restorationResult?.modulesApplied ?? [],
      success: restorationResult?.success ?? false,
      fallbackUsed: restorationResult?.fallbackUsed ?? selectedSource === "original_source",
      fallbackReason: selectedSource === "restored_source" ? null : restorationFallbackReason
    });
    console.log("[adaptive-mastering] selectedSource=" + selectedSource);

    const adaptive = await runAdaptiveMasteringPipeline({
      inputPath: adaptiveSource,
      jobId,
      genre: parsed.preset,
      loudnessMode: parsed.loudnessMode,
      userIntent,
      referenceAnalysis,
      outputQuality,
      analyzeForAdaptive
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
      ...(restorationAuthorized && restorationProfile
        ? {
            audioRestoration: {
              available: true,
              requested: restorationRequested,
              recommended: restorationProfile.restorationRecommended,
              strength: selectedRestorationStrength,
              artifactProfile: restorationProfile,
              result: sanitizeRestorationResultForResponse(
                restorationResult ?? {
                  attempted: false,
                  applied: false,
                  success: false,
                  strength: selectedRestorationStrength,
                  inputPath: sourceAudio.record.filePath,
                  fallbackUsed: true,
                  fallbackReason: restorationFallbackReason,
                  modulesApplied: []
                }
              ),
              selectedSource
            }
          }
        : {}),
      ...(process.env.NODE_ENV !== "production" ? { analysisDiagnostics: adaptive.analysisDiagnostics } : {}),
      ...(adaptive.adaptiveAiFallback === true &&
      adaptive.adaptiveAiFallbackReason &&
      adaptive.adaptiveAiFallbackMessage
        ? {
            adaptiveAiFallback: true as const,
            adaptiveAiFallbackReason: adaptive.adaptiveAiFallbackReason,
            adaptiveAiFallbackMessage: adaptive.adaptiveAiFallbackMessage
          }
        : {}),
      ...(adaptive.referenceTrackApplied ? { referenceTrackApplied: true as const } : {})
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
    logMasteringFunnelEvent("mastering_preview_api_succeeded", {
      source_component: "api_master_ai",
      job_id: jobId,
      file_id: adaptiveMasterRecord.id,
      mastering_mode: "adaptive",
      normalized_email: normalizeEmailForFunnelLog(billingResolution.normalizedEmail),
      export_quality: outputQuality,
      ...masteringFunnelBillingSnapshot(entitlements)
    });

    const response = NextResponse.json(payload);
    attachSessionCookieIfNeeded(response, sessionPrep);
    return response;
  } catch (error) {
    logMasteringFunnelEvent("mastering_preview_api_failed", {
      source_component: "api_master_ai",
      mastering_mode: "adaptive",
      error_code: error instanceof AdaptiveOpenAIError ? error.code : "adaptive_mastering_failed"
    });
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
          requestBodyPresent: Boolean(error.debug?.requestBody),
          openAiHttpStatus: error.debug?.openAiHttpStatus ?? null,
          openAiErrorPayloadPresent: Boolean(error.debug?.openAiErrorPayload)
        });
        console.error("[MASTER_AI_DEBUG] adaptive_503_failure_classification", error.code);
      }
      if (error.code === "timeout") {
        console.error("[master-ai] Unexpected AdaptiveOpenAI timeout at route boundary (should be handled in pipeline).");
        return apiErrorResponse({
          status: 500,
          code: API_ERROR_CODES.adaptiveMasteringUnexpected,
          message: "Adaptive preview failed unexpectedly. Please retry."
        });
      }
      if (!isAdaptiveMasteringOpenAiFatalError(error)) {
        return apiErrorResponse({
          status: 500,
          code: API_ERROR_CODES.adaptiveMasteringUnexpected,
          message: "Adaptive preview failed unexpectedly. Please retry."
        });
      }
      return apiErrorResponse({
        status: 503,
        code: API_ERROR_CODES.adaptiveAiUnavailable,
        message: "Adaptive AI decisions are currently unavailable. Please retry in a moment."
      });
    }
    logApiError("api/master-ai", API_ERROR_CODES.adaptiveMasteringFailed, error);
    return apiErrorResponse({
      status: 500,
      code: API_ERROR_CODES.adaptiveMasteringFailed,
      message: "Adaptive mastering failed. Please retry."
    });
  }
}
