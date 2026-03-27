import type { PublicTrackMetrics } from "@/lib/audio/public-analysis";

/**
 * `analysis` object from POST `/api/master` JSON.
 *
 * - **`original`**: Loudness/peak/crest/duration measured from the **uploaded input** (pre-master file on disk). Always present for successful jobs.
 * - **`mastered`**: Same metrics measured from the **rendered master** WAV after the pipeline. Present only when post-master `analyzeTrack` succeeded and returned usable values.
 * - **Top-level** `durationSec`, `integratedLufs`, `peakDb`, `crestDb`: **Display summary** for backward compatibility and simple clients. They equal **`mastered`** when that object exists; otherwise they equal **`original`**. For explicit semantics, prefer `original` / `mastered` rather than the top-level fields.
 */
export type MasterJobAnalysis = {
  durationSec: number | null;
  integratedLufs: number | null;
  peakDb: number | null;
  crestDb: number | null;
  notes: string[];
  original?: PublicTrackMetrics;
  mastered?: PublicTrackMetrics;
};
