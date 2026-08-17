/**
 * User-facing Mastering Decision Report.
 *
 * Observability only: translates existing Adaptive decisions and measured
 * analysis into statements that can be proven from those inputs.
 *
 * Does not run, import, or alter mastering DSP, Adaptive algorithms,
 * TrackAnalysis thresholds, Master Readiness, or A/B loudness-match math.
 */

import { shouldApplyAdaptiveStereoWidthFilter } from "@/lib/audio/adaptive-stereo-width";

export type MasteringDecisionCategory =
  | "low_end"
  | "tonal_balance"
  | "dynamics"
  | "loudness"
  | "peak_safety"
  | "stereo_image"
  | "transient_preservation";

export type MasteringDecisionAction =
  | "protected"
  | "reduced"
  | "enhanced"
  | "preserved"
  | "measured"
  | "within_target"
  | "subtle"
  | "widened"
  | "narrowed"
  | "lifted"
  | "softened";

export type MasteringDecisionDataSource =
  | "adaptive_eq_low_end"
  | "adaptive_eq_low_mid"
  | "adaptive_eq_presence"
  | "adaptive_eq_air"
  | "adaptive_compression_intensity"
  | "adaptive_transient_handling"
  | "adaptive_stereo_width"
  | "adaptive_limiter_ceiling"
  | "pre_master_low_end_db"
  | "pre_master_already_limited"
  | "pre_master_crest_db"
  | "post_master_integrated_lufs"
  | "post_master_peak_db"
  | "post_master_crest_db";

export type MasteringDecisionItem = {
  category: MasteringDecisionCategory;
  title: string;
  action: MasteringDecisionAction;
  explanation: string;
  dataSource: MasteringDecisionDataSource[];
};

export type MasteringDecisionMeasurements = {
  integratedLufs?: number;
  peakDb?: number;
  crestDb?: number;
};

export type MasteringDecisionReport = {
  summary: string;
  decisions: MasteringDecisionItem[];
  warnings: string[];
  preMeasurements: MasteringDecisionMeasurements;
  postMeasurements: MasteringDecisionMeasurements;
  selectedTargetLufs: number | null;
};

export type DecisionReportAnalysisInput = {
  integratedLufs: number | null;
  peakDb: number | null;
  crestDb: number | null;
  lowEndDb?: number | null;
  alreadyLimited?: boolean;
};

export type DecisionReportSettingsInput = {
  eqDirection: {
    lowEnd: number;
    lowMid: number;
    presence: number;
    air: number;
  };
  compressionIntensity: "light" | "medium" | "strong";
  stereoWidth: number;
  targetLufs: number;
  limiterCeilingDb?: number;
  transientHandling: "preserve" | "balanced" | "tight";
};

export type BuildMasteringDecisionReportInput = {
  settings?: DecisionReportSettingsInput | null;
  baseline?: DecisionReportAnalysisInput | null;
  postMaster?: DecisionReportAnalysisInput | null;
  validationWarnings?: string[] | null;
};

/**
 * Same V1 20–120 Hz band already used by MasterSauce as “already-strong low end”
 * (`lowEndDb > -19.5`). This module only interprets that existing measurement.
 */
export const STRONG_LOW_END_DB = -19.5;

/** Ignore EQ moves smaller than this so tiny float leftovers are not claimed. */
export const MEANINGFUL_EQ_DB = 0.25;

/** Allow small sample-peak vs limiter measurement slack. */
export const PEAK_SAFETY_TOLERANCE_DB = 0.15;

const MISSING_POST_MASTER_WARNING =
  "Post-master measurements were unavailable, so measured loudness and peak results are not shown.";

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function pickMeasurement(value: number | null | undefined): number | undefined {
  return isFiniteNumber(value) ? Number(value.toFixed(2)) : undefined;
}

function formatLufs(value: number): string {
  return `${value.toFixed(1)} LUFS`;
}

function hasStrongLowEnd(baseline: DecisionReportAnalysisInput | null | undefined): boolean {
  return isFiniteNumber(baseline?.lowEndDb) && baseline.lowEndDb > STRONG_LOW_END_DB;
}

function buildMeasurements(analysis: DecisionReportAnalysisInput | null | undefined): MasteringDecisionMeasurements {
  if (!analysis) return {};
  const measurements: MasteringDecisionMeasurements = {};
  const integratedLufs = pickMeasurement(analysis.integratedLufs);
  const peakDb = pickMeasurement(analysis.peakDb);
  const crestDb = pickMeasurement(analysis.crestDb);
  if (integratedLufs !== undefined) measurements.integratedLufs = integratedLufs;
  if (peakDb !== undefined) measurements.peakDb = peakDb;
  if (crestDb !== undefined) measurements.crestDb = crestDb;
  return measurements;
}

function buildLowEndDecision(
  settings: DecisionReportSettingsInput,
  baseline: DecisionReportAnalysisInput | null | undefined
): MasteringDecisionItem | null {
  const lowEndEq = settings.eqDirection.lowEnd;
  if (!isFiniteNumber(lowEndEq)) return null;

  if (lowEndEq <= -MEANINGFUL_EQ_DB) {
    return {
      category: "low_end",
      title: "Low End — Reduced",
      action: "reduced",
      explanation: "Low-frequency energy was reduced based on the Adaptive EQ decision.",
      dataSource: ["adaptive_eq_low_end"]
    };
  }

  if (lowEndEq >= MEANINGFUL_EQ_DB) {
    return {
      category: "low_end",
      title: "Low End — Enhanced",
      action: "enhanced",
      explanation: "Low-frequency energy was emphasized based on the Adaptive EQ decision.",
      dataSource: ["adaptive_eq_low_end"]
    };
  }

  if (hasStrongLowEnd(baseline)) {
    return {
      category: "low_end",
      title: "Low End — Protected",
      action: "protected",
      explanation:
        "Your mix already had strong low-frequency energy, so additional bass emphasis was avoided.",
      dataSource: ["adaptive_eq_low_end", "pre_master_low_end_db"]
    };
  }

  return null;
}

function buildDynamicsDecision(
  settings: DecisionReportSettingsInput,
  baseline: DecisionReportAnalysisInput | null | undefined
): MasteringDecisionItem | null {
  const intensity = settings.compressionIntensity;
  const transients = settings.transientHandling;
  const preserved =
    intensity === "light" || (intensity === "medium" && transients === "preserve");
  if (!preserved) return null;

  const dataSource: MasteringDecisionDataSource[] = ["adaptive_compression_intensity"];
  if (intensity === "medium") dataSource.push("adaptive_transient_handling");

  if (baseline?.alreadyLimited === true && intensity === "light") {
    dataSource.push("pre_master_already_limited");
    return {
      category: "dynamics",
      title: "Dynamics — Preserved",
      action: "preserved",
      explanation:
        "Your mix already sounded loud or limited, so mastering intensity was kept light to maintain transient impact.",
      dataSource
    };
  }

  return {
    category: "dynamics",
    title: "Dynamics — Preserved",
    action: "preserved",
    explanation:
      intensity === "light"
        ? "Mastering intensity was kept light to maintain transient impact."
        : "Mastering intensity was kept moderate to maintain transient impact.",
    dataSource
  };
}

function buildLoudnessDecision(
  postMaster: DecisionReportAnalysisInput | null | undefined
): MasteringDecisionItem | null {
  const measured = pickMeasurement(postMaster?.integratedLufs);
  if (measured === undefined) return null;
  return {
    category: "loudness",
    title: "Loudness",
    action: "measured",
    explanation: `Final measured loudness: ${formatLufs(measured)}`,
    dataSource: ["post_master_integrated_lufs"]
  };
}

function buildPeakSafetyDecision(
  settings: DecisionReportSettingsInput,
  postMaster: DecisionReportAnalysisInput | null | undefined
): MasteringDecisionItem | null {
  const peakDb = pickMeasurement(postMaster?.peakDb);
  const ceiling = settings.limiterCeilingDb;
  if (peakDb === undefined || !isFiniteNumber(ceiling)) return null;
  if (peakDb > ceiling + PEAK_SAFETY_TOLERANCE_DB) return null;
  return {
    category: "peak_safety",
    title: "Peak Level — Within Target",
    action: "within_target",
    explanation: "The measured sample peak stayed within the selected mastering ceiling.",
    dataSource: ["post_master_peak_db", "adaptive_limiter_ceiling"]
  };
}

function buildStereoDecision(settings: DecisionReportSettingsInput): MasteringDecisionItem | null {
  const width = settings.stereoWidth;
  if (!isFiniteNumber(width)) return null;

  if (!shouldApplyAdaptiveStereoWidthFilter(width)) {
    return {
      category: "stereo_image",
      title: "Stereo",
      action: "subtle",
      explanation: "Stereo processing was kept subtle.",
      dataSource: ["adaptive_stereo_width"]
    };
  }

  if (width > 1) {
    return {
      category: "stereo_image",
      title: "Stereo",
      action: "widened",
      explanation: "Stereo processing widened the image.",
      dataSource: ["adaptive_stereo_width"]
    };
  }

  if (width < 1) {
    return {
      category: "stereo_image",
      title: "Stereo",
      action: "narrowed",
      explanation: "Stereo processing narrowed the image.",
      dataSource: ["adaptive_stereo_width"]
    };
  }

  return null;
}

function buildTonalDecision(
  categoryTitle: string,
  action: Extract<MasteringDecisionAction, "lifted" | "softened">,
  explanation: string,
  dataSource: MasteringDecisionDataSource
): MasteringDecisionItem {
  return {
    category: "tonal_balance",
    title: categoryTitle,
    action,
    explanation,
    dataSource: [dataSource]
  };
}

function buildTonalDecisions(settings: DecisionReportSettingsInput): MasteringDecisionItem[] {
  const { lowMid, presence, air } = settings.eqDirection;
  const items: MasteringDecisionItem[] = [];

  if (isFiniteNumber(presence) && presence >= MEANINGFUL_EQ_DB) {
    items.push(
      buildTonalDecision("Presence — Lifted", "lifted", "Presence was lifted based on the Adaptive EQ decision.", "adaptive_eq_presence")
    );
  } else if (isFiniteNumber(presence) && presence <= -MEANINGFUL_EQ_DB) {
    items.push(
      buildTonalDecision(
        "Presence — Softened",
        "softened",
        "Presence was softened based on the Adaptive EQ decision.",
        "adaptive_eq_presence"
      )
    );
  }

  if (isFiniteNumber(air) && air >= MEANINGFUL_EQ_DB) {
    items.push(
      buildTonalDecision("Air — Lifted", "lifted", "High-frequency air was added based on the Adaptive EQ decision.", "adaptive_eq_air")
    );
  } else if (isFiniteNumber(air) && air <= -MEANINGFUL_EQ_DB) {
    items.push(
      buildTonalDecision("Air — Softened", "softened", "High-frequency air was reduced based on the Adaptive EQ decision.", "adaptive_eq_air")
    );
  }

  if (isFiniteNumber(lowMid) && lowMid >= MEANINGFUL_EQ_DB) {
    items.push(
      buildTonalDecision("Low Mids — Lifted", "lifted", "Low-mid energy was lifted based on the Adaptive EQ decision.", "adaptive_eq_low_mid")
    );
  } else if (isFiniteNumber(lowMid) && lowMid <= -MEANINGFUL_EQ_DB) {
    items.push(
      buildTonalDecision(
        "Low Mids — Softened",
        "softened",
        "Low-mid energy was reduced based on the Adaptive EQ decision.",
        "adaptive_eq_low_mid"
      )
    );
  }

  return items;
}

function buildSummary(decisions: MasteringDecisionItem[], postMasterAvailable: boolean): string {
  if (decisions.length === 0 && !postMasterAvailable) {
    return "Adaptive Mastering finished. Only decisions and measurements that could be proven are shown.";
  }
  if (decisions.length === 0) {
    return "Measured results from this Adaptive master.";
  }
  if (decisions.length === 1) {
    return "1 confirmed decision from the settings applied and measurements taken.";
  }
  return `${decisions.length} confirmed decisions from the settings applied and measurements taken.`;
}

function collectWarnings(
  validationWarnings: string[] | null | undefined,
  postMaster: DecisionReportAnalysisInput | null | undefined
): string[] {
  const warnings = (validationWarnings ?? []).filter((warning) => typeof warning === "string" && warning.trim());
  if (!postMaster && !warnings.some((warning) => /post-render analysis was unavailable/i.test(warning))) {
    warnings.push(MISSING_POST_MASTER_WARNING);
  }
  return warnings;
}

export function buildMasteringDecisionReport(
  input: BuildMasteringDecisionReportInput
): MasteringDecisionReport {
  const settings = input.settings ?? null;
  const baseline = input.baseline ?? null;
  const postMaster = input.postMaster ?? null;
  const preMeasurements = buildMeasurements(baseline);
  const postMeasurements = buildMeasurements(postMaster);
  const selectedTargetLufs = isFiniteNumber(settings?.targetLufs) ? Number(settings.targetLufs.toFixed(2)) : null;

  const decisions: MasteringDecisionItem[] = [];
  if (settings) {
    const lowEnd = buildLowEndDecision(settings, baseline);
    if (lowEnd) decisions.push(lowEnd);
    const dynamics = buildDynamicsDecision(settings, baseline);
    if (dynamics) decisions.push(dynamics);
    const loudness = buildLoudnessDecision(postMaster);
    if (loudness) decisions.push(loudness);
    const peakSafety = buildPeakSafetyDecision(settings, postMaster);
    if (peakSafety) decisions.push(peakSafety);
    const stereo = buildStereoDecision(settings);
    if (stereo) decisions.push(stereo);
    decisions.push(...buildTonalDecisions(settings));
  } else {
    const loudness = buildLoudnessDecision(postMaster);
    if (loudness) decisions.push(loudness);
  }

  return {
    summary: buildSummary(decisions, Object.keys(postMeasurements).length > 0),
    decisions,
    warnings: collectWarnings(input.validationWarnings, postMaster),
    preMeasurements,
    postMeasurements,
    selectedTargetLufs
  };
}

export function hasDisplayableMasteringDecisionReport(
  report: MasteringDecisionReport | null | undefined
): boolean {
  if (!report) return false;
  return (
    report.decisions.length > 0 ||
    report.warnings.length > 0 ||
    Object.keys(report.preMeasurements).length > 0 ||
    Object.keys(report.postMeasurements).length > 0
  );
}

export function canShowMasteringDecisionReport(
  adaptiveResultExists: boolean,
  report: MasteringDecisionReport | null | undefined
): boolean {
  return adaptiveResultExists === true && hasDisplayableMasteringDecisionReport(report);
}

export function reportTextContainsTruePeakClaim(text: string): boolean {
  return /\btrue\s*peak\b|\bdbtp\b/i.test(text);
}

export function loudnessExplanationUsesMeasuredLufs(
  decision: MasteringDecisionItem | null | undefined,
  measuredLufs: number,
  targetLufs: number
): boolean {
  if (!decision || decision.category !== "loudness") return false;
  const measuredLabel = formatLufs(measuredLufs);
  const targetLabel = formatLufs(targetLufs);
  if (!decision.explanation.includes(measuredLabel)) return false;
  if (measuredLabel !== targetLabel && decision.explanation.includes(targetLabel)) return false;
  return true;
}
