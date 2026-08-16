export {
  asFiniteLufs,
  computeLoudnessMatchGains,
  dbToLinearGain,
  LOUDNESS_MATCH_DEFAULT_ENABLED,
  MAX_ABS_COMPENSATION_DB,
  type LoudnessMatchGains,
  type LoudnessMatchInput
} from "@/lib/master-comparison/loudness-match";

export {
  canShowMasterComparison,
  createInitialComparisonState,
  LOUDNESS_MATCH_HELPER_TEXT,
  LOUDNESS_MATCH_PLAYBACK_ONLY_TEXT,
  mergeAdaptiveAnalysisForComparison,
  resolveComparisonLufs,
  switchComparisonSource,
  type AdaptiveAnalysisPair,
  type ComparisonLufs,
  type ComparisonPlaybackState,
  type ComparisonSource,
  type MasterComparisonSources
} from "@/lib/master-comparison/master-comparison";
