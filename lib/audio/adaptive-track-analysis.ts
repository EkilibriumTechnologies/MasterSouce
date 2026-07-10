import { analyzeTrack, type TrackAnalysis } from "@/lib/audio/analyze-track";
import {
  analyzeTrackV2,
  type AnalyzeTrackV2Options,
  type TrackAnalysisV2
} from "@/lib/audio/track-analysis-v2";
import { metricValue } from "@/lib/audio/track-analysis-v2-thresholds";
import {
  resolveTrackAnalysisV2Enablement,
  resolveTrackAnalysisV2Mode,
  type TrackAnalysisV2FlagMode
} from "@/lib/features/track-analysis-v2";

export type AdaptiveAnalysisImplementation = "v1" | "v2" | "v1_fallback";

export type AdaptiveAnalysisDiagnostics = {
  requestedAnalysisVersion: "v1" | "v2";
  ownerEligible: boolean;
  featureFlagMode: TrackAnalysisV2FlagMode;
  featureFlagValue: string | null;
  actualImplementation: AdaptiveAnalysisImplementation;
  fallbackOccurred: boolean;
  fallbackReason: string | null;
};

export type AdaptiveAnalysisRouting = {
  enableV2: boolean;
  requestedAnalysisVersion: "v1" | "v2";
  ownerEligible: boolean;
  featureFlagMode: TrackAnalysisV2FlagMode;
  featureFlagValue: string | null;
};

export type AdaptiveAnalysisResult = {
  analysis: TrackAnalysis;
  diagnostics: AdaptiveAnalysisDiagnostics;
};

export type AdaptiveTrackAnalyzer = (inputPath: string) => Promise<AdaptiveAnalysisResult>;

export type AdaptiveTrackAnalyzerOverrides = {
  analyzeV1?: (inputPath: string) => Promise<TrackAnalysis>;
  analyzeV2?: (inputPath: string, options?: AnalyzeTrackV2Options) => Promise<TrackAnalysisV2>;
  v2Options?: AnalyzeTrackV2Options;
};

function average(values: Array<number | null>): number | null {
  const usable = values.filter((value): value is number => value !== null && Number.isFinite(value));
  if (!usable.length) return null;
  return Number((usable.reduce((sum, value) => sum + value, 0) / usable.length).toFixed(2));
}

function rounded(value: number | null): number | null {
  return value === null || !Number.isFinite(value) ? null : Number(value.toFixed(2));
}

function buildNotes(analysis: TrackAnalysis, v2: TrackAnalysisV2): string[] {
  const notes: string[] = [];
  if (analysis.alreadyLimited) {
    notes.push("Track appears already loud/limited; mastering intensity should be reduced.");
  }
  if (analysis.lowMidDb !== null && analysis.lowMidDb > -22) {
    notes.push("Low-mid density is elevated (possible mud).");
  }
  if (analysis.harshnessDb !== null && analysis.harshnessDb > -24) {
    notes.push("Presence band is hot; reduce potential harshness.");
  }
  if (analysis.crestDb !== null && analysis.crestDb > 14) {
    notes.push("Track is highly dynamic; avoid over-limiting.");
  }
  if (v2.flags.low_end_stereo_risk) {
    notes.push("Low-frequency stereo content may reduce mono translation.");
  }
  if (v2.flags.phase_risk) {
    notes.push("Stereo phase correlation suggests possible mono compatibility risk.");
  }
  return notes;
}

export function adaptTrackAnalysisV2ToTrackAnalysis(v2: TrackAnalysisV2): TrackAnalysis | null {
  const measured = v2.measured;
  const durationSec = rounded(metricValue(measured.integrity.durationSec));
  const integratedLufs = rounded(metricValue(measured.loudness.integratedLufs));
  const samplePeakDb = metricValue(measured.peaks.samplePeakDb);
  const truePeakDb = metricValue(measured.peaks.truePeakDb);
  const peakDb = rounded(samplePeakDb ?? truePeakDb);
  const meanDb = rounded(metricValue(measured.dynamics.rmsLevelDb));
  const measuredCrest = metricValue(measured.dynamics.crestFactorDb);
  const crestDb = rounded(
    measuredCrest ?? (peakDb !== null && meanDb !== null ? peakDb - meanDb : null)
  );

  if (integratedLufs === null || peakDb === null || crestDb === null) {
    return null;
  }

  const lowEndDb = average([
    metricValue(measured.spectrumBands.subBassDb),
    metricValue(measured.spectrumBands.bassDb)
  ]);
  const lowMidDb = rounded(metricValue(measured.spectrumBands.lowMidDb));
  const harshnessDb = average([
    metricValue(measured.spectrumBands.upperMidDb),
    metricValue(measured.spectrumBands.presenceDb)
  ]);
  const airDb = rounded(metricValue(measured.spectrumBands.brillianceDb));
  const alreadyLimited =
    integratedLufs > -10.5 ||
    peakDb > -0.4 ||
    crestDb < 6 ||
    v2.flags.overly_compressed ||
    v2.flags.clipping_risk;

  const analysis: TrackAnalysis = {
    durationSec,
    integratedLufs,
    peakDb,
    meanDb,
    crestDb,
    lowEndDb,
    lowMidDb,
    harshnessDb,
    airDb,
    alreadyLimited,
    notes: []
  };
  analysis.notes = buildNotes(analysis, v2);
  return analysis;
}

export function resolveAdaptiveAnalysisRouting(params: {
  ownerEligible: boolean;
  env?: NodeJS.ProcessEnv;
}): AdaptiveAnalysisRouting {
  const env = params.env ?? process.env;
  const featureFlagMode = resolveTrackAnalysisV2Mode(env);
  const enableV2 = resolveTrackAnalysisV2Enablement(() => params.ownerEligible, env);
  return {
    enableV2,
    requestedAnalysisVersion: enableV2 ? "v2" : "v1",
    ownerEligible: params.ownerEligible,
    featureFlagMode,
    featureFlagValue: typeof env.TRACK_ANALYSIS_V2_ENABLED === "string" ? env.TRACK_ANALYSIS_V2_ENABLED : null
  };
}

function buildDiagnostics(
  routing: AdaptiveAnalysisRouting,
  actualImplementation: AdaptiveAnalysisImplementation,
  fallbackReason: string | null
): AdaptiveAnalysisDiagnostics {
  return {
    requestedAnalysisVersion: routing.requestedAnalysisVersion,
    ownerEligible: routing.ownerEligible,
    featureFlagMode: routing.featureFlagMode,
    featureFlagValue: routing.featureFlagValue,
    actualImplementation,
    fallbackOccurred: actualImplementation === "v1_fallback",
    fallbackReason
  };
}

export function createAdaptiveTrackAnalyzer(
  routing: AdaptiveAnalysisRouting,
  overrides: AdaptiveTrackAnalyzerOverrides = {}
): AdaptiveTrackAnalyzer {
  const runV1 = overrides.analyzeV1 ?? analyzeTrack;
  const runV2 = overrides.analyzeV2 ?? analyzeTrackV2;

  return async (inputPath: string): Promise<AdaptiveAnalysisResult> => {
    if (!routing.enableV2) {
      return {
        analysis: await runV1(inputPath),
        diagnostics: buildDiagnostics(routing, "v1", null)
      };
    }

    try {
      const v2 = await runV2(inputPath, overrides.v2Options);
      const adapted = adaptTrackAnalysisV2ToTrackAnalysis(v2);
      if (adapted) {
        return {
          analysis: adapted,
          diagnostics: buildDiagnostics(routing, "v2", null)
        };
      }
      const fallbackReason = "v2_missing_core_adaptive_metrics";
      if (process.env.NODE_ENV !== "production") {
        console.warn("[ADAPTIVE_ANALYSIS_DEBUG] fallback_to_v1", {
          fallbackReason,
          requestedAnalysisVersion: routing.requestedAnalysisVersion,
          ownerEligible: routing.ownerEligible,
          featureFlagMode: routing.featureFlagMode,
          featureFlagValue: routing.featureFlagValue
        });
      }
      return {
        analysis: await runV1(inputPath),
        diagnostics: buildDiagnostics(routing, "v1_fallback", fallbackReason)
      };
    } catch (error) {
      const fallbackReason = error instanceof Error ? error.message : String(error);
      if (process.env.NODE_ENV !== "production") {
        console.warn("[ADAPTIVE_ANALYSIS_DEBUG] fallback_to_v1", {
          fallbackReason,
          requestedAnalysisVersion: routing.requestedAnalysisVersion,
          ownerEligible: routing.ownerEligible,
          featureFlagMode: routing.featureFlagMode,
          featureFlagValue: routing.featureFlagValue
        });
      }
      return {
        analysis: await runV1(inputPath),
        diagnostics: buildDiagnostics(routing, "v1_fallback", fallbackReason)
      };
    }
  };
}
