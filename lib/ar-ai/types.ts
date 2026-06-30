export const AR_AI_FEATURE = "mastersauce_ar_ai" as const;

export const AR_AI_DISCLAIMER =
  "This is an A&R-style competitive evaluation, not a prediction of commercial success." as const;

export const AR_AI_LABEL_DISCUSSION_TITLE =
  "If this were submitted to a label A&R team today, what would likely be their first discussion points?" as const;

export const AR_AI_DEFAULT_GENRE = "unspecified commercial genre" as const;

export const AR_AI_SCORECARD_CATEGORIES = [
  "Production",
  "Hook Strength",
  "Commercial Familiarity",
  "Originality",
  "Replay Value",
  "Emotional Impact",
  "Energy Curve",
  "Arrangement",
  "Streaming Readiness",
  "Playlist Fit",
  "Audience Match",
  "Release Readiness"
] as const;

export type ArAiImpactLevel = "Low Impact" | "Medium Impact" | "High Impact" | "Very High Impact";

export type ArAiScorecardEntry = {
  category: string;
  score: number;
  why: string;
};

export type ArAiRankedItem = {
  rank: number;
  title: string;
  explanation: string;
};

export type ArAiImprovement = {
  rank: number;
  title: string;
  whyItMatters: string;
  howToImprove: string;
  impactLevel: ArAiImpactLevel;
  estimatedRatingIncrease: string;
};

export type ArAiTechnicalMetrics = {
  durationSec: number | null;
  integratedLufs: number | null;
  peakDb: number | null;
  crestDb: number | null;
  lowEndDb: number | null;
  lowMidDb: number | null;
  harshnessDb: number | null;
  airDb: number | null;
  analysisNotes: string[];
};

export type ArAiReport = {
  feature: typeof AR_AI_FEATURE;
  input: {
    fileName: string;
    intendedGenre: string;
    targetAudience: string | null;
    releaseIntent: string | null;
    references: string | null;
    lyricsProvided: boolean;
  };
  summary: string;
  audioAnalysis: string;
  songwritingAnalysis: string;
  commercialAnalysis: string;
  scorecard: ArAiScorecardEntry[];
  overallRating: {
    score: number;
    meaning: string;
    why: string;
  };
  strengths: ArAiRankedItem[];
  weaknesses: ArAiRankedItem[];
  improvements: ArAiImprovement[];
  labelDiscussionPoints: string;
  disclaimer: string;
  technicalMetrics?: ArAiTechnicalMetrics;
};

export type ArAiEvaluationInput = {
  fileName: string;
  intendedGenre: string;
  targetAudience?: string;
  releaseIntent?: string;
  references?: string;
  lyrics?: string;
  technicalMetrics?: ArAiTechnicalMetrics | null;
};
