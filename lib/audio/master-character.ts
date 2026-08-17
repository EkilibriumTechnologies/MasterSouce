/**
 * Optional Master Character bias for Adaptive Mastering.
 *
 * Character operates on Adaptive Instruction settings AFTER analysis/decisions
 * (and optional reference guidance). It never replaces Adaptive generation and
 * never introduces new DSP processors.
 *
 * Recommended = identity (zero bias).
 */

import type { AdaptiveStereoIntent } from "@/lib/audio/adaptive-stereo-width";
import { STRONG_LOW_END_DB } from "@/lib/audio/mastering-decision-report";

export const MASTER_CHARACTERS = [
  "recommended",
  "punchier",
  "warmer",
  "more_open",
  "more_dynamic",
  "more_aggressive"
] as const;

export type MasterCharacter = (typeof MASTER_CHARACTERS)[number];

export const DEFAULT_MASTER_CHARACTER: MasterCharacter = "recommended";

/**
 * Structural match of AdaptiveInstructionSettings.
 * Kept local to avoid circular imports with the Adaptive pipeline.
 */
export type MasterCharacterSettings = {
  eqDirection: {
    lowEnd: number;
    lowMid: number;
    presence: number;
    air: number;
  };
  compressionIntensity: "light" | "medium" | "strong";
  saturationAmount: number;
  stereoWidth: number;
  targetLufs: number;
  limiterCeilingDb: number;
  transientHandling: "preserve" | "balanced" | "tight";
  vocalPresenceEmphasis: number;
};

/**
 * Maximum permitted deviations from the Adaptive recommendation.
 * Absolute Adaptive clamps still apply after bias.
 */
export const MASTER_CHARACTER_LIMITS = {
  eqDb: 0.45,
  saturation: 0.12,
  stereoWidth: 0.06,
  targetLufs: 0.45,
  compressionSteps: 1,
  transientSteps: 1
} as const;

/** Absolute Adaptive DSP clamps — Character must remain inside these. */
export const ADAPTIVE_SETTING_BOUNDS = {
  eqDb: { min: -2.2, max: 2.2 },
  saturationAmount: { min: 0, max: 1 },
  stereoWidth: { min: 0.35, max: 1.2 },
  targetLufs: { min: -14, max: -8.8 },
  limiterCeilingDb: { min: -2, max: -0.1 },
  vocalPresenceEmphasis: { min: -1.5, max: 2 }
} as const;

const COMPRESSION_ORDER = ["light", "medium", "strong"] as const;
const TRANSIENT_ORDER = ["tight", "balanced", "preserve"] as const;

export type MasterCharacterContext = {
  alreadyLimited?: boolean;
  /** Pre-master low-end band energy above the existing strong-low-end threshold. */
  strongLowEnd?: boolean;
  /** Adaptive low-end EQ decision before Character (negative = protective cut). */
  adaptiveLowEndEqDb?: number;
  stereoIntent?: AdaptiveStereoIntent;
};

export type MasterCharacterBiasApplied = {
  character: MasterCharacter;
  eqDirection?: Partial<MasterCharacterSettings["eqDirection"]>;
  compressionIntensity?: MasterCharacterSettings["compressionIntensity"];
  saturationAmount?: number;
  stereoWidth?: number;
  targetLufs?: number;
  transientHandling?: MasterCharacterSettings["transientHandling"];
  /** Always false — Character must never move the limiter ceiling. */
  limiterCeilingDbChanged: false;
};

export type ApplyMasterCharacterResult = {
  character: MasterCharacter;
  settings: MasterCharacterSettings;
  biasApplied: MasterCharacterBiasApplied;
};

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function round2(value: number): number {
  return Number(value.toFixed(2));
}

export function isMasterCharacter(value: unknown): value is MasterCharacter {
  return typeof value === "string" && (MASTER_CHARACTERS as readonly string[]).includes(value);
}

/**
 * Strict server-side Character parse.
 * Missing / empty / unknown values safely resolve to Recommended.
 * Never accepts arbitrary DSP parameters.
 */
export function parseMasterCharacter(value: unknown): MasterCharacter {
  if (typeof value !== "string") return DEFAULT_MASTER_CHARACTER;
  const normalized = value.trim().toLowerCase().replace(/[\s-]+/g, "_");
  if (!normalized) return DEFAULT_MASTER_CHARACTER;
  if (isMasterCharacter(normalized)) return normalized;
  return DEFAULT_MASTER_CHARACTER;
}

export function cloneMasterCharacterSettings(
  settings: MasterCharacterSettings
): MasterCharacterSettings {
  return {
    eqDirection: { ...settings.eqDirection },
    compressionIntensity: settings.compressionIntensity,
    saturationAmount: settings.saturationAmount,
    stereoWidth: settings.stereoWidth,
    targetLufs: settings.targetLufs,
    limiterCeilingDb: settings.limiterCeilingDb,
    transientHandling: settings.transientHandling,
    vocalPresenceEmphasis: settings.vocalPresenceEmphasis
  };
}

export function masterCharacterSettingsEqual(
  a: MasterCharacterSettings,
  b: MasterCharacterSettings
): boolean {
  return (
    a.eqDirection.lowEnd === b.eqDirection.lowEnd &&
    a.eqDirection.lowMid === b.eqDirection.lowMid &&
    a.eqDirection.presence === b.eqDirection.presence &&
    a.eqDirection.air === b.eqDirection.air &&
    a.compressionIntensity === b.compressionIntensity &&
    a.saturationAmount === b.saturationAmount &&
    a.stereoWidth === b.stereoWidth &&
    a.targetLufs === b.targetLufs &&
    a.limiterCeilingDb === b.limiterCeilingDb &&
    a.transientHandling === b.transientHandling &&
    a.vocalPresenceEmphasis === b.vocalPresenceEmphasis
  );
}

function applyBoundedDelta(
  base: number,
  proposedDelta: number,
  maxAbsDelta: number,
  min: number,
  max: number
): number {
  const delta = clamp(proposedDelta, -maxAbsDelta, maxAbsDelta);
  return round2(clamp(base + delta, min, max));
}

function stepCompression(
  current: MasterCharacterSettings["compressionIntensity"],
  direction: -1 | 1,
  maxSteps: number = MASTER_CHARACTER_LIMITS.compressionSteps
): MasterCharacterSettings["compressionIntensity"] {
  const index = COMPRESSION_ORDER.indexOf(current);
  const next = clamp(index + direction * maxSteps, 0, COMPRESSION_ORDER.length - 1);
  return COMPRESSION_ORDER[next]!;
}

function stepTransient(
  current: MasterCharacterSettings["transientHandling"],
  directionTowardPreserve: -1 | 1,
  maxSteps: number = MASTER_CHARACTER_LIMITS.transientSteps
): MasterCharacterSettings["transientHandling"] {
  const index = TRANSIENT_ORDER.indexOf(current);
  const next = clamp(index + directionTowardPreserve * maxSteps, 0, TRANSIENT_ORDER.length - 1);
  return TRANSIENT_ORDER[next]!;
}

export function buildMasterCharacterContext(params: {
  alreadyLimited?: boolean | null;
  lowEndDb?: number | null;
  adaptiveLowEndEqDb?: number | null;
  stereoIntent?: AdaptiveStereoIntent;
}): MasterCharacterContext {
  const lowEndDb = params.lowEndDb;
  return {
    alreadyLimited: params.alreadyLimited === true,
    strongLowEnd: typeof lowEndDb === "number" && Number.isFinite(lowEndDb) && lowEndDb > STRONG_LOW_END_DB,
    adaptiveLowEndEqDb:
      typeof params.adaptiveLowEndEqDb === "number" && Number.isFinite(params.adaptiveLowEndEqDb)
        ? params.adaptiveLowEndEqDb
        : undefined,
    stereoIntent: params.stereoIntent
  };
}

function emptyBias(character: MasterCharacter): MasterCharacterBiasApplied {
  return { character, limiterCeilingDbChanged: false };
}

function applyPunchier(
  base: MasterCharacterSettings,
  next: MasterCharacterSettings,
  bias: MasterCharacterBiasApplied,
  context: MasterCharacterContext
): void {
  // Prefer transient preservation for impact — do not raise loudness to fake punch.
  const transient = stepTransient(base.transientHandling, 1);
  if (transient !== base.transientHandling) {
    next.transientHandling = transient;
    bias.transientHandling = transient;
  }

  // If Adaptive already pushed strong compression, ease one step unless the source is already limited.
  if (!context.alreadyLimited && base.compressionIntensity === "strong") {
    const compression = stepCompression(base.compressionIntensity, -1);
    if (compression !== base.compressionIntensity) {
      next.compressionIntensity = compression;
      bias.compressionIntensity = compression;
    }
  }
}

function applyWarmer(
  base: MasterCharacterSettings,
  next: MasterCharacterSettings,
  bias: MasterCharacterBiasApplied,
  context: MasterCharacterContext
): void {
  // Subtle low-mid warmth — never blind bass boost; never reverse protective low-end cuts.
  const protectiveLowEnd =
    context.strongLowEnd === true ||
    (typeof context.adaptiveLowEndEqDb === "number" && context.adaptiveLowEndEqDb < -0.1) ||
    base.eqDirection.lowEnd < -0.1;

  const lowMid = applyBoundedDelta(
    base.eqDirection.lowMid,
    protectiveLowEnd ? 0.25 : 0.35,
    MASTER_CHARACTER_LIMITS.eqDb,
    ADAPTIVE_SETTING_BOUNDS.eqDb.min,
    ADAPTIVE_SETTING_BOUNDS.eqDb.max
  );
  if (lowMid !== base.eqDirection.lowMid) {
    next.eqDirection.lowMid = lowMid;
    bias.eqDirection = { ...(bias.eqDirection ?? {}), lowMid };
  }

  // Slightly less air reads warmer without inventing saturation processors.
  const air = applyBoundedDelta(
    base.eqDirection.air,
    -0.25,
    MASTER_CHARACTER_LIMITS.eqDb,
    ADAPTIVE_SETTING_BOUNDS.eqDb.min,
    ADAPTIVE_SETTING_BOUNDS.eqDb.max
  );
  if (air !== base.eqDirection.air) {
    next.eqDirection.air = air;
    bias.eqDirection = { ...(bias.eqDirection ?? {}), air };
  }

  // Existing Adaptive saturation (asoftclip) only — small bounded bump.
  if (base.saturationAmount > 0 || !protectiveLowEnd) {
    const saturation = applyBoundedDelta(
      base.saturationAmount,
      0.1,
      MASTER_CHARACTER_LIMITS.saturation,
      ADAPTIVE_SETTING_BOUNDS.saturationAmount.min,
      ADAPTIVE_SETTING_BOUNDS.saturationAmount.max
    );
    if (saturation !== base.saturationAmount) {
      next.saturationAmount = saturation;
      bias.saturationAmount = saturation;
    }
  }

  // Explicitly never boost lowEnd when Adaptive protected / source is already strong.
  // Even when not protective, Warmer does not touch lowEnd (avoids mud / bass inflation).
}

function applyMoreOpen(
  base: MasterCharacterSettings,
  next: MasterCharacterSettings,
  bias: MasterCharacterBiasApplied,
  context: MasterCharacterContext
): void {
  const air = applyBoundedDelta(
    base.eqDirection.air,
    0.35,
    MASTER_CHARACTER_LIMITS.eqDb,
    ADAPTIVE_SETTING_BOUNDS.eqDb.min,
    ADAPTIVE_SETTING_BOUNDS.eqDb.max
  );
  if (air !== base.eqDirection.air) {
    next.eqDirection.air = air;
    bias.eqDirection = { ...(bias.eqDirection ?? {}), air };
  }

  const intent = context.stereoIntent ?? "unspecified";
  const widthUnsafe =
    intent === "mono" || intent === "narrower" || intent === "preserve" || base.stereoWidth < 0.96;

  if (!widthUnsafe) {
    const stereoWidth = applyBoundedDelta(
      base.stereoWidth,
      0.05,
      MASTER_CHARACTER_LIMITS.stereoWidth,
      ADAPTIVE_SETTING_BOUNDS.stereoWidth.min,
      ADAPTIVE_SETTING_BOUNDS.stereoWidth.max
    );
    if (stereoWidth !== base.stereoWidth) {
      next.stereoWidth = stereoWidth;
      bias.stereoWidth = stereoWidth;
    }
  }
}

function applyMoreDynamic(
  base: MasterCharacterSettings,
  next: MasterCharacterSettings,
  bias: MasterCharacterBiasApplied
): void {
  const compression = stepCompression(base.compressionIntensity, -1);
  if (compression !== base.compressionIntensity) {
    next.compressionIntensity = compression;
    bias.compressionIntensity = compression;
  }

  const transient = stepTransient(base.transientHandling, 1);
  if (transient !== base.transientHandling) {
    next.transientHandling = transient;
    bias.transientHandling = transient;
  }

  // Slightly lower loudness target — still a finished master (limiter unchanged).
  const targetLufs = applyBoundedDelta(
    base.targetLufs,
    -0.35,
    MASTER_CHARACTER_LIMITS.targetLufs,
    ADAPTIVE_SETTING_BOUNDS.targetLufs.min,
    ADAPTIVE_SETTING_BOUNDS.targetLufs.max
  );
  if (targetLufs !== base.targetLufs) {
    next.targetLufs = targetLufs;
    bias.targetLufs = targetLufs;
  }
}

function applyMoreAggressive(
  base: MasterCharacterSettings,
  next: MasterCharacterSettings,
  bias: MasterCharacterBiasApplied,
  context: MasterCharacterContext
): void {
  // Already-compressed / limited sources: do not crush further.
  if (!context.alreadyLimited) {
    const compression = stepCompression(base.compressionIntensity, 1);
    if (compression !== base.compressionIntensity) {
      next.compressionIntensity = compression;
      bias.compressionIntensity = compression;
    }

    const transient = stepTransient(base.transientHandling, -1);
    if (transient !== base.transientHandling) {
      next.transientHandling = transient;
      bias.transientHandling = transient;
    }

    const targetLufs = applyBoundedDelta(
      base.targetLufs,
      0.4,
      MASTER_CHARACTER_LIMITS.targetLufs,
      ADAPTIVE_SETTING_BOUNDS.targetLufs.min,
      ADAPTIVE_SETTING_BOUNDS.targetLufs.max
    );
    if (targetLufs !== base.targetLufs) {
      next.targetLufs = targetLufs;
      bias.targetLufs = targetLufs;
    }
  }

  // limiterCeilingDb intentionally untouched — safety remains authoritative.
}

/**
 * Apply a bounded Character bias on top of Adaptive settings.
 * Recommended returns a deep clone with zero bias.
 */
export function applyMasterCharacter(
  adaptiveSettings: MasterCharacterSettings,
  characterInput: MasterCharacter | string | null | undefined = DEFAULT_MASTER_CHARACTER,
  context: MasterCharacterContext = {}
): ApplyMasterCharacterResult {
  const character = parseMasterCharacter(characterInput);
  const base = cloneMasterCharacterSettings(adaptiveSettings);
  const next = cloneMasterCharacterSettings(base);
  const biasApplied = emptyBias(character);

  if (character === "recommended") {
    return { character, settings: next, biasApplied };
  }

  if (character === "punchier") {
    applyPunchier(base, next, biasApplied, context);
  } else if (character === "warmer") {
    applyWarmer(base, next, biasApplied, context);
  } else if (character === "more_open") {
    applyMoreOpen(base, next, biasApplied, context);
  } else if (character === "more_dynamic") {
    applyMoreDynamic(base, next, biasApplied);
  } else if (character === "more_aggressive") {
    applyMoreAggressive(base, next, biasApplied, context);
  }

  // Hard safety: Character may never move peak/limiter protection.
  next.limiterCeilingDb = base.limiterCeilingDb;
  biasApplied.limiterCeilingDbChanged = false;

  // Re-assert absolute Adaptive clamps on numeric fields Character may touch.
  next.eqDirection.lowEnd = clamp(
    next.eqDirection.lowEnd,
    ADAPTIVE_SETTING_BOUNDS.eqDb.min,
    ADAPTIVE_SETTING_BOUNDS.eqDb.max
  );
  next.eqDirection.lowMid = clamp(
    next.eqDirection.lowMid,
    ADAPTIVE_SETTING_BOUNDS.eqDb.min,
    ADAPTIVE_SETTING_BOUNDS.eqDb.max
  );
  next.eqDirection.presence = clamp(
    next.eqDirection.presence,
    ADAPTIVE_SETTING_BOUNDS.eqDb.min,
    ADAPTIVE_SETTING_BOUNDS.eqDb.max
  );
  next.eqDirection.air = clamp(
    next.eqDirection.air,
    ADAPTIVE_SETTING_BOUNDS.eqDb.min,
    ADAPTIVE_SETTING_BOUNDS.eqDb.max
  );
  next.saturationAmount = clamp(
    next.saturationAmount,
    ADAPTIVE_SETTING_BOUNDS.saturationAmount.min,
    ADAPTIVE_SETTING_BOUNDS.saturationAmount.max
  );
  next.stereoWidth = clamp(
    next.stereoWidth,
    ADAPTIVE_SETTING_BOUNDS.stereoWidth.min,
    ADAPTIVE_SETTING_BOUNDS.stereoWidth.max
  );
  next.targetLufs = clamp(
    next.targetLufs,
    ADAPTIVE_SETTING_BOUNDS.targetLufs.min,
    ADAPTIVE_SETTING_BOUNDS.targetLufs.max
  );

  return { character, settings: next, biasApplied };
}
