/**
 * Combined track analysis orchestration (server-only).
 *
 * Runs the REQUIRED existing analyzer ({@link analyzeTrack}) and the ADDITIVE,
 * fail-open TrackAnalysisV2 summary concurrently from the SAME upload path (no
 * extra file read / no second upload copy).
 *
 * Guarantees:
 * - Existing analysis behavior is unchanged: its result is returned as-is and
 *   its failures propagate exactly as before (this function rethrows them).
 * - V2 is fail-open: any V2 error OR overall-timeout simply omits `analysisV2`.
 *   V2 never fails, delays (beyond its own bounded timeout), or changes the
 *   existing response.
 * - V2 raw FFmpeg output / stderr / paths never appear here; only the compact,
 *   API-safe summary is surfaced.
 */
import { analyzeTrack, type TrackAnalysis } from "@/lib/audio/analyze-track";
import { analyzeTrackV2Summary, type AnalyzeTrackV2Options } from "@/lib/audio/track-analysis-v2";
import type { TrackAnalysisV2Summary } from "@/lib/audio/track-analysis-v2-types";

/** Overall wall-clock budget for V2 before the route gives up and omits it. */
export const DEFAULT_V2_OVERALL_TIMEOUT_MS = 30_000;

export type CombinedTrackAnalysis = {
  /** Required existing analysis (unchanged shape/semantics). */
  analysis: TrackAnalysis;
  /** Additive, compact V2 summary. Omitted when V2 fails or times out. */
  analysisV2?: TrackAnalysisV2Summary;
};

export type AnalyzeTrackWithV2Options = {
  /**
   * Gate for the additive V2 analysis. Defaults to `false` (fail-safe: V2 is
   * OFF unless a caller opts in explicitly). When `false` (or omitted), V2 is
   * NOT started at all — no V2 FFmpeg subprocesses are spawned and `analysisV2`
   * is omitted — so only the required existing {@link analyzeTrack} flow runs.
   *
   * This default keeps TrackAnalysisV2's expensive, experimental execution from
   * being activated accidentally by a caller that simply forgets the option.
   * The `/api/analyze-track` route passes the resolved server feature flag
   * explicitly, so production behavior is unaffected.
   */
  enableV2?: boolean;
  /** Overall V2 timeout in ms (safety net on top of per-pass timeouts). */
  v2OverallTimeoutMs?: number;
  /** Options forwarded to the V2 analyzer (per-pass timeout, stereo override). */
  v2Options?: AnalyzeTrackV2Options;
  /** Invoked (dev-only logging, etc.) when V2 is unavailable. Never throws. */
  onV2Error?: (error: unknown) => void;
  /** Test seam: override the required existing analyzer. */
  analyzeExisting?: (inputPath: string) => Promise<TrackAnalysis>;
  /** Test seam: override the additive V2 summary analyzer. */
  analyzeV2Summary?: (
    inputPath: string,
    options?: AnalyzeTrackV2Options
  ) => Promise<TrackAnalysisV2Summary>;
};

async function runV2FailOpen(
  inputPath: string,
  timeoutMs: number,
  run: (inputPath: string, options?: AnalyzeTrackV2Options) => Promise<TrackAnalysisV2Summary>,
  v2Options: AnalyzeTrackV2Options | undefined,
  onV2Error: ((error: unknown) => void) | undefined
): Promise<TrackAnalysisV2Summary | undefined> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const timeoutPromise = new Promise<undefined>((resolve) => {
      timer = setTimeout(() => resolve(undefined), timeoutMs);
    });
    // The underlying analyzer has its own per-pass timeouts + process cleanup, so
    // if this overall race times out the detached work still winds down safely.
    const result = await Promise.race([run(inputPath, v2Options), timeoutPromise]);
    return result ?? undefined;
  } catch (error) {
    onV2Error?.(error);
    return undefined;
  } finally {
    if (timer) clearTimeout(timer);
  }
}

export async function analyzeTrackWithV2(
  inputPath: string,
  opts: AnalyzeTrackWithV2Options = {}
): Promise<CombinedTrackAnalysis> {
  const runExisting = opts.analyzeExisting ?? analyzeTrack;
  const runV2 = opts.analyzeV2Summary ?? analyzeTrackV2Summary;
  const v2Timeout = opts.v2OverallTimeoutMs ?? DEFAULT_V2_OVERALL_TIMEOUT_MS;
  const enableV2 = opts.enableV2 ?? false;

  // Flag disabled: run ONLY the required existing analysis. V2 is never started,
  // so no additional FFmpeg subprocesses are spawned and `analysisV2` is omitted.
  if (!enableV2) {
    const analysis = await runExisting(inputPath);
    return { analysis };
  }

  const existingPromise = runExisting(inputPath);
  const v2Promise = runV2FailOpen(inputPath, v2Timeout, runV2, opts.v2Options, opts.onV2Error);

  // Await both independently: V2 (fail-open) can never reject, so the only way to
  // fail here is the existing analysis failing — which we surface unchanged.
  const [existingResult, v2Result] = await Promise.allSettled([existingPromise, v2Promise]);

  if (existingResult.status === "rejected") {
    throw existingResult.reason;
  }

  const analysis = existingResult.value;
  const analysisV2 =
    v2Result.status === "fulfilled" && v2Result.value ? v2Result.value : undefined;

  return analysisV2 ? { analysis, analysisV2 } : { analysis };
}
