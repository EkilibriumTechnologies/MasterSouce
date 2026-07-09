/**
 * Centralized, documented, testable diagnostic thresholds + pure interpretation
 * for {@link TrackAnalysisV2}.
 *
 * IMPORTANT: This module is intentionally pure (types-only imports). It does NOT
 * spawn processes, touch the filesystem, or import Node-only code, so it can be
 * unit-tested directly and reused on any runtime. All "magic numbers" for
 * diagnostics live here — do not scatter them through route or DSP code.
 *
 * Nothing in this file changes mastering DSP output. It only interprets numbers.
 */
import type {
  ChannelMode,
  Metric,
  MetricSource,
  TrackAnalysisV2,
  TrackAnalysisV2Comparison,
  TrackAnalysisV2Derived,
  TrackAnalysisV2Flags,
  TrackAnalysisV2Measured,
  TrackAnalysisV2Summary
} from "@/lib/audio/track-analysis-v2-types";
import { TRACK_ANALYSIS_V2_SCHEMA_VERSION } from "@/lib/audio/track-analysis-v2-types";

/**
 * Diagnostic thresholds. Values are deliberately conservative; they classify
 * clear cases and avoid over-flagging borderline material. Tune here only.
 */
export const V2_THRESHOLDS = {
  /** low_end_excess when lowEndDominance exceeds this many dB. */
  lowEndExcessDb: 6,
  /** low_end_weak when lowEndDominance falls below this many dB. */
  lowEndWeakDb: -10,
  /** harsh_upper_mids when upper-mid/presence exceed mid by this many dB. */
  harshUpperMidsDb: 3,
  /** excessive_sibilance when presence exceeds mid/brilliance average by this many dB. */
  sibilanceDb: 4,

  /** overly_compressed when crest factor is below this many dB. */
  overlyCompressedCrestDb: 6,
  /** overly_compressed when loudness range (LRA) is below this many LU. */
  overlyCompressedLraLu: 3,
  /** excessive_dynamic_range when LRA exceeds this many LU. */
  excessiveDynamicRangeLraLu: 15,
  /** excessive_dynamic_range when crest factor exceeds this many dB. */
  excessiveDynamicRangeCrestDb: 16,

  /** clipping_risk when true peak exceeds this many dBTP. */
  clippingTruePeakDb: -0.3,
  /** clipping_risk when sample peak exceeds this many dBFS. */
  clippingSamplePeakDb: -0.1,
  /** clipping_risk when full-scale sample count exceeds this many samples. */
  clippingSampleCount: 16,

  /** narrow_stereo when correlation is above this (near-mono) ... */
  narrowStereoCorrelation: 0.97,
  /** ... and side/mid width ratio is below this. */
  narrowStereoWidthRatio: 0.08,
  /** phase_risk when overall correlation drops below this. */
  phaseRiskCorrelation: 0,
  /** low_end_stereo_risk when <150 Hz correlation drops below this. */
  lowFreqStereoRiskCorrelation: 0.5,

  /** excessive_leading_silence when leading silence exceeds this many seconds. */
  leadingSilenceSec: 1,
  /** channel_imbalance when |L-R| RMS difference exceeds this many dB. */
  channelImbalanceDb: 1.5
} as const;

/**
 * Geometric-center frequency (Hz) of each spectrum band, used for spectral
 * centroid / rolloff / slope estimation. Must match the band edges used by the
 * FFmpeg band-split pass in track-analysis-v2.ts.
 */
export const V2_BAND_CENTERS_HZ = {
  subBass: 35,
  bass: 85,
  lowMid: 219,
  mid: 894,
  upperMid: 2828,
  presence: 5657,
  brilliance: 12649
} as const;

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function round(value: number, digits = 2): number {
  const f = 10 ** digits;
  return Math.round(value * f) / f;
}

/** Read a numeric metric value, or null when unavailable. */
export function metricValue(metric: Metric | undefined): number | null {
  if (!metric) return null;
  return typeof metric.value === "number" && Number.isFinite(metric.value) ? metric.value : null;
}

function mk(value: number | null, source: MetricSource, unit: string, confidence: Metric["confidence"] = "medium"): Metric {
  if (value === null || !Number.isFinite(value)) {
    return { value: null, confidence: "unavailable", source: "unavailable", unit };
  }
  return { value: round(value, 4), confidence, source, unit };
}

function na(unit: string): Metric {
  return { value: null, confidence: "unavailable", source: "unavailable", unit };
}

function dbToPower(db: number | null): number | null {
  return db === null ? null : 10 ** (db / 10);
}

function averageDb(values: Array<number | null>): number | null {
  const present = values.filter((v): v is number => v !== null);
  if (!present.length) return null;
  return present.reduce((a, b) => a + b, 0) / present.length;
}

/**
 * Normalized L/R correlation estimate from mid/side RMS levels.
 * For L,R with mid=(L+R)/2 and side=(L-R)/2:
 *   (E[mid^2] - E[side^2]) / (E[mid^2] + E[side^2]) == E[LR] / avg(E[L^2],E[R^2])
 * which equals the L/R correlation coefficient when channel powers are equal.
 */
function correlationFromMidSide(midDb: number | null, sideDb: number | null): number | null {
  const midP = dbToPower(midDb);
  const sideP = dbToPower(sideDb);
  if (midP === null || sideP === null) return null;
  const denom = midP + sideP;
  if (denom <= 0) return null;
  return clamp((midP - sideP) / denom, -1, 1);
}

/** B. Build DERIVED metrics purely from MEASURED metrics. */
export function buildDerivedMetrics(measured: TrackAnalysisV2Measured, analyzedStereo: boolean): TrackAnalysisV2Derived {
  const truePeak = metricValue(measured.peaks.truePeakDb);
  const integrated = metricValue(measured.loudness.integratedLufs);
  const rmsPeak = metricValue(measured.dynamics.rmsPeakDb);
  const rmsTrough = metricValue(measured.dynamics.rmsTroughDb);
  const crest = metricValue(measured.dynamics.crestFactorDb);
  const lra = metricValue(measured.loudness.loudnessRangeLu);
  const flatFactor = metricValue(measured.dynamics.flatFactor);

  const bands = measured.spectrumBands;
  const bandOrder: Array<[keyof typeof V2_BAND_CENTERS_HZ, number | null]> = [
    ["subBass", metricValue(bands.subBassDb)],
    ["bass", metricValue(bands.bassDb)],
    ["lowMid", metricValue(bands.lowMidDb)],
    ["mid", metricValue(bands.midDb)],
    ["upperMid", metricValue(bands.upperMidDb)],
    ["presence", metricValue(bands.presenceDb)],
    ["brilliance", metricValue(bands.brillianceDb)]
  ];

  // Spectral centroid / rolloff from band energies.
  let centroid: number | null = null;
  let rolloff: number | null = null;
  const energyPairs = bandOrder
    .map(([name, db]) => ({ f: V2_BAND_CENTERS_HZ[name] as number, p: dbToPower(db) }))
    .filter((e): e is { f: number; p: number } => e.p !== null);
  if (energyPairs.length >= 3) {
    const totalP = energyPairs.reduce((a, e) => a + e.p, 0);
    if (totalP > 0) {
      centroid = energyPairs.reduce((a, e) => a + e.f * e.p, 0) / totalP;
      let cum = 0;
      for (const e of energyPairs) {
        cum += e.p;
        if (cum / totalP >= 0.85) {
          rolloff = e.f;
          break;
        }
      }
      if (rolloff === null) rolloff = energyPairs[energyPairs.length - 1].f;
    }
  }

  // Spectral slope (dB/octave) via least-squares of band dB vs log2(freq).
  let slope: number | null = null;
  const slopePairs = bandOrder
    .map(([name, db]) => ({ x: Math.log2(V2_BAND_CENTERS_HZ[name]), y: db }))
    .filter((e): e is { x: number; y: number } => e.y !== null);
  if (slopePairs.length >= 3) {
    const n = slopePairs.length;
    const sx = slopePairs.reduce((a, e) => a + e.x, 0);
    const sy = slopePairs.reduce((a, e) => a + e.y, 0);
    const sxx = slopePairs.reduce((a, e) => a + e.x * e.x, 0);
    const sxy = slopePairs.reduce((a, e) => a + e.x * e.y, 0);
    const denom = n * sxx - sx * sx;
    if (denom !== 0) slope = (n * sxy - sx * sy) / denom;
  }

  const subBass = metricValue(bands.subBassDb);
  const bass = metricValue(bands.bassDb);
  const mid = metricValue(bands.midDb);
  const upperMid = metricValue(bands.upperMidDb);
  const presence = metricValue(bands.presenceDb);
  const brilliance = metricValue(bands.brillianceDb);

  const lowEndAvg = averageDb([subBass, bass]);
  const midHighAvg = averageDb([mid, upperMid, presence]);
  const lowEndDominance = lowEndAvg !== null && midHighAvg !== null ? lowEndAvg - midHighAvg : null;

  const upperAvg = averageDb([upperMid, presence]);
  const harshness = upperAvg !== null && mid !== null ? upperAvg - mid : null;

  const sibRef = averageDb([mid, brilliance]);
  const sibilance = presence !== null && sibRef !== null ? presence - sibRef : null;

  const plr = truePeak !== null && integrated !== null ? truePeak - integrated : null;
  const quietToLoud = rmsPeak !== null && rmsTrough !== null ? rmsPeak - rmsTrough : null;

  // Compression proxy: blend of low crest, low LRA, high flat factor.
  const compScores: number[] = [];
  if (crest !== null) compScores.push(clamp((14 - crest) / 10, 0, 1));
  if (lra !== null) compScores.push(clamp((12 - lra) / 10, 0, 1));
  if (flatFactor !== null) compScores.push(clamp(flatFactor / 5, 0, 1));
  const compressionProxy = compScores.length ? compScores.reduce((a, b) => a + b, 0) / compScores.length : null;

  // Transient activity proxy: mostly crest + quiet-to-loud contrast.
  const transScores: number[] = [];
  if (crest !== null) transScores.push(clamp((crest - 4) / 12, 0, 1));
  if (quietToLoud !== null) transScores.push(clamp(quietToLoud / 12, 0, 1));
  const transientActivity = transScores.length ? transScores.reduce((a, b) => a + b, 0) / transScores.length : null;

  const midRms = metricValue(measured.stereo.midRmsDb);
  const sideRms = metricValue(measured.stereo.sideRmsDb);
  const lowMidRms = metricValue(measured.stereo.lowMidRmsDb);
  const lowSideRms = metricValue(measured.stereo.lowSideRmsDb);

  const widthRatio =
    analyzedStereo && midRms !== null && sideRms !== null ? 10 ** ((sideRms - midRms) / 20) : null;
  const correlation = analyzedStereo ? correlationFromMidSide(midRms, sideRms) : null;
  const lowFreqCorrelation = analyzedStereo ? correlationFromMidSide(lowMidRms, lowSideRms) : null;
  const sideToMid = analyzedStereo && sideRms !== null && midRms !== null ? sideRms - midRms : null;

  const leftRms = metricValue(measured.integrity.leftRmsDb);
  const rightRms = metricValue(measured.integrity.rightRmsDb);
  const imbalance = analyzedStereo && leftRms !== null && rightRms !== null ? leftRms - rightRms : null;

  return {
    peakToLoudnessRatioDb: mk(plr, "derived", "dB", "high"),
    quietToLoudContrastDb: mk(quietToLoud, "derived", "dB"),
    compressionProxy: mk(compressionProxy, "derived", "ratio"),
    transientActivityProxy: mk(transientActivity, "derived", "ratio"),
    spectralCentroidHz: mk(centroid, "derived", "Hz", "low"),
    spectralRolloffHz: mk(rolloff, "derived", "Hz", "low"),
    spectralSlopeDbPerOct: mk(slope, "derived", "dB/oct", "low"),
    lowEndDominanceDb: mk(lowEndDominance, "derived", "dB"),
    harshnessProxyDb: mk(harshness, "derived", "dB"),
    sibilanceProxyDb: mk(sibilance, "derived", "dB"),
    stereoWidthRatio: analyzedStereo ? mk(widthRatio, "derived", "ratio") : na("ratio"),
    stereoCorrelation: analyzedStereo ? mk(correlation, "derived", "corr") : na("corr"),
    sideToMidRatioDb: analyzedStereo ? mk(sideToMid, "derived", "dB") : na("dB"),
    lowFreqCorrelation: analyzedStereo ? mk(lowFreqCorrelation, "derived", "corr") : na("corr"),
    channelImbalanceDb: analyzedStereo ? mk(imbalance, "derived", "dB") : na("dB")
  };
}

/** C. Derive diagnostic FLAGS from measured + derived metrics using {@link V2_THRESHOLDS}. */
export function deriveDiagnosticFlags(
  measured: TrackAnalysisV2Measured,
  derived: TrackAnalysisV2Derived,
  analyzedStereo: boolean
): TrackAnalysisV2Flags {
  const t = V2_THRESHOLDS;

  const lowEndDominance = metricValue(derived.lowEndDominanceDb);
  const harshness = metricValue(derived.harshnessProxyDb);
  const sibilance = metricValue(derived.sibilanceProxyDb);
  const crest = metricValue(measured.dynamics.crestFactorDb);
  const lra = metricValue(measured.loudness.loudnessRangeLu);
  const truePeak = metricValue(measured.peaks.truePeakDb);
  const samplePeak = metricValue(measured.peaks.samplePeakDb);
  const clipCount = metricValue(measured.integrity.clippingSampleCount);
  const correlation = metricValue(derived.stereoCorrelation);
  const widthRatio = metricValue(derived.stereoWidthRatio);
  const lowFreqCorrelation = metricValue(derived.lowFreqCorrelation);
  const leadingSilence = metricValue(measured.integrity.leadingSilenceSec);
  const imbalance = metricValue(derived.channelImbalanceDb);

  return {
    low_end_excess: lowEndDominance !== null && lowEndDominance > t.lowEndExcessDb,
    low_end_weak: lowEndDominance !== null && lowEndDominance < t.lowEndWeakDb,
    harsh_upper_mids: harshness !== null && harshness > t.harshUpperMidsDb,
    excessive_sibilance: sibilance !== null && sibilance > t.sibilanceDb,
    overly_compressed:
      (crest !== null && crest < t.overlyCompressedCrestDb) ||
      (lra !== null && lra < t.overlyCompressedLraLu),
    excessive_dynamic_range:
      (lra !== null && lra > t.excessiveDynamicRangeLraLu) ||
      (crest !== null && crest > t.excessiveDynamicRangeCrestDb),
    clipping_risk:
      (truePeak !== null && truePeak > t.clippingTruePeakDb) ||
      (samplePeak !== null && samplePeak > t.clippingSamplePeakDb) ||
      (clipCount !== null && clipCount > t.clippingSampleCount),
    narrow_stereo:
      analyzedStereo &&
      correlation !== null &&
      widthRatio !== null &&
      correlation > t.narrowStereoCorrelation &&
      widthRatio < t.narrowStereoWidthRatio,
    phase_risk: analyzedStereo && correlation !== null && correlation < t.phaseRiskCorrelation,
    low_end_stereo_risk:
      analyzedStereo && lowFreqCorrelation !== null && lowFreqCorrelation < t.lowFreqStereoRiskCorrelation,
    excessive_leading_silence: leadingSilence !== null && leadingSilence > t.leadingSilenceSec,
    channel_imbalance: analyzedStereo && imbalance !== null && Math.abs(imbalance) > t.channelImbalanceDb
  };
}

function delta(a: number | null, b: number | null): number | null {
  if (a === null || b === null) return null;
  return round(a - b, 4);
}

/**
 * Pure comparison helper. Returns metric DELTAS ONLY (source - reference).
 * It intentionally does NOT translate deltas into DSP moves; reference-track
 * blending is unchanged in this phase.
 */
export function compareTrackAnalysesV2(
  source: TrackAnalysisV2,
  reference: TrackAnalysisV2
): TrackAnalysisV2Comparison {
  const sBands = source.measured.spectrumBands;
  const rBands = reference.measured.spectrumBands;
  return {
    integratedLufsDelta: delta(
      metricValue(source.measured.loudness.integratedLufs),
      metricValue(reference.measured.loudness.integratedLufs)
    ),
    truePeakDbDelta: delta(
      metricValue(source.measured.peaks.truePeakDb),
      metricValue(reference.measured.peaks.truePeakDb)
    ),
    loudnessRangeLuDelta: delta(
      metricValue(source.measured.loudness.loudnessRangeLu),
      metricValue(reference.measured.loudness.loudnessRangeLu)
    ),
    spectralBandDeltasDb: {
      subBass: delta(metricValue(sBands.subBassDb), metricValue(rBands.subBassDb)),
      bass: delta(metricValue(sBands.bassDb), metricValue(rBands.bassDb)),
      lowMid: delta(metricValue(sBands.lowMidDb), metricValue(rBands.lowMidDb)),
      mid: delta(metricValue(sBands.midDb), metricValue(rBands.midDb)),
      upperMid: delta(metricValue(sBands.upperMidDb), metricValue(rBands.upperMidDb)),
      presence: delta(metricValue(sBands.presenceDb), metricValue(rBands.presenceDb)),
      brilliance: delta(metricValue(sBands.brillianceDb), metricValue(rBands.brillianceDb))
    },
    spectralTiltDeltaDbPerOct: delta(
      metricValue(source.derived.spectralSlopeDbPerOct),
      metricValue(reference.derived.spectralSlopeDbPerOct)
    ),
    spectralCentroidHzDelta: delta(
      metricValue(source.derived.spectralCentroidHz),
      metricValue(reference.derived.spectralCentroidHz)
    ),
    stereoWidthRatioDelta: delta(
      metricValue(source.derived.stereoWidthRatio),
      metricValue(reference.derived.stereoWidthRatio)
    ),
    stereoCorrelationDelta: delta(
      metricValue(source.derived.stereoCorrelation),
      metricValue(reference.derived.stereoCorrelation)
    ),
    transientActivityDelta: delta(
      metricValue(source.derived.transientActivityProxy),
      metricValue(reference.derived.transientActivityProxy)
    ),
    compressionDelta: delta(
      metricValue(source.derived.compressionProxy),
      metricValue(reference.derived.compressionProxy)
    )
  };
}

/** Compact, size-bounded projection safe for API responses. */
export function buildTrackAnalysisV2Summary(analysis: TrackAnalysisV2): TrackAnalysisV2Summary {
  const channelMode = analysis.measured.integrity.channelMode.value as ChannelMode | null;
  const activeFlags = Object.entries(analysis.flags)
    .filter(([, on]) => on === true)
    .map(([name]) => name);

  return {
    schemaVersion: TRACK_ANALYSIS_V2_SCHEMA_VERSION,
    integratedLufs: metricValue(analysis.measured.loudness.integratedLufs),
    loudnessRangeLu: metricValue(analysis.measured.loudness.loudnessRangeLu),
    truePeakDb: metricValue(analysis.measured.peaks.truePeakDb),
    samplePeakDb: metricValue(analysis.measured.peaks.samplePeakDb),
    crestFactorDb: metricValue(analysis.measured.dynamics.crestFactorDb),
    peakToLoudnessRatioDb: metricValue(analysis.derived.peakToLoudnessRatioDb),
    spectralCentroidHz: metricValue(analysis.derived.spectralCentroidHz),
    spectralSlopeDbPerOct: metricValue(analysis.derived.spectralSlopeDbPerOct),
    stereoCorrelation: metricValue(analysis.derived.stereoCorrelation),
    stereoWidthRatio: metricValue(analysis.derived.stereoWidthRatio),
    channelMode,
    durationSec: metricValue(analysis.measured.integrity.durationSec),
    sampleRateHz: metricValue(analysis.measured.integrity.sampleRateHz),
    activeFlags,
    analyzedStereo: analysis.meta.analyzedStereo,
    subprocessCount: analysis.meta.subprocessCount
  };
}
