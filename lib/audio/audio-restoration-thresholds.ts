import type {
  AudioArtifactProfile,
  AudioRestorationStrength
} from "@/lib/audio/audio-restoration-types";

/**
 * Audio Artifact Restoration V1 tuning values.
 *
 * These are conservative initial defaults selected to avoid processing clean
 * uploads. They must be benchmarked against real tracks before broader rollout.
 */
export const AUDIO_RESTORATION_THRESHOLDS = {
  artifact: {
    metallicHarshness: 0.56,
    highFrequencySmear: 0.58,
    transientSoftness: 0.62,
    stereoInstability: 0.64,
    sibilanceHarshness: 0.56,
    codecLikeResidue: 0.6
  },
  recommendation: {
    // Conservative V1 heuristic pending benchmark calibration.
    overallSeverity: 0.52,
    minimumStrongMetric: 0.72,
    strongOverallSeverity: 0.72
  },
  amount: {
    light: {
      resonanceCutDb: -0.8,
      highShelfDb: -0.45,
      deEssIntensity: 0.12,
      transientRatio: 1.12,
      stereoMultiplier: 0.98,
      denoiseNr: 2.5
    },
    balanced: {
      resonanceCutDb: -1.25,
      highShelfDb: -0.75,
      deEssIntensity: 0.2,
      transientRatio: 1.2,
      stereoMultiplier: 0.96,
      denoiseNr: 4
    },
    strong: {
      resonanceCutDb: -1.8,
      highShelfDb: -1.05,
      deEssIntensity: 0.3,
      transientRatio: 1.32,
      stereoMultiplier: 0.94,
      denoiseNr: 6
    }
  }
} as const;

export function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(1, Number(value.toFixed(4))));
}

export function exceedsAudioRestorationThreshold(
  value: number,
  threshold: number
): boolean {
  return clamp01(value) >= threshold;
}

export function selectAudioRestorationStrength(
  overallSeverity: number,
  strongestMetric: number
): AudioRestorationStrength {
  const severity = clamp01(overallSeverity);
  const strongest = clamp01(strongestMetric);
  if (
    severity >= AUDIO_RESTORATION_THRESHOLDS.recommendation.strongOverallSeverity ||
    strongest >= AUDIO_RESTORATION_THRESHOLDS.recommendation.minimumStrongMetric
  ) {
    return "strong";
  }
  if (severity >= AUDIO_RESTORATION_THRESHOLDS.recommendation.overallSeverity) {
    return "balanced";
  }
  return "light";
}

export function shouldRecommendAudioRestoration(profile: Pick<AudioArtifactProfile, "overallSeverity">): boolean {
  return exceedsAudioRestorationThreshold(
    profile.overallSeverity,
    AUDIO_RESTORATION_THRESHOLDS.recommendation.overallSeverity
  );
}
