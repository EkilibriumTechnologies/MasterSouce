/**
 * Playback-only loudness-match math for Original vs Master comparison.
 *
 * Uses measured integrated LUFS already returned by mastering analysis.
 * Does not estimate loudness, invent LUFS, or rewrite audio files.
 */

export const LOUDNESS_MATCH_DEFAULT_ENABLED = true;

/** Ignore implausible analysis outliers rather than applying extreme monitor gain. */
export const MAX_ABS_COMPENSATION_DB = 24;

export type LoudnessMatchInput = {
  originalLufs: number | null | undefined;
  masteredLufs: number | null | undefined;
  enabled: boolean;
};

export type LoudnessMatchGains = {
  originalGainDb: number;
  masteredGainDb: number;
  originalLinear: number;
  masteredLinear: number;
  compensationAvailable: boolean;
  applied: boolean;
};

export function asFiniteLufs(value: number | null | undefined): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

export function dbToLinearGain(gainDb: number): number {
  if (!Number.isFinite(gainDb)) return 1;
  const linear = 10 ** (gainDb / 20);
  if (!Number.isFinite(linear) || linear < 0) return 1;
  return Math.min(1, linear);
}

function clampCompensationDb(gainDb: number): number {
  if (!Number.isFinite(gainDb)) return 0;
  return Math.max(-MAX_ABS_COMPENSATION_DB, Math.min(0, gainDb));
}

const UNITY: LoudnessMatchGains = {
  originalGainDb: 0,
  masteredGainDb: 0,
  originalLinear: 1,
  masteredLinear: 1,
  compensationAvailable: false,
  applied: false
};

/**
 * Match both sources to the quieter measured loudness (never boost).
 *
 * Equivalent to `gainDifferenceDb = originalLufs - masteredLufs`, then applying
 * that delta only as attenuation on the louder source:
 *
 * - If the master is louder, master gain = originalLufs - masteredLufs (negative).
 * - If the original is louder, original gain = masteredLufs - originalLufs (negative).
 *
 * Matching the quieter source avoids digital clipping from monitor boost.
 * Shared extra attenuation is unnecessary because neither gain is positive.
 */
export function computeLoudnessMatchGains(input: LoudnessMatchInput): LoudnessMatchGains {
  const originalLufs = asFiniteLufs(input.originalLufs);
  const masteredLufs = asFiniteLufs(input.masteredLufs);
  const compensationAvailable = originalLufs !== null && masteredLufs !== null;

  if (!input.enabled || !compensationAvailable) {
    return {
      ...UNITY,
      compensationAvailable,
      applied: false
    };
  }

  const quieterLufs = Math.min(originalLufs, masteredLufs);
  const originalGainDb = clampCompensationDb(quieterLufs - originalLufs);
  const masteredGainDb = clampCompensationDb(quieterLufs - masteredLufs);

  return {
    originalGainDb,
    masteredGainDb,
    originalLinear: dbToLinearGain(originalGainDb),
    masteredLinear: dbToLinearGain(masteredGainDb),
    compensationAvailable: true,
    applied: true
  };
}
