import { assessAudioArtifacts } from "@/lib/audio/audio-artifact-assessment";
import { runAudioArtifactRestoration } from "@/lib/audio/audio-restoration";
import {
  isAudioRestorationStrength,
  type AudioArtifactProfile,
  type AudioRestorationResult,
  type AudioRestorationStrength
} from "@/lib/audio/audio-restoration-types";
import type { AiAudioRestorationFeatureConfig } from "@/lib/features/ai-audio-restoration";
import { registerExistingFile } from "@/lib/storage/temp-files";

export type MasteringSelectedSource = "original_source" | "restored_source";

export type ResolveMasteringSourceWithRestorationParams = {
  originalPath: string;
  jobId: string;
  featureConfig: AiAudioRestorationFeatureConfig;
  restorationAuthorized: boolean;
  ownerAuthorized: boolean;
  /** True when the user asked for restoration (Balanced/Strong). */
  restorationRequested: boolean;
  requestedStrength?: unknown;
  workflowLogTag: "preset-mastering" | "adaptive-mastering";
};

export type ResolveMasteringSourceWithRestorationResult = {
  selectedPath: string;
  selectedSource: MasteringSelectedSource;
  profile: AudioArtifactProfile | null;
  result: AudioRestorationResult | null;
  strength: AudioRestorationStrength;
  fallbackReason: string | null;
};

function resolveStrength(
  requestedStrength: unknown,
  profile: AudioArtifactProfile | null
): AudioRestorationStrength {
  if (isAudioRestorationStrength(requestedStrength)) return requestedStrength;
  if (profile?.restorationRecommended) return profile.recommendedStrength;
  return "balanced";
}

/**
 * Shared pre-mastering path:
 * assess artifacts → optional restore once → selectedSource for preset or Adaptive.
 *
 * Fail-open: assessment/restoration errors never block mastering.
 * Restoration runs at most once per call (caller must not invoke twice).
 */
export async function resolveMasteringSourceWithRestoration(
  params: ResolveMasteringSourceWithRestorationParams
): Promise<ResolveMasteringSourceWithRestorationResult> {
  const {
    originalPath,
    jobId,
    featureConfig,
    restorationAuthorized,
    ownerAuthorized,
    restorationRequested,
    requestedStrength,
    workflowLogTag
  } = params;

  let profile: AudioArtifactProfile | null = null;
  if (restorationAuthorized) {
    try {
      profile = await assessAudioArtifacts(originalPath);
    } catch (assessmentError) {
      if (process.env.NODE_ENV !== "production") {
        console.warn(
          "[ai-audio-restoration] assessment unavailable:",
          assessmentError instanceof Error ? assessmentError.message : assessmentError
        );
      }
      profile = null;
    }
  }

  const strength = resolveStrength(requestedStrength, profile);
  const shouldAttempt = restorationAuthorized && profile !== null && restorationRequested;

  let result: AudioRestorationResult | null = null;
  if (shouldAttempt && profile) {
    try {
      result = await runAudioArtifactRestoration({
        inputPath: originalPath,
        jobId,
        strength,
        artifactProfile: profile,
        force: restorationRequested && !profile.restorationRecommended
      });
    } catch (restorationError) {
      if (process.env.NODE_ENV !== "production") {
        console.warn(
          "[ai-audio-restoration] processing unavailable:",
          restorationError instanceof Error ? restorationError.message : restorationError
        );
      }
      result = {
        attempted: true,
        applied: false,
        success: false,
        strength,
        inputPath: originalPath,
        fallbackUsed: true,
        fallbackReason: "processing_error",
        modulesApplied: []
      };
    }
  }

  if (result?.success && result.outputPath) {
    try {
      await registerExistingFile({
        filePath: result.outputPath,
        kind: "restored",
        mime: "audio/wav",
        jobId
      });
    } catch (registerError) {
      if (process.env.NODE_ENV !== "production") {
        console.warn(
          "[ai-audio-restoration] restored temp registration failed:",
          registerError instanceof Error ? registerError.message : registerError
        );
      }
    }
  }

  const selectedPath =
    restorationAuthorized && result?.success === true && result.outputPath
      ? result.outputPath
      : originalPath;
  const selectedSource: MasteringSelectedSource =
    selectedPath === originalPath ? "original_source" : "restored_source";

  const fallbackReason =
    selectedSource === "restored_source"
      ? null
      : result?.fallbackReason ??
        (!featureConfig.enabled
          ? "feature_disabled"
          : !restorationAuthorized
            ? "not_authorized"
            : !restorationRequested
              ? "not_requested"
              : "not_attempted");

  console.log("[ai-audio-restoration]", {
    featureEnabled: featureConfig.enabled,
    ownerOnly: featureConfig.ownerOnly,
    authorized: restorationAuthorized,
    ownerAuthorized,
    requested: restorationRequested,
    recommended: profile?.restorationRecommended ?? false,
    strength,
    modules: result?.modulesApplied ?? [],
    success: result?.success ?? false,
    fallbackUsed: result?.fallbackUsed ?? selectedSource === "original_source",
    fallbackReason
  });
  console.log(`[${workflowLogTag}] selectedSource=${selectedSource}`);

  return {
    selectedPath,
    selectedSource,
    profile,
    result,
    strength,
    fallbackReason
  };
}

export function sanitizeRestorationResultForResponse(
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
