import type { LoudnessMode } from "@/lib/genre-presets";

export type MasteringAnalyticsContext = {
  genre: string;
  genre_preset: string;
  loudness_mode: string;
  mastering_mode: string;
  selected_preset: string;
  selected_style: string;
  target_lufs: number | null;
};

type BuildMasteringAnalyticsContextInput = {
  genreKey?: string;
  genrePresetLabel?: string;
  loudnessMode?: LoudnessMode | string;
  masteringMode?: string;
  selectedPreset?: string;
  selectedStyle?: string;
  targetLufs?: number | null;
};

function normalizeValue(value: string | undefined | null): string {
  if (!value) return "unknown";
  const normalized = value
    .trim()
    .toLowerCase()
    .replace(/[\/\s]+/g, "_")
    .replace(/[^a-z0-9_]/g, "")
    .replace(/_+/g, "_")
    .replace(/^_+|_+$/g, "");
  return normalized || "unknown";
}

export function buildMasteringAnalyticsContext(
  input: BuildMasteringAnalyticsContextInput
): MasteringAnalyticsContext {
  return {
    genre: normalizeValue(input.genreKey),
    genre_preset: normalizeValue(input.genrePresetLabel),
    loudness_mode: normalizeValue(input.loudnessMode),
    mastering_mode: normalizeValue(input.masteringMode),
    selected_preset: normalizeValue(input.selectedPreset),
    selected_style: normalizeValue(input.selectedStyle),
    target_lufs: typeof input.targetLufs === "number" && Number.isFinite(input.targetLufs) ? input.targetLufs : null
  };
}
