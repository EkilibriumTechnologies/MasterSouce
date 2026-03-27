import type { TrackAnalysis } from "@/lib/audio/analyze-track";

/** Subset of track analysis exposed on the master job API response */
export type PublicTrackMetrics = {
  durationSec: number | null;
  integratedLufs: number | null;
  peakDb: number | null;
  crestDb: number | null;
};

export function toPublicMetrics(analysis: TrackAnalysis): PublicTrackMetrics {
  return {
    durationSec: analysis.durationSec,
    integratedLufs: analysis.integratedLufs,
    peakDb: analysis.peakDb,
    crestDb: analysis.crestDb
  };
}

export function hasAnyMetric(m: PublicTrackMetrics | null | undefined): boolean {
  if (!m) return false;
  return (
    m.durationSec !== null ||
    m.integratedLufs !== null ||
    m.peakDb !== null ||
    m.crestDb !== null
  );
}
