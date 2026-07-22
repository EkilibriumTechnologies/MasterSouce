import type { PlanQuality } from "@/lib/subscriptions/types";

export type WavOutputCodec = "pcm_s16le" | "pcm_s24le" | "pcm_f32le";

/**
 * Fallback export rate when the source rate is missing or nonstandard.
 * Adaptive Mastering still forces this rate; preset mastering preserves the source when possible.
 */
export const WAV_EXPORT_SAMPLE_RATE = 44100;

/** Fixed stereo export layout used by the mastering pipelines. */
export const WAV_EXPORT_CHANNELS = 2;

/** Production rates preserved as-is by preset mastering / codec remux (no forced downsample). */
const PRESERVED_EXPORT_SAMPLE_RATES = new Set([44100, 48000, 88200, 96000, 176400, 192000]);

/**
 * Resolves the WAV mux sample rate.
 * Preserves common source rates; falls back to 44.1 kHz only for unknown/nonstandard rates.
 */
export function resolveExportSampleRate(sourceSampleRateHz: number | null | undefined): number {
  if (
    typeof sourceSampleRateHz === "number" &&
    Number.isFinite(sourceSampleRateHz) &&
    PRESERVED_EXPORT_SAMPLE_RATES.has(Math.round(sourceSampleRateHz))
  ) {
    return Math.round(sourceSampleRateHz);
  }
  return WAV_EXPORT_SAMPLE_RATE;
}

/**
 * Rollback / staging switch for paid 24-bit WAV delivery.
 * Plan tiers still map quality in entitlements; this only gates pcm_s24le encoding.
 */
export function is24BitWavExportEnabled(): boolean {
  const raw = process.env.ENABLE_24_BIT_WAV_EXPORT?.trim();
  if (!raw) return true;
  return raw === "1" || raw.toLowerCase() === "true";
}

/**
 * Maps subscription quality to FFmpeg PCM codec for the final WAV mux step only.
 * Does not alter mastering filters, loudness, or limiter behavior.
 */
export function resolveCodecForQuality(quality: PlanQuality): WavOutputCodec {
  if (quality === "32bit_float") return "pcm_f32le";
  if (quality === "24bit") {
    return is24BitWavExportEnabled() ? "pcm_s24le" : "pcm_s16le";
  }
  return "pcm_s16le";
}
