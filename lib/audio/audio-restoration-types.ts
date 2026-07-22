export type AudioRestorationStrength = "light" | "balanced" | "strong";

export type AudioArtifactProfile = {
  version: "v1";
  metallicHarshness: number;
  highFrequencySmear: number;
  transientSoftness: number;
  stereoInstability: number;
  sibilanceHarshness: number;
  codecLikeResidue: number;
  overallSeverity: number;
  recommendedStrength: AudioRestorationStrength;
  restorationRecommended: boolean;
};

export type AudioRestorationResult = {
  attempted: boolean;
  applied: boolean;
  success: boolean;
  strength: AudioRestorationStrength;
  inputPath: string;
  outputPath?: string;
  fallbackUsed: boolean;
  fallbackReason?: string;
  modulesApplied: string[];
  processingTimeMs?: number;
};

export const AUDIO_RESTORATION_STRENGTHS: readonly AudioRestorationStrength[] = [
  "light",
  "balanced",
  "strong"
] as const;

export function isAudioRestorationStrength(value: unknown): value is AudioRestorationStrength {
  return (
    typeof value === "string" &&
    (AUDIO_RESTORATION_STRENGTHS as readonly string[]).includes(value)
  );
}
