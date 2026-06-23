import type { TrackAnalysis } from "@/lib/audio/analyze-track";
import type { AdaptiveInstructionSettings, AdaptiveInstructionSummary } from "@/lib/audio/adaptive-mastering-pipeline";

const REFERENCE_BLEND = 0.35;

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function bandDelta(reference: number | null, baseline: number | null): number | null {
  if (reference === null || baseline === null) return null;
  return reference - baseline;
}

function mapBandDeltaToEqDb(delta: number | null, scale: number): number {
  if (delta === null) return 0;
  return clamp(delta * scale, -1.2, 1.2);
}

export function blendSettingsWithReference(
  settings: AdaptiveInstructionSettings,
  baseline: TrackAnalysis,
  reference: TrackAnalysis
): AdaptiveInstructionSettings {
  const next = { ...settings, eqDirection: { ...settings.eqDirection } };

  if (reference.integratedLufs !== null) {
    const refTarget = clamp(reference.integratedLufs, -14, -8.8);
    next.targetLufs = clamp(next.targetLufs + (refTarget - next.targetLufs) * REFERENCE_BLEND, -14, -8.8);
  }

  next.eqDirection.lowEnd = clamp(
    next.eqDirection.lowEnd + mapBandDeltaToEqDb(bandDelta(reference.lowEndDb, baseline.lowEndDb), 0.08) * REFERENCE_BLEND,
    -2.2,
    2.2
  );
  next.eqDirection.lowMid = clamp(
    next.eqDirection.lowMid + mapBandDeltaToEqDb(bandDelta(reference.lowMidDb, baseline.lowMidDb), 0.08) * REFERENCE_BLEND,
    -2.2,
    2.2
  );
  next.eqDirection.presence = clamp(
    next.eqDirection.presence +
      mapBandDeltaToEqDb(bandDelta(reference.harshnessDb, baseline.harshnessDb), 0.06) * REFERENCE_BLEND,
    -2.2,
    2.2
  );
  next.eqDirection.air = clamp(
    next.eqDirection.air + mapBandDeltaToEqDb(bandDelta(reference.airDb, baseline.airDb), 0.07) * REFERENCE_BLEND,
    -2.2,
    2.2
  );

  if (
    reference.crestDb !== null &&
    baseline.crestDb !== null &&
    reference.crestDb < baseline.crestDb - 1.5
  ) {
    next.compressionIntensity =
      next.compressionIntensity === "light" ? "medium" : next.compressionIntensity === "medium" ? "strong" : "strong";
  }

  if (reference.alreadyLimited && !baseline.alreadyLimited) {
    next.targetLufs = clamp(next.targetLufs - 0.4, -14, -8.8);
  }

  return next;
}

export function applyReferenceTrackGuidance(
  summary: AdaptiveInstructionSummary,
  baseline: TrackAnalysis,
  reference: TrackAnalysis
): AdaptiveInstructionSummary {
  return {
    ...summary,
    rationale: `${summary.rationale} Reference track gently guided tone and loudness while preserving your mix.`,
    settings: blendSettingsWithReference(summary.settings, baseline, reference)
  };
}
