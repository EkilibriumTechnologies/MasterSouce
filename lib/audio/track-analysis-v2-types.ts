/**
 * TrackAnalysisV2 — additive, backward-compatible audio analysis contract.
 *
 * This module contains ONLY types (no runtime imports) so it can be shared by
 * pure interpretation code, server FFmpeg orchestration, tests, and API
 * serialization without pulling in Node-only dependencies.
 *
 * Design goals:
 * - Separate MEASURED metrics (parsed from FFmpeg) from DERIVED metrics
 *   (computed from measured values) from diagnostic FLAGS (boolean verdicts).
 * - Never fabricate precision: every metric carries a confidence + source so
 *   consumers can tell a real measurement from an unavailable one.
 * - Additive only. This contract does NOT replace {@link TrackAnalysis} and is
 *   not consumed by Standard or Adaptive mastering DSP in this phase.
 */

export const TRACK_ANALYSIS_V2_SCHEMA_VERSION = 2 as const;

/** How much we trust a metric value. `unavailable` means we could not measure it. */
export type MetricConfidence = "high" | "medium" | "low" | "unavailable";

/** Where a metric came from, for auditability. */
export type MetricSource =
  | "ebur128"
  | "ebur128-frames"
  | "astats"
  | "astats-bands"
  | "astats-stereo"
  | "silencedetect"
  | "container"
  | "derived"
  | "unavailable";

/**
 * A single metric. `value` is `null` whenever `confidence === "unavailable"`.
 * We intentionally keep confidence/source explicit rather than emitting bare
 * numbers so downstream logic can gate on measurement reliability.
 */
export type Metric<T = number> = {
  value: T | null;
  confidence: MetricConfidence;
  source: MetricSource;
  /** Human-oriented unit label, e.g. "LUFS", "dB", "Hz", "ratio". */
  unit?: string;
};

export type ChannelMode = "mono" | "stereo" | "multichannel";

/** A. Measured metrics — parsed directly from FFmpeg output. */
export type TrackAnalysisV2Measured = {
  loudness: {
    integratedLufs: Metric;
    /** EBU R128 loudness range (LRA). */
    loudnessRangeLu: Metric;
    /** Max short-term loudness (gated), from per-frame ebur128 log. */
    shortTermMaxLufs: Metric;
    /** Max momentary loudness (gated), from per-frame ebur128 log. */
    momentaryMaxLufs: Metric;
    /** Spread (p95-p10) of gated short-term loudness frames. */
    shortTermRangeLu: Metric;
  };
  peaks: {
    samplePeakDb: Metric;
    truePeakDb: Metric;
  };
  dynamics: {
    crestFactorDb: Metric;
    rmsLevelDb: Metric;
    rmsPeakDb: Metric;
    rmsTroughDb: Metric;
    /** astats "Dynamic range". */
    dynamicRangeDb: Metric;
    /** astats "Flat factor" — higher implies more sustained/limited peaks. */
    flatFactor: Metric;
    /** astats "Zero crossings rate" — coarse transient/brightness proxy. */
    zeroCrossingRate: Metric;
  };
  spectrumBands: {
    subBassDb: Metric;
    bassDb: Metric;
    lowMidDb: Metric;
    midDb: Metric;
    upperMidDb: Metric;
    presenceDb: Metric;
    brillianceDb: Metric;
  };
  stereo: {
    midRmsDb: Metric;
    sideRmsDb: Metric;
    lowMidRmsDb: Metric;
    lowSideRmsDb: Metric;
  };
  integrity: {
    durationSec: Metric;
    sampleRateHz: Metric;
    /** Effective PCM bit depth; unavailable for lossy codecs. */
    bitDepth: Metric;
    codec: Metric<string>;
    channelCount: Metric;
    channelMode: Metric<ChannelMode>;
    /** Absolute DC offset fraction (0..1). */
    dcOffset: Metric;
    leftRmsDb: Metric;
    rightRmsDb: Metric;
    /** Count of samples at/near full scale (clipping proxy). */
    clippingSampleCount: Metric;
    /** Leading silence duration in seconds. */
    leadingSilenceSec: Metric;
  };
};

/** B. Derived metrics — computed from measured values only. */
export type TrackAnalysisV2Derived = {
  /** Peak-to-loudness ratio: truePeak - integratedLufs. */
  peakToLoudnessRatioDb: Metric;
  /** rmsPeak - rmsTrough. */
  quietToLoudContrastDb: Metric;
  /** 0..1 compression/density proxy (higher = more compressed). */
  compressionProxy: Metric;
  /** 0..1 transient-activity proxy (higher = punchier / more transients). */
  transientActivityProxy: Metric;
  /** Energy-weighted spectral centroid (Hz). */
  spectralCentroidHz: Metric;
  /** Frequency below which ~85% of band energy sits (Hz). */
  spectralRolloffHz: Metric;
  /** Spectral tilt/slope in dB per octave (negative = darker). */
  spectralSlopeDbPerOct: Metric;
  /** avg(sub,bass) - avg(mid,upperMid,presence). */
  lowEndDominanceDb: Metric;
  /** avg(upperMid,presence) - mid. */
  harshnessProxyDb: Metric;
  /** presence - avg(mid,brilliance) (sibilance region emphasis). */
  sibilanceProxyDb: Metric;
  /** side/mid amplitude ratio (linear). */
  stereoWidthRatio: Metric;
  /** Normalized L/R correlation estimate in [-1, 1]. */
  stereoCorrelation: Metric;
  /** sideRms - midRms in dB. */
  sideToMidRatioDb: Metric;
  /** Low-frequency (<150 Hz) correlation estimate in [-1, 1]. */
  lowFreqCorrelation: Metric;
  /** leftRms - rightRms in dB (0 = balanced). */
  channelImbalanceDb: Metric;
};

/** C. Diagnostic flags — boolean verdicts driven by centralized thresholds. */
export type TrackAnalysisV2Flags = {
  low_end_excess: boolean;
  low_end_weak: boolean;
  harsh_upper_mids: boolean;
  excessive_sibilance: boolean;
  overly_compressed: boolean;
  excessive_dynamic_range: boolean;
  clipping_risk: boolean;
  narrow_stereo: boolean;
  phase_risk: boolean;
  low_end_stereo_risk: boolean;
  excessive_leading_silence: boolean;
  channel_imbalance: boolean;
};

export type TrackAnalysisV2Meta = {
  schemaVersion: typeof TRACK_ANALYSIS_V2_SCHEMA_VERSION;
  /** Whether stereo-specific passes ran (false for mono / mono-analysis). */
  analyzedStereo: boolean;
  /** Number of FFmpeg subprocesses spawned by this analysis. */
  subprocessCount: number;
  /** Peak number of FFmpeg subprocesses alive at the same time (bounded concurrency). */
  maxConcurrentSubprocesses: number;
  /** Largest bounded stderr buffer (bytes) retained for any single pass. */
  maxStderrBytesKept: number;
  /** Wall-clock time for the whole analysis, milliseconds. */
  elapsedMs: number;
  /** Human-readable, non-authoritative observations. */
  notes: string[];
};

export type TrackAnalysisV2 = {
  measured: TrackAnalysisV2Measured;
  derived: TrackAnalysisV2Derived;
  flags: TrackAnalysisV2Flags;
  meta: TrackAnalysisV2Meta;
};

/** Delta between two analyses (source vs reference). `null` when either side is unavailable. */
export type TrackAnalysisV2Comparison = {
  integratedLufsDelta: number | null;
  truePeakDbDelta: number | null;
  loudnessRangeLuDelta: number | null;
  spectralBandDeltasDb: {
    subBass: number | null;
    bass: number | null;
    lowMid: number | null;
    mid: number | null;
    upperMid: number | null;
    presence: number | null;
    brilliance: number | null;
  };
  spectralTiltDeltaDbPerOct: number | null;
  spectralCentroidHzDelta: number | null;
  stereoWidthRatioDelta: number | null;
  stereoCorrelationDelta: number | null;
  /** transientActivityProxy delta (positive = source has more transients). */
  transientActivityDelta: number | null;
  /** compressionProxy delta (positive = source more compressed than reference). */
  compressionDelta: number | null;
};

/** Compact, size-bounded projection safe to include in API responses. */
export type TrackAnalysisV2Summary = {
  schemaVersion: typeof TRACK_ANALYSIS_V2_SCHEMA_VERSION;
  integratedLufs: number | null;
  loudnessRangeLu: number | null;
  truePeakDb: number | null;
  samplePeakDb: number | null;
  crestFactorDb: number | null;
  peakToLoudnessRatioDb: number | null;
  spectralCentroidHz: number | null;
  spectralSlopeDbPerOct: number | null;
  stereoCorrelation: number | null;
  stereoWidthRatio: number | null;
  channelMode: ChannelMode | null;
  durationSec: number | null;
  sampleRateHz: number | null;
  /** Only the flags that are currently true, to keep payloads small. */
  activeFlags: string[];
  analyzedStereo: boolean;
  subprocessCount: number;
};
