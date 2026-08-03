import type {
  AudioArtifactProfile,
  AudioRestorationStrength
} from "@/lib/audio/audio-restoration-types";

export type PublicArtifactLevel = "Low" | "Moderate" | "High";

/** Public restoration choices (Light remains server-supported for compatibility). */
export type PublicRestorationChoice = "off" | "balanced" | "strong";

export type AudioRestorationPublicRecommendation = {
  artifactLevel: PublicArtifactLevel;
  restorationRecommended: boolean;
  /** Preselect for UI; never forces processing. */
  defaultChoice: PublicRestorationChoice;
  message: string;
};

/**
 * Map overall severity to a safe user-facing artifact level.
 * Thresholds align with the existing upload-form heuristic.
 */
export function resolvePublicArtifactLevel(overallSeverity: number): PublicArtifactLevel {
  if (!Number.isFinite(overallSeverity)) return "Low";
  if (overallSeverity >= 0.7) return "High";
  if (overallSeverity >= 0.45) return "Moderate";
  return "Low";
}

/** Public UI does not offer Light; map it to Balanced when recommending. */
export function toPublicRestorationStrength(
  strength: AudioRestorationStrength
): Exclude<PublicRestorationChoice, "off"> {
  if (strength === "strong") return "strong";
  return "balanced";
}

export function buildAudioRestorationPublicRecommendation(
  profile: Pick<AudioArtifactProfile, "overallSeverity" | "restorationRecommended" | "recommendedStrength">
): AudioRestorationPublicRecommendation {
  const artifactLevel = resolvePublicArtifactLevel(profile.overallSeverity);
  const restorationRecommended = profile.restorationRecommended === true;
  const defaultChoice: PublicRestorationChoice =
    restorationRecommended && (artifactLevel === "Moderate" || artifactLevel === "High")
      ? toPublicRestorationStrength(profile.recommendedStrength)
      : "off";

  const message = restorationRecommended
    ? "We detected audio characteristics that may benefit from AI Audio Restoration."
    : "No significant restoration issues detected.";

  return {
    artifactLevel,
    restorationRecommended,
    defaultChoice,
    message
  };
}
