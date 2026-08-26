import type { TrackAnalysis } from "@/lib/audio/analyze-track";
import type { TrackAnalysisV2Summary } from "@/lib/audio/track-analysis-v2-types";
import type {
  GenerationMatchAnalysisEvidence,
  GenerationMatchV1Evidence,
  GenerationMatchV2Evidence
} from "@/lib/song-architect/generation-match-types";

function finiteOrNull(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function toV1Evidence(analysis: TrackAnalysis): GenerationMatchV1Evidence {
  return {
    integratedLufs: finiteOrNull(analysis.integratedLufs),
    peakDb: finiteOrNull(analysis.peakDb),
    meanDb: finiteOrNull(analysis.meanDb),
    crestDb: finiteOrNull(analysis.crestDb),
    lowEndDb: finiteOrNull(analysis.lowEndDb),
    lowMidDb: finiteOrNull(analysis.lowMidDb),
    harshnessDb: finiteOrNull(analysis.harshnessDb),
    airDb: finiteOrNull(analysis.airDb)
  };
}

function toV2Evidence(analysisV2: TrackAnalysisV2Summary): GenerationMatchV2Evidence {
  return {
    integratedLufs: finiteOrNull(analysisV2.integratedLufs),
    loudnessRangeLu: finiteOrNull(analysisV2.loudnessRangeLu),
    truePeakDb: finiteOrNull(analysisV2.truePeakDb),
    samplePeakDb: finiteOrNull(analysisV2.samplePeakDb),
    crestFactorDb: finiteOrNull(analysisV2.crestFactorDb),
    peakToLoudnessRatioDb: finiteOrNull(analysisV2.peakToLoudnessRatioDb),
    spectralCentroidHz: finiteOrNull(analysisV2.spectralCentroidHz),
    spectralSlopeDbPerOct: finiteOrNull(analysisV2.spectralSlopeDbPerOct),
    stereoCorrelation: finiteOrNull(analysisV2.stereoCorrelation),
    stereoWidthRatio: finiteOrNull(analysisV2.stereoWidthRatio),
    activeFlags: Array.isArray(analysisV2.activeFlags) ? analysisV2.activeFlags.filter((flag) => typeof flag === "string") : []
  };
}

function hasUsableV1(evidence: GenerationMatchV1Evidence): boolean {
  return Object.values(evidence).some((value) => typeof value === "number" && Number.isFinite(value));
}

function hasUsableV2(evidence: GenerationMatchV2Evidence): boolean {
  const flags = evidence.activeFlags ?? [];
  return (
    flags.length > 0 ||
    Object.entries(evidence).some(
      ([key, value]) => key !== "activeFlags" && typeof value === "number" && Number.isFinite(value)
    )
  );
}

/**
 * Map existing Track Analysis output onto the Generation Match evidence contract.
 *
 * Production analysis does not measure BPM or section segmentation, so tempo /
 * sectionEnergy / sectionStereoWidth are omitted rather than inferred from global
 * metrics. The evaluator then marks those dimensions not_evaluable.
 */
export function trackAnalysisToGenerationMatchEvidence(input: {
  analysis: TrackAnalysis;
  analysisV2?: TrackAnalysisV2Summary | null;
}): GenerationMatchAnalysisEvidence {
  const v1 = toV1Evidence(input.analysis);
  const v2 = input.analysisV2 ? toV2Evidence(input.analysisV2) : null;
  return {
    ...(hasUsableV2(v2 ?? { activeFlags: [] }) && v2 ? { v2 } : {}),
    ...(hasUsableV1(v1) ? { v1 } : {})
  };
}

export function hasUsableGenerationMatchAnalysis(analysis: TrackAnalysis): boolean {
  return (
    finiteOrNull(analysis.integratedLufs) !== null ||
    finiteOrNull(analysis.peakDb) !== null ||
    finiteOrNull(analysis.meanDb) !== null ||
    finiteOrNull(analysis.crestDb) !== null ||
    finiteOrNull(analysis.lowEndDb) !== null ||
    finiteOrNull(analysis.lowMidDb) !== null ||
    finiteOrNull(analysis.harshnessDb) !== null ||
    finiteOrNull(analysis.airDb) !== null ||
    finiteOrNull(analysis.durationSec) !== null
  );
}
