import type { SongDNA } from "@/lib/song-architect/types";

export type GenerationMatchConfidence = "measured" | "inferred";
export type GenerationInferenceConfidence = "high" | "medium" | "low";
export type GenerationMatchStatus = "matched" | "partial" | "missed" | "not_evaluable";
export type GenerationMatchLevel = "high" | "medium" | "low" | "not_evaluable";

export type GenerationMatchEvidenceSource =
  | "track_analysis_v2"
  | "track_analysis_v1"
  | "provided_analysis"
  | "inferred"
  | "unavailable";

export type GenerationMatchDimension = {
  id: string;
  label: string;
  intended?: string | number;
  observed?: string | number;
  status: GenerationMatchStatus;
  confidence: GenerationMatchConfidence;
  inferenceConfidence?: GenerationInferenceConfidence;
  evidenceSource: GenerationMatchEvidenceSource;
  explanation: string;
};

export type GenerationCorrectionPlan = {
  preserve: string[];
  change: string[];
};

export type GenerationMatchResult = {
  overall: GenerationMatchLevel;
  dimensions: GenerationMatchDimension[];
  matched: string[];
  partial: string[];
  missed: string[];
  notEvaluated: string[];
  correctionDirections: string[];
  correctionPlan: GenerationCorrectionPlan;
  evaluatedAt: string;
  evidenceCounts: {
    measured: number;
    inferred: number;
    notEvaluable: number;
  };
  /**
   * Coarse internal rank used only for deterministic thresholds/tests.
   * It is not a scientific similarity percentage and should not be shown as one.
   */
  internalScore: number;
};

export type GenerationMatchV1Evidence = {
  integratedLufs?: number | null;
  peakDb?: number | null;
  meanDb?: number | null;
  crestDb?: number | null;
  lowEndDb?: number | null;
  lowMidDb?: number | null;
  harshnessDb?: number | null;
  airDb?: number | null;
};

export type GenerationMatchV2Evidence = {
  integratedLufs?: number | null;
  loudnessRangeLu?: number | null;
  truePeakDb?: number | null;
  samplePeakDb?: number | null;
  crestFactorDb?: number | null;
  peakToLoudnessRatioDb?: number | null;
  spectralCentroidHz?: number | null;
  spectralSlopeDbPerOct?: number | null;
  stereoCorrelation?: number | null;
  stereoWidthRatio?: number | null;
  activeFlags?: string[];
};

export type GenerationMatchAnalysisEvidence = {
  /** Existing Track Analysis V2 summary. Authoritative for every populated category. */
  v2?: GenerationMatchV2Evidence | null;
  /** Existing Track Analysis V1 values. Used only for categories unavailable in V2. */
  v1?: GenerationMatchV1Evidence | null;
  /**
   * Optional tempo evidence from a trusted analyzer. The current production
   * Track Analysis pipeline does not yet provide BPM.
   */
  tempo?: {
    bpm: number;
    source?: GenerationMatchEvidenceSource;
  } | null;
  /**
   * Optional coarse section evidence, ordered across the song and scaled 1..10.
   * Current production Track Analysis has no reliable section segmentation.
   */
  sectionEnergy?: {
    values: number[];
    confidence: GenerationInferenceConfidence;
    source?: GenerationMatchEvidenceSource;
  } | null;
  /**
   * Optional coarse section width values. Global V2 width must never be placed
   * here because it cannot prove verse/chorus width contrast.
   */
  sectionStereoWidth?: {
    values: number[];
    confidence: GenerationInferenceConfidence;
    source?: GenerationMatchEvidenceSource;
  } | null;
};

export type EvaluateGenerationMatchInput = {
  songDNA: SongDNA;
  analysis: GenerationMatchAnalysisEvidence;
  evaluatedAt?: string;
};
