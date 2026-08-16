/**
 * Master Readiness evaluator — mix-issue interpretation only.
 *
 * Uses measurements already produced by the production Track Analysis pipeline
 * (TrackAnalysis V1, plus TrackAnalysisV2 summary when present). It does not
 * spawn FFmpeg, invent measurements, or change mastering DSP.
 *
 * Fail-open: missing/incomplete analysis never blocks mastering. Findings are
 * emitted only when the supporting measurement exists.
 */
import type { TrackAnalysis } from "@/lib/audio/analyze-track";
import type { TrackAnalysisV2Summary } from "@/lib/audio/track-analysis-v2-types";
import { V2_THRESHOLDS } from "@/lib/audio/track-analysis-v2-thresholds";

export type MasterReadinessStatus = "Ready to Master" | "Minor Issues Detected" | "Fix Mix First";
export type MasterReadinessSeverity = "positive" | "minor" | "major" | "critical";
export type MasterReadinessFindingId = "low_end" | "harshness" | "dynamics" | "headroom";
export type MasterReadinessRecommendedAction = "master_anyway" | "analyze_and_improve_mix";

export type MasterReadinessFinding = {
  id: MasterReadinessFindingId;
  title: string;
  severity: MasterReadinessSeverity;
  explanation: string;
};

export type MasterReadinessResult = {
  status: MasterReadinessStatus;
  /** 0–100 when at least {@link MASTER_READINESS_THRESHOLDS.minDimensionsForScore} dimensions can be scored. */
  score: number | null;
  findings: MasterReadinessFinding[];
  severity: MasterReadinessSeverity | "none";
  explanation: string;
  recommendedAction: MasterReadinessRecommendedAction;
  analysisComplete: boolean;
};

/**
 * Centralized, testable thresholds.
 *
 * Spectral deltas reuse V2 diagnostic cutoffs where the same comparison exists.
 * V1-only band comparisons are conservative so we do not over-claim from the
 * coarser 20–120 Hz / 3–8 kHz production bands.
 */
export const MASTER_READINESS_THRESHOLDS = {
  /** V1 low-end (20–120 Hz) vs body bands — same cutoff as V2 low_end_excess. */
  lowEndExcessDb: V2_THRESHOLDS.lowEndExcessDb,
  /** Softer V1 low-end elevation (still requires a real band delta). */
  lowEndElevatedDb: 3.5,

  /**
   * V1 presence (3–8 kHz) vs body. Slightly above V2's +3 dB upper-mid flag
   * because the V1 band is wider and less specific.
   */
  harshnessExcessDb: 4,
  harshnessElevatedDb: 2,
  /** V1 air (9–16 kHz) vs body — air is normally quieter, so the bar is higher. */
  airExcessDb: 6,
  airElevatedDb: 3.5,

  /** Matches V2 overly_compressed crest and V1 alreadyLimited crest heuristic. */
  compressedCrestDb: V2_THRESHOLDS.overlyCompressedCrestDb,
  compressedCrestMinorDb: 7.5,
  healthyCrestMinDb: 7.5,
  /** Matches analyze-track "highly dynamic" note (crest > 14). */
  healthyCrestMaxDb: 14,
  compressedLraLu: V2_THRESHOLDS.overlyCompressedLraLu,

  /** Matches V2 clipping sample-peak cutoff. */
  clippingPeakDb: V2_THRESHOLDS.clippingSamplePeakDb,
  /** Matches V2 clipping true-peak cutoff / V1 peak-safety "risk of clipping". */
  hotPeakDb: V2_THRESHOLDS.clippingTruePeakDb,
  tightPeakDb: -1.0,

  dimensionScoreOk: 100,
  dimensionScoreMinor: 70,
  dimensionScoreMajor: 35,
  dimensionScoreCritical: 15,

  maxFindings: 4,
  minDimensionsForScore: 2,
  /** Combined readiness backstop — not a quality rating cutoff. */
  fixMixScoreBelow: 50,
  /** A single tonal major (low-end or harshness) is not enough on its own. */
  fixMixMajorCountAtLeast: 2
} as const;

/** Categories that can escalate a single major finding to Fix Mix First. */
const SAFETY_FINDING_IDS: ReadonlySet<MasterReadinessFindingId> = new Set([
  "headroom",
  "dynamics"
]);

const FINDING_TITLES: Record<MasterReadinessFindingId, string> = {
  low_end: "Low-End",
  harshness: "Harshness",
  dynamics: "Dynamics",
  headroom: "Headroom / Peaks"
};

const SEVERITY_RANK: Record<MasterReadinessSeverity, number> = {
  critical: 4,
  major: 3,
  minor: 2,
  positive: 1
};

const FINDING_ORDER: MasterReadinessFindingId[] = ["headroom", "low_end", "harshness", "dynamics"];

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function average(values: Array<number | null | undefined>): number | null {
  const present = values.filter(isFiniteNumber);
  if (!present.length) return null;
  return present.reduce((sum, value) => sum + value, 0) / present.length;
}

function hasV2Flag(analysisV2: TrackAnalysisV2Summary | null | undefined, flag: string): boolean {
  return Boolean(analysisV2?.activeFlags?.includes(flag));
}

function dimensionScore(severity: MasterReadinessSeverity | "ok" | "unavailable"): number | null {
  const t = MASTER_READINESS_THRESHOLDS;
  if (severity === "unavailable") return null;
  if (severity === "ok") return t.dimensionScoreOk;
  if (severity === "positive") return t.dimensionScoreOk;
  if (severity === "minor") return t.dimensionScoreMinor;
  if (severity === "major") return t.dimensionScoreMajor;
  return t.dimensionScoreCritical;
}

function overallSeverity(findings: MasterReadinessFinding[]): MasterReadinessSeverity | "none" {
  if (!findings.length) return "none";
  if (findings.some((finding) => finding.severity === "critical")) return "critical";
  if (findings.some((finding) => finding.severity === "major")) return "major";
  if (findings.some((finding) => finding.severity === "minor")) return "minor";
  return "positive";
}

function selectFindings(candidates: MasterReadinessFinding[]): MasterReadinessFinding[] {
  return [...candidates]
    .sort((a, b) => {
      const severityDelta = SEVERITY_RANK[b.severity] - SEVERITY_RANK[a.severity];
      if (severityDelta !== 0) return severityDelta;
      return FINDING_ORDER.indexOf(a.id) - FINDING_ORDER.indexOf(b.id);
    })
    .slice(0, MASTER_READINESS_THRESHOLDS.maxFindings);
}

function incompleteResult(): MasterReadinessResult {
  return {
    status: "Ready to Master",
    score: null,
    findings: [],
    severity: "none",
    explanation:
      "Not enough mix measurements were available to assess readiness. You can still master.",
    recommendedAction: "master_anyway",
    analysisComplete: false
  };
}

function evaluateLowEnd(
  analysis: TrackAnalysis,
  analysisV2: TrackAnalysisV2Summary | null | undefined
): { finding: MasterReadinessFinding | null; score: number | null } {
  if (analysisV2) {
    if (hasV2Flag(analysisV2, "low_end_excess")) {
      return {
        finding: {
          id: "low_end",
          title: FINDING_TITLES.low_end,
          severity: "major",
          explanation: "Excessive energy below ~80 Hz may cause limiting/pumping."
        },
        score: dimensionScore("major")
      };
    }
    return { finding: null, score: dimensionScore("ok") };
  }

  const { lowEndDb, lowMidDb, harshnessDb } = analysis;
  if (!isFiniteNumber(lowEndDb)) {
    return { finding: null, score: null };
  }
  const body = average([lowMidDb, harshnessDb]);
  if (body === null) {
    return { finding: null, score: null };
  }

  const delta = lowEndDb - body;
  if (delta > MASTER_READINESS_THRESHOLDS.lowEndExcessDb) {
    return {
      finding: {
        id: "low_end",
        title: FINDING_TITLES.low_end,
        severity: "major",
        explanation: "Excessive low-end energy (20–120 Hz) may cause limiting/pumping."
      },
      score: dimensionScore("major")
    };
  }
  if (delta > MASTER_READINESS_THRESHOLDS.lowEndElevatedDb) {
    return {
      finding: {
        id: "low_end",
        title: FINDING_TITLES.low_end,
        severity: "minor",
        explanation: "Low-end energy is elevated and may need a tighter balance before mastering."
      },
      score: dimensionScore("minor")
    };
  }
  return { finding: null, score: dimensionScore("ok") };
}

function evaluateHarshness(
  analysis: TrackAnalysis,
  analysisV2: TrackAnalysisV2Summary | null | undefined
): { finding: MasterReadinessFinding | null; score: number | null } {
  if (analysisV2) {
    if (hasV2Flag(analysisV2, "harsh_upper_mids") || hasV2Flag(analysisV2, "excessive_sibilance")) {
      return {
        finding: {
          id: "harshness",
          title: FINDING_TITLES.harshness,
          severity: "major",
          explanation: "Strong upper-mid/high-frequency energy may become more noticeable after mastering."
        },
        score: dimensionScore("major")
      };
    }
    return { finding: null, score: dimensionScore("ok") };
  }

  const { lowEndDb, lowMidDb, harshnessDb, airDb } = analysis;
  const body = average([lowEndDb, lowMidDb]);
  const harshnessDelta = isFiniteNumber(harshnessDb) && body !== null ? harshnessDb - body : null;
  const airDelta = isFiniteNumber(airDb) && body !== null ? airDb - body : null;

  if (harshnessDelta === null && airDelta === null) {
    return { finding: null, score: null };
  }

  const harshMajor =
    (harshnessDelta !== null && harshnessDelta > MASTER_READINESS_THRESHOLDS.harshnessExcessDb) ||
    (airDelta !== null && airDelta > MASTER_READINESS_THRESHOLDS.airExcessDb);
  const harshMinor =
    (harshnessDelta !== null && harshnessDelta > MASTER_READINESS_THRESHOLDS.harshnessElevatedDb) ||
    (airDelta !== null && airDelta > MASTER_READINESS_THRESHOLDS.airElevatedDb);

  if (harshMajor) {
    return {
      finding: {
        id: "harshness",
        title: FINDING_TITLES.harshness,
        severity: "major",
        explanation: isFiniteNumber(harshnessDb)
          ? "Strong presence-band energy (3–8 kHz) may become more noticeable after mastering."
          : "Strong high-frequency energy may become more noticeable after mastering."
      },
      score: dimensionScore("major")
    };
  }
  if (harshMinor) {
    return {
      finding: {
        id: "harshness",
        title: FINDING_TITLES.harshness,
        severity: "minor",
        explanation: "Upper-mid or high-frequency energy is a bit forward and may become more noticeable after mastering."
      },
      score: dimensionScore("minor")
    };
  }
  return { finding: null, score: dimensionScore("ok") };
}

function evaluateDynamics(
  analysis: TrackAnalysis,
  analysisV2: TrackAnalysisV2Summary | null | undefined
): { finding: MasterReadinessFinding | null; score: number | null } {
  if (analysisV2) {
    if (hasV2Flag(analysisV2, "overly_compressed")) {
      return {
        finding: {
          id: "dynamics",
          title: FINDING_TITLES.dynamics,
          severity: "major",
          explanation: "The mix appears highly compressed, which can limit what mastering can add."
        },
        score: dimensionScore("major")
      };
    }

    const crest = isFiniteNumber(analysisV2.crestFactorDb) ? analysisV2.crestFactorDb : null;
    if (crest !== null && crest < MASTER_READINESS_THRESHOLDS.compressedCrestMinorDb) {
      return {
        finding: {
          id: "dynamics",
          title: FINDING_TITLES.dynamics,
          severity: "minor",
          explanation: "Dynamics are on the tighter side; mastering will have less transient information to work with."
        },
        score: dimensionScore("minor")
      };
    }
    if (
      crest !== null &&
      crest >= MASTER_READINESS_THRESHOLDS.healthyCrestMinDb &&
      crest <= MASTER_READINESS_THRESHOLDS.healthyCrestMaxDb
    ) {
      return {
        finding: {
          id: "dynamics",
          title: FINDING_TITLES.dynamics,
          severity: "positive",
          explanation: "Healthy transient/dynamic information is available for mastering."
        },
        score: dimensionScore("positive")
      };
    }
    return { finding: null, score: dimensionScore("ok") };
  }

  const crest = isFiniteNumber(analysis.crestDb) ? analysis.crestDb : null;
  if (crest === null) {
    return { finding: null, score: null };
  }

  if (crest < MASTER_READINESS_THRESHOLDS.compressedCrestDb) {
    return {
      finding: {
        id: "dynamics",
        title: FINDING_TITLES.dynamics,
        severity: "major",
        explanation: "The mix appears highly compressed, which can limit what mastering can add."
      },
      score: dimensionScore("major")
    };
  }

  if (crest < MASTER_READINESS_THRESHOLDS.compressedCrestMinorDb) {
    return {
      finding: {
        id: "dynamics",
        title: FINDING_TITLES.dynamics,
        severity: "minor",
        explanation: "Dynamics are on the tighter side; mastering will have less transient information to work with."
      },
      score: dimensionScore("minor")
    };
  }

  if (
    crest >= MASTER_READINESS_THRESHOLDS.healthyCrestMinDb &&
    crest <= MASTER_READINESS_THRESHOLDS.healthyCrestMaxDb
  ) {
    return {
      finding: {
        id: "dynamics",
        title: FINDING_TITLES.dynamics,
        severity: "positive",
        explanation: "Healthy transient/dynamic information is available for mastering."
      },
      score: dimensionScore("positive")
    };
  }

  return { finding: null, score: dimensionScore("ok") };
}

function peakSeverityFromMeasurements(
  truePeak: number | null,
  samplePeak: number | null
): { finding: MasterReadinessFinding | null; score: number | null } {
  const t = MASTER_READINESS_THRESHOLDS;
  const clipping =
    (truePeak !== null && truePeak > t.clippingPeakDb) ||
    (samplePeak !== null && samplePeak > t.clippingPeakDb);
  if (clipping) {
    return {
      finding: {
        id: "headroom",
        title: FINDING_TITLES.headroom,
        severity: "critical",
        explanation: "Potential clipping or insufficient headroom detected."
      },
      score: dimensionScore("critical")
    };
  }

  const hot =
    (truePeak !== null && truePeak > t.hotPeakDb) ||
    (samplePeak !== null && samplePeak > t.hotPeakDb);
  if (hot) {
    return {
      finding: {
        id: "headroom",
        title: FINDING_TITLES.headroom,
        severity: "major",
        explanation: "Peaks are very close to full scale, leaving little headroom for mastering."
      },
      score: dimensionScore("major")
    };
  }

  const tight =
    (truePeak !== null && truePeak > t.tightPeakDb) ||
    (samplePeak !== null && samplePeak > t.tightPeakDb);
  if (tight) {
    return {
      finding: {
        id: "headroom",
        title: FINDING_TITLES.headroom,
        severity: "minor",
        explanation: "Peak headroom is tight; a little more space would give mastering more room to work."
      },
      score: dimensionScore("minor")
    };
  }

  return { finding: null, score: dimensionScore("ok") };
}

function evaluateHeadroom(
  analysis: TrackAnalysis,
  analysisV2: TrackAnalysisV2Summary | null | undefined
): { finding: MasterReadinessFinding | null; score: number | null } {
  if (analysisV2) {
    if (hasV2Flag(analysisV2, "clipping_risk")) {
      return {
        finding: {
          id: "headroom",
          title: FINDING_TITLES.headroom,
          severity: "critical",
          explanation: "Potential clipping or insufficient headroom detected."
        },
        score: dimensionScore("critical")
      };
    }

    const truePeak = isFiniteNumber(analysisV2.truePeakDb) ? analysisV2.truePeakDb : null;
    const samplePeak = isFiniteNumber(analysisV2.samplePeakDb) ? analysisV2.samplePeakDb : null;
    if (truePeak === null && samplePeak === null) {
      return { finding: null, score: dimensionScore("ok") };
    }
    const graded = peakSeverityFromMeasurements(truePeak, samplePeak);
    if (graded.finding?.severity === "critical") {
      return {
        finding: {
          id: "headroom",
          title: FINDING_TITLES.headroom,
          severity: "major",
          explanation: "Peaks are very close to full scale, leaving little headroom for mastering."
        },
        score: dimensionScore("major")
      };
    }
    return graded;
  }

  const samplePeak = isFiniteNumber(analysis.peakDb) ? analysis.peakDb : null;
  if (samplePeak === null) {
    return { finding: null, score: null };
  }
  return peakSeverityFromMeasurements(null, samplePeak);
}

function buildExplanation(status: MasterReadinessStatus, analysisComplete: boolean): string {
  if (!analysisComplete) {
    return "Not enough mix measurements were available to assess readiness. You can still master.";
  }
  if (status === "Ready to Master") {
    return "This mix looks ready for Adaptive Mastering.";
  }
  if (status === "Minor Issues Detected") {
    return "A few mix issues showed up. You can master anyway, or review them in Hit Analyzer first.";
  }
  return "Important mix issues should be addressed first. You can still master anyway.";
}

/**
 * Fix Mix First is reserved for safety / extreme-compression / stacked issues.
 * A single tonal major (low-end or harshness) stays at Minor Issues Detected.
 */
function shouldFixMixFirst(findings: MasterReadinessFinding[], score: number | null): boolean {
  const t = MASTER_READINESS_THRESHOLDS;
  const issues = findings.filter((finding) => finding.severity !== "positive");
  const criticalCount = issues.filter((finding) => finding.severity === "critical").length;
  const majorIssues = issues.filter((finding) => finding.severity === "major");
  const hasSafetyMajor = majorIssues.some((finding) => SAFETY_FINDING_IDS.has(finding.id));
  return (
    criticalCount >= 1 ||
    hasSafetyMajor ||
    majorIssues.length >= t.fixMixMajorCountAtLeast ||
    (score !== null && score < t.fixMixScoreBelow)
  );
}

/**
 * Interpret existing track analysis as a pre-Adaptive Mastering readiness check.
 * Never throws. Incomplete input fails open (does not block mastering).
 */
export function evaluateMasterReadiness(
  trackAnalysis: TrackAnalysis | null | undefined,
  analysisV2?: TrackAnalysisV2Summary | null
): MasterReadinessResult {
  if (!trackAnalysis) {
    return incompleteResult();
  }

  const lowEnd = evaluateLowEnd(trackAnalysis, analysisV2);
  const harshness = evaluateHarshness(trackAnalysis, analysisV2);
  const dynamics = evaluateDynamics(trackAnalysis, analysisV2);
  const headroom = evaluateHeadroom(trackAnalysis, analysisV2);

  const dimensionScores = [lowEnd.score, harshness.score, dynamics.score, headroom.score].filter(
    (value): value is number => value !== null
  );
  const analysisComplete = dimensionScores.length > 0;
  if (!analysisComplete) {
    return incompleteResult();
  }

  const findings = selectFindings(
    [lowEnd.finding, harshness.finding, dynamics.finding, headroom.finding].filter(
      (finding): finding is MasterReadinessFinding => finding !== null
    )
  );

  const score =
    dimensionScores.length >= MASTER_READINESS_THRESHOLDS.minDimensionsForScore
      ? Math.round(dimensionScores.reduce((sum, value) => sum + value, 0) / dimensionScores.length)
      : null;

  const issueFindings = findings.filter((finding) => finding.severity !== "positive");

  let status: MasterReadinessStatus;
  if (shouldFixMixFirst(findings, score)) {
    status = "Fix Mix First";
  } else if (issueFindings.length > 0) {
    status = "Minor Issues Detected";
  } else {
    status = "Ready to Master";
  }

  return {
    status,
    score,
    findings,
    severity: overallSeverity(findings),
    explanation: buildExplanation(status, true),
    recommendedAction: status === "Ready to Master" ? "master_anyway" : "analyze_and_improve_mix",
    analysisComplete: true
  };
}
