import type { TrackAnalysis } from "@/lib/audio/analyze-track";

export type ReadinessVerdict = "Streaming-ready" | "Almost ready" | "Not fully streaming-ready";
export type ReadinessContext = "premaster" | "postmaster";

export type PreMasterAnalysisResult = {
  verdict: ReadinessVerdict;
  loudness: {
    valueLufs: number | null;
    status: string;
  };
  peakSafety: {
    valueDb: number | null;
    status: string;
  };
  dynamicControl: {
    valueDb: number | null;
    status: string;
  };
  recommendation: string;
};

function asRounded(value: number | null): number | null {
  if (value === null || !Number.isFinite(value)) return null;
  return Number(value.toFixed(2));
}

export function evaluateTrackReadiness(
  analysis: TrackAnalysis,
  context: ReadinessContext = "premaster"
): PreMasterAnalysisResult {
  const integratedLufs = asRounded(analysis.integratedLufs);
  const peakDb = asRounded(analysis.peakDb);
  const crestDb = asRounded(analysis.crestDb);
  const isPostMaster = context === "postmaster";

  // Internal distinction:
  // - uploadSafe: technically safe for upload (broad, permissive)
  // - commerciallyCompetitive: strong final-master competitiveness (strict)
  const uploadSafe =
    (integratedLufs === null ||
      (integratedLufs <= (isPostMaster ? -8.0 : -8.8) && integratedLufs >= -18)) &&
    (peakDb === null || peakDb <= -0.3) &&
    (crestDb === null || (crestDb >= 5.5 && crestDb <= 16));

  // Streaming-ready is intentionally strict and should be rare.
  const loudnessStrong = integratedLufs !== null && integratedLufs <= -9.6 && integratedLufs >= -11.8;
  const peakStrong = peakDb !== null && peakDb <= -0.7 && peakDb >= -1.6;
  const dynamicsStrong = crestDb !== null && crestDb >= 6.5 && crestDb <= 10.5;
  const commerciallyCompetitive = loudnessStrong && peakStrong && dynamicsStrong;

  // Near-ready is broader but still requires at least decent performance.
  const loudnessNear =
    integratedLufs !== null &&
    integratedLufs <= (isPostMaster ? -8.0 : -9.0) &&
    integratedLufs >= -13.8;
  const peakNear = peakDb !== null && peakDb <= -0.3 && peakDb >= -2.4;
  const dynamicsNear = crestDb !== null && crestDb >= 6 && crestDb <= 13;
  const nearSignals = [loudnessNear, peakNear, dynamicsNear].filter(Boolean).length;
  const nearReady = nearSignals >= 2;

  // Explicit downgrade for under-finished masters with excessive headroom.
  const hasExcessHeadroom = peakDb !== null && peakDb < -2.4;
  const borderlineLoudness = integratedLufs !== null && integratedLufs < -12.4;

  const verdict: ReadinessVerdict = commerciallyCompetitive && !hasExcessHeadroom && !borderlineLoudness
    ? "Streaming-ready"
    : uploadSafe && nearReady
      ? "Almost ready"
      : "Not fully streaming-ready";

  const loudnessStatus =
    integratedLufs === null
      ? "Unavailable"
      : loudnessStrong
        ? "Competitive loudness range"
        : integratedLufs > -9.6
          ? "Potentially too hot for clean platform translation"
          : integratedLufs < -12.4
            ? "Below competitive loudness for final release"
            : "Close, but still short of competitive range";

  const peakStatus =
    peakDb === null
      ? "Unavailable"
      : peakStrong
        ? "Strong peak positioning"
        : peakDb < -2.4
          ? "Excess headroom; level is under-finished"
          : peakNear
            ? "Safe but not fully optimized"
            : "Risk of clipping";

  const dynamicStatus =
    crestDb === null
      ? "Unavailable"
      : dynamicsStrong
        ? "Well-controlled dynamics"
        : crestDb < 6.5
          ? "Potentially over-limited"
          : "Quite dynamic; may need tighter control";

  const recommendation =
    verdict === "Streaming-ready"
      ? "Your track is in a strong range, but mastering can still improve clarity, consistency, and translation across platforms."
      : verdict === "Almost ready"
        ? "Your track is close to release-ready, but it could still benefit from a final master for better loudness, polish, and competitive playback."
        : "Your track may upload safely, but it is not yet optimized to compete consistently with mastered releases.";

  if (process.env.NODE_ENV !== "production") {
    console.log("[PREMASTER_DEBUG] evaluateTrackReadiness", {
      context,
      integratedLufs,
      peakDb,
      crestDb,
      uploadSafe,
      commerciallyCompetitive,
      loudnessStrong,
      peakStrong,
      dynamicsStrong,
      nearSignals,
      nearReady,
      hasExcessHeadroom,
      borderlineLoudness,
      verdict
    });
  }

  return {
    verdict,
    loudness: {
      valueLufs: integratedLufs,
      status: loudnessStatus
    },
    peakSafety: {
      valueDb: peakDb,
      status: peakStatus
    },
    dynamicControl: {
      valueDb: crestDb,
      status: dynamicStatus
    },
    recommendation
  };
}
