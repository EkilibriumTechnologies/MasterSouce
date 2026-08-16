import type { MasterJobAnalysis } from "@/lib/api/master-analysis";
import type { PublicTrackMetrics } from "@/lib/audio/public-analysis";

import { asFiniteLufs, LOUDNESS_MATCH_DEFAULT_ENABLED } from "@/lib/master-comparison/loudness-match";

export type ComparisonSource = "original" | "mastered";

export type MasterComparisonSources = {
  originalSource?: string | null;
  masteredSource?: string | null;
};

export type ComparisonPlaybackState = {
  activeSource: ComparisonSource;
  currentTime: number;
  playing: boolean;
  loudnessMatchEnabled: boolean;
};

export type ComparisonLufs = {
  originalLufs: number | null;
  masteredLufs: number | null;
};

export type AdaptiveAnalysisPair = {
  standard: MasterJobAnalysis;
  adaptive: MasterJobAnalysis | null;
};

export const LOUDNESS_MATCH_HELPER_TEXT =
  "Loudness matching helps you compare tone, punch and clarity without louder automatically sounding better.";

export const LOUDNESS_MATCH_PLAYBACK_ONLY_TEXT =
  "Loudness Match adjusts comparison playback only. Downloaded files are unchanged.";

export function canShowMasterComparison(sources: MasterComparisonSources): boolean {
  return Boolean(sources.originalSource?.trim() && sources.masteredSource?.trim());
}

export function createInitialComparisonState(): ComparisonPlaybackState {
  return {
    activeSource: "original",
    currentTime: 0,
    playing: false,
    loudnessMatchEnabled: LOUDNESS_MATCH_DEFAULT_ENABLED
  };
}

/**
 * Switch Original ↔ Master while preserving seek position and playing/paused.
 * Playback itself stays on the existing HTMLAudioElement pair; this is the
 * state contract the player must honor.
 */
export function switchComparisonSource(
  state: ComparisonPlaybackState,
  nextSource: ComparisonSource,
  liveCurrentTime?: number
): ComparisonPlaybackState {
  const currentTime =
    typeof liveCurrentTime === "number" && Number.isFinite(liveCurrentTime) && liveCurrentTime >= 0
      ? liveCurrentTime
      : state.currentTime;

  return {
    ...state,
    activeSource: nextSource,
    currentTime
  };
}

export function resolveComparisonLufs(analysis: MasterJobAnalysis | null | undefined): ComparisonLufs {
  return {
    originalLufs: asFiniteLufs(analysis?.original?.integratedLufs),
    masteredLufs: asFiniteLufs(analysis?.mastered?.integratedLufs)
  };
}

function toPublicMetricsFromAnalysis(analysis: MasterJobAnalysis): PublicTrackMetrics {
  return {
    durationSec: analysis.durationSec,
    integratedLufs: analysis.integratedLufs,
    peakDb: analysis.peakDb,
    crestDb: analysis.crestDb
  };
}

/**
 * Map Adaptive API analysis onto the existing `original` / `mastered` metrics
 * already used by standard mastering. Uses measured integrated LUFS only.
 *
 * Adaptive `analysis.standard` is the source/baseline measurement.
 * Adaptive `analysis.adaptive` is the post-render master measurement.
 * The Adaptive API currently copies post-master metrics into a field named
 * `original`; this helper reads the top-level measured values instead of
 * treating that misnamed field as the uploaded source.
 */
export function mergeAdaptiveAnalysisForComparison(analysis: AdaptiveAnalysisPair): MasterJobAnalysis {
  const baseline = analysis.standard;
  const mastered = analysis.adaptive;
  const display = mastered ?? baseline;

  return {
    durationSec: display.durationSec,
    integratedLufs: display.integratedLufs,
    peakDb: display.peakDb,
    crestDb: display.crestDb,
    notes: display.notes,
    original: baseline.original ?? toPublicMetricsFromAnalysis(baseline),
    ...(mastered ? { mastered: mastered.mastered ?? toPublicMetricsFromAnalysis(mastered) } : {})
  };
}
