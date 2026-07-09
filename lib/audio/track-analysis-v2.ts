/**
 * TrackAnalysisV2 — richer, additive audio analysis (server-only, FFmpeg-based).
 *
 * This is analysis INFRASTRUCTURE ONLY. It is intentionally NOT consumed by
 * Standard or Adaptive mastering DSP in this phase and does not change any
 * audible output, filter chains, presets, loudness targets, or reference blend.
 *
 * It measures far more than {@link TrackAnalysis} while running FEWER FFmpeg
 * passes than the existing analyzer (see notes below), by batching many metrics
 * into single decode passes:
 *   Pass 1: ebur128 (integrated LUFS, LRA, sample+true peak, short/momentary).
 *   Pass 2: astats + silencedetect (crest, RMS, dynamic range, flat factor,
 *           zero-crossings, DC offset, bit depth, clipping, L/R RMS, silence).
 *   Pass 3: 7-band split -> amerge -> astats (per-band RMS in one decode).
 *   Pass 4: mid/side + low-freq mid/side -> amerge -> astats (stereo only).
 *
 * => mono: 3 subprocesses, stereo: 4 subprocesses (vs 6 for analyzeTrack).
 *
 * Every metric carries confidence + source. Unavailable metrics are reported as
 * such; we never fabricate values. Analysis is fail-open per pass: if one pass
 * fails, its metrics are marked unavailable and the rest still run.
 */
import { spawn } from "node:child_process";
import { getFfmpegExecutablePath } from "@/lib/audio/ffmpeg-bin";
import {
  buildDerivedMetrics,
  buildTrackAnalysisV2Summary,
  compareTrackAnalysesV2,
  deriveDiagnosticFlags,
  metricValue,
  V2_THRESHOLDS
} from "@/lib/audio/track-analysis-v2-thresholds";
import {
  TRACK_ANALYSIS_V2_SCHEMA_VERSION,
  type ChannelMode,
  type Metric,
  type MetricConfidence,
  type MetricSource,
  type TrackAnalysisV2,
  type TrackAnalysisV2Measured
} from "@/lib/audio/track-analysis-v2-types";

export type {
  Metric,
  MetricConfidence,
  MetricSource,
  ChannelMode,
  TrackAnalysisV2,
  TrackAnalysisV2Measured
} from "@/lib/audio/track-analysis-v2-types";
export type {
  TrackAnalysisV2Derived,
  TrackAnalysisV2Flags,
  TrackAnalysisV2Comparison,
  TrackAnalysisV2Summary
} from "@/lib/audio/track-analysis-v2-types";
export {
  compareTrackAnalysesV2,
  buildTrackAnalysisV2Summary,
  V2_THRESHOLDS,
  V2_BAND_CENTERS_HZ
} from "@/lib/audio/track-analysis-v2-thresholds";
export { TRACK_ANALYSIS_V2_SCHEMA_VERSION } from "@/lib/audio/track-analysis-v2-types";

export const DEFAULT_V2_PASS_TIMEOUT_MS = 60_000;

export type AnalyzeTrackV2Options = {
  /** Per-FFmpeg-pass timeout in milliseconds. */
  timeoutMsPerPass?: number;
  /** Force-skip stereo passes (default: auto-detect from channel count). */
  analyzeStereo?: boolean;
  /**
   * Diagnostic/benchmark switch: when true, passes run strictly one at a time
   * instead of in bounded concurrent waves. Defaults to false (concurrent).
   * Does not change any measured/derived values — scheduling only.
   */
  sequentialPasses?: boolean;
};

/** Band edges in Hz. MUST stay in sync with V2_BAND_CENTERS_HZ in the thresholds module. */
const BAND_EDGES: Array<{ name: string; low: number; high: number }> = [
  { name: "subBass", low: 20, high: 60 },
  { name: "bass", low: 60, high: 120 },
  { name: "lowMid", low: 120, high: 400 },
  { name: "mid", low: 400, high: 2000 },
  { name: "upperMid", low: 2000, high: 4000 },
  { name: "presence", low: 4000, high: 8000 },
  { name: "brilliance", low: 8000, high: 20000 }
];

/**
 * Hard upper bound (bytes) on the FFmpeg stderr we ever retain per pass. ebur128
 * emits a per-frame progress line for the whole track, so raw stderr grows with
 * duration and is otherwise unbounded. We strip those frame lines (parsing their
 * loudness incrementally) and cap the remaining head+tail so a pathological or
 * very long input can never inflate Node RSS without limit.
 */
export const V2_STDERR_MAX_KEPT_BYTES = 512 * 1024;

/** Time we wait for a killed child to emit `close` before force-resolving. */
const V2_KILL_GRACE_MS = 2_000;

/** Aggregated per-frame loudness, computed incrementally so frame lines are never retained. */
type FrameAggregate = {
  momentaryMax: number | null;
  shortTermMax: number | null;
  shortTermRange: number | null;
};

type BoundedStderrOptions = {
  /** Total bytes retained across head + tail. */
  maxKeptBytes?: number;
  /** Bytes reserved for the beginning of stderr (holds the FFmpeg banner/format info). */
  headBytes?: number;
  /** Max short-term frame samples retained for range percentile (memory guard). */
  maxFrameSamples?: number;
};

/** ebur128 per-frame progress line, e.g. "t: 2.3 ... M: -20.1 S: -20.5 I: -20.3 LUFS ...". */
const EBUR128_FRAME_RE = /M:\s*(-?\d+(?:\.\d+)?)\s+S:\s*(-?\d+(?:\.\d+)?)/;

/**
 * Streaming, memory-bounded stderr collector.
 *
 * - Splits on CR / LF / CRLF (ebur128 progress uses CR, summaries use LF).
 * - ebur128 frame lines are parsed for momentary/short-term loudness and then
 *   DISCARDED (never stored) so retained size does not grow with track length.
 * - Everything else (banner at the start, astats/ebur128 summaries at the end)
 *   is kept in a bounded head buffer + rolling tail buffer, preserving the
 *   diagnostic tail while guaranteeing a strict maximum byte count.
 */
function createBoundedStderr(options: BoundedStderrOptions = {}) {
  const maxKept = options.maxKeptBytes ?? V2_STDERR_MAX_KEPT_BYTES;
  const headLimit = options.headBytes ?? Math.floor(maxKept / 4);
  const tailLimit = Math.max(0, maxKept - headLimit);
  const maxFrameSamples = options.maxFrameSamples ?? 200_000;

  let partial = "";
  let head = "";
  let headBytes = 0;
  const tail: string[] = [];
  let tailBytes = 0;
  let droppedBytes = 0;
  let totalBytes = 0;

  let momentaryMax: number | null = null;
  let shortTermMax: number | null = null;
  const shortTerms: number[] = [];
  let shortTermCapped = false;

  function keepLine(line: string) {
    const frame = EBUR128_FRAME_RE.exec(line);
    if (frame) {
      const mv = Number(frame[1]);
      const sv = Number(frame[2]);
      if (Number.isFinite(mv) && mv > -70 && (momentaryMax === null || mv > momentaryMax)) momentaryMax = mv;
      if (Number.isFinite(sv) && sv > -70) {
        if (shortTermMax === null || sv > shortTermMax) shortTermMax = sv;
        if (!shortTermCapped) {
          shortTerms.push(sv);
          if (shortTerms.length >= maxFrameSamples) shortTermCapped = true;
        }
      }
      return; // frame lines are diagnostic noise once parsed — do not retain.
    }
    const withNl = `${line}\n`;
    const size = Buffer.byteLength(withNl);
    if (headBytes < headLimit) {
      head += withNl;
      headBytes += size;
      return;
    }
    tail.push(withNl);
    tailBytes += size;
    while (tailBytes > tailLimit && tail.length > 0) {
      const removed = tail.shift() as string;
      const removedSize = Buffer.byteLength(removed);
      tailBytes -= removedSize;
      droppedBytes += removedSize;
    }
  }

  return {
    push(chunk: string | Buffer) {
      const text = typeof chunk === "string" ? chunk : chunk.toString("utf8");
      totalBytes += Buffer.byteLength(text);
      partial += text;
      const parts = partial.split(/\r\n|[\r\n]/);
      partial = parts.pop() ?? "";
      for (const line of parts) keepLine(line);
      // Guard against pathological output with no line separators at all.
      if (Buffer.byteLength(partial) > maxKept) {
        keepLine(partial);
        partial = "";
      }
    },
    finish() {
      if (partial.length) {
        keepLine(partial);
        partial = "";
      }
      let shortTermRange: number | null = null;
      if (shortTerms.length >= 10) {
        const sorted = [...shortTerms].sort((a, b) => a - b);
        shortTermRange = percentile(sorted, 95) - percentile(sorted, 10);
      }
      const truncated = droppedBytes > 0;
      const marker = truncated ? `\n...[stderr truncated: ${droppedBytes} bytes dropped]...\n` : "";
      const stderr = head + marker + tail.join("");
      return {
        stderr,
        frames: { momentaryMax, shortTermMax, shortTermRange } as FrameAggregate,
        bytesTotal: totalBytes,
        bytesKept: Buffer.byteLength(stderr),
        bytesDropped: droppedBytes,
        truncated
      };
    }
  };
}

/** Exposed for tests: exercise the bounded collector without spawning FFmpeg. */
export function __boundStderrForTest(chunks: Array<string | Buffer>, options?: BoundedStderrOptions) {
  const collector = createBoundedStderr(options);
  for (const chunk of chunks) collector.push(chunk);
  return collector.finish();
}

type FfmpegResult =
  | { ok: true; stderr: string; frames: FrameAggregate; bytesTotal: number; bytesKept: number; bytesDropped: number }
  | { ok: false; error: string; stderr: string; frames: FrameAggregate; bytesTotal: number; bytesKept: number; bytesDropped: number };

/**
 * Run one FFmpeg pass, capturing bounded stderr.
 *
 * Process-safety guarantees:
 * - Every child has a timeout that SIGKILLs it.
 * - After a kill we wait for `close` (up to {@link V2_KILL_GRACE_MS}) so the
 *   process is reaped and no orphan is left; if `close` never arrives we still
 *   resolve so a stuck child cannot hang the request.
 * - Timer, kill-grace timer, and the stderr listener are always cleaned up.
 * - Resolves exactly once (never rejects) so one failed pass cannot leak a
 *   dangling promise or crash the caller.
 */
function runFfmpegCapture(args: string[], timeoutMs: number, collectorOptions?: BoundedStderrOptions): Promise<FfmpegResult> {
  return new Promise((resolve) => {
    const collector = createBoundedStderr(collectorOptions);
    let settled = false;
    let timedOut = false;
    let timer: ReturnType<typeof setTimeout> | null = null;
    let killTimer: ReturnType<typeof setTimeout> | null = null;

    let child: ReturnType<typeof spawn>;
    try {
      child = spawn(getFfmpegExecutablePath(), args, { stdio: ["ignore", "ignore", "pipe"] });
    } catch (err) {
      const r = collector.finish();
      resolve({
        ok: false,
        error: err instanceof Error ? err.message : String(err),
        stderr: r.stderr,
        frames: r.frames,
        bytesTotal: r.bytesTotal,
        bytesKept: r.bytesKept,
        bytesDropped: r.bytesDropped
      });
      return;
    }

    const finalize = (ok: boolean, makeError?: (stderr: string) => string) => {
      if (settled) return;
      settled = true;
      if (timer) clearTimeout(timer);
      if (killTimer) clearTimeout(killTimer);
      child.stderr?.removeAllListeners("data");
      const r = collector.finish();
      if (ok) {
        resolve({
          ok: true,
          stderr: r.stderr,
          frames: r.frames,
          bytesTotal: r.bytesTotal,
          bytesKept: r.bytesKept,
          bytesDropped: r.bytesDropped
        });
      } else {
        resolve({
          ok: false,
          error: makeError ? makeError(r.stderr) : "ffmpeg failed",
          stderr: r.stderr,
          frames: r.frames,
          bytesTotal: r.bytesTotal,
          bytesKept: r.bytesKept,
          bytesDropped: r.bytesDropped
        });
      }
    };

    timer = setTimeout(() => {
      timedOut = true;
      try {
        child.kill("SIGKILL");
      } catch {
        /* ignore */
      }
      // Prefer resolving from `close` (process reaped); fall back after a grace period.
      killTimer = setTimeout(() => finalize(false, () => `ffmpeg timed out after ${timeoutMs}ms`), V2_KILL_GRACE_MS);
    }, timeoutMs);

    child.stderr?.on("data", (chunk) => collector.push(chunk));

    child.on("error", (err) => {
      finalize(false, () => (err instanceof Error ? err.message : String(err)));
    });

    child.on("close", (code) => {
      if (timedOut) {
        finalize(false, () => `ffmpeg timed out after ${timeoutMs}ms`);
        return;
      }
      if (code !== 0) {
        finalize(false, (stderr) => `ffmpeg exited ${code}: ${stderr.slice(-400)}`);
        return;
      }
      finalize(true);
    });
  });
}

// --- Parsing helpers --------------------------------------------------------

function mk(
  value: number | null,
  source: MetricSource,
  unit: string,
  confidence: MetricConfidence = "high"
): Metric {
  if (value === null || !Number.isFinite(value)) {
    return { value: null, confidence: "unavailable", source: "unavailable", unit };
  }
  return { value: Number(value.toFixed(4)), confidence, source, unit };
}

function na(unit: string): Metric {
  return { value: null, confidence: "unavailable", source: "unavailable", unit };
}

function lastFloat(text: string, re: RegExp): number | null {
  const matches = [...text.matchAll(re)];
  if (!matches.length) return null;
  const v = Number(matches[matches.length - 1][1]);
  return Number.isFinite(v) ? v : null;
}

function parseDurationSec(text: string): number | null {
  const m = text.match(/Duration:\s*(\d+):(\d+):(\d+(?:\.\d+)?)/);
  if (!m) return null;
  const v = Number(m[1]) * 3600 + Number(m[2]) * 60 + Number(m[3]);
  return Number.isFinite(v) ? Number(v.toFixed(3)) : null;
}

function parseBanner(text: string): {
  durationSec: number | null;
  sampleRateHz: number | null;
  codec: string | null;
  bannerChannels: number | null;
} {
  const durationSec = parseDurationSec(text);
  const audioLine = text.split(/\r?\n/).find((l) => l.includes("Audio:")) ?? "";
  const codecMatch = audioLine.match(/Audio:\s*([a-zA-Z0-9_]+)/);
  const rateMatch = audioLine.match(/(\d+)\s*Hz/);
  let bannerChannels: number | null = null;
  const layoutMatch = audioLine.match(/Hz,\s*([^,]+),/);
  if (layoutMatch) {
    const layout = layoutMatch[1].trim().toLowerCase();
    if (layout === "mono") bannerChannels = 1;
    else if (layout === "stereo") bannerChannels = 2;
    else {
      const numMatch = layout.match(/(\d+)/);
      if (numMatch) bannerChannels = Number(numMatch[1]);
    }
  }
  return {
    durationSec,
    sampleRateHz: rateMatch ? Number(rateMatch[1]) : null,
    codec: codecMatch ? codecMatch[1] : null,
    bannerChannels
  };
}

type AstatsBlock = Record<string, number>;

/** Parse astats stderr into per-channel blocks (in order) and the overall block. */
function parseAstats(text: string): { channels: AstatsBlock[]; overall: AstatsBlock } {
  const lines = text
    .split(/\r?\n/)
    .filter((l) => l.includes("Parsed_astats"))
    .map((l) => l.replace(/^\[Parsed_astats[^\]]*\]\s*/, "").trim());

  const channels: AstatsBlock[] = [];
  let overall: AstatsBlock = {};
  let current: AstatsBlock | null = null;
  let inOverall = false;

  for (const line of lines) {
    if (/^Channel:\s*\d+/.test(line)) {
      current = {};
      channels.push(current);
      inOverall = false;
      continue;
    }
    if (/^Overall$/.test(line)) {
      overall = {};
      inOverall = true;
      current = null;
      continue;
    }
    const kv = line.match(/^(.*?):\s*(-?[\d.]+)/);
    if (!kv) continue;
    const key = kv[1].trim();
    const value = Number(kv[2]);
    if (!Number.isFinite(value)) continue;
    if (inOverall) overall[key] = value;
    else if (current) current[key] = value;
  }

  return { channels, overall };
}

function percentile(sorted: number[], p: number): number {
  if (!sorted.length) return NaN;
  const idx = Math.min(sorted.length - 1, Math.max(0, Math.round((p / 100) * (sorted.length - 1))));
  return sorted[idx];
}

// --- Pass builders ----------------------------------------------------------

function buildBandFilterComplex(): string {
  const splits = BAND_EDGES.map((_, i) => `[s${i}]`).join("");
  const branches = BAND_EDGES.map(
    (b, i) => `[s${i}]highpass=f=${b.low},lowpass=f=${b.high},pan=mono|c0=0.5*c0+0.5*c1[b${i}]`
  ).join(";");
  const merge = BAND_EDGES.map((_, i) => `[b${i}]`).join("");
  return `[0:a]asplit=${BAND_EDGES.length}${splits};${branches};${merge}amerge=inputs=${BAND_EDGES.length},astats=metadata=0[m]`;
}

const STEREO_FILTER_COMPLEX =
  "[0:a]asplit=4[a0][a1][a2][a3];" +
  "[a0]pan=mono|c0=0.5*c0+0.5*c1[mid];" +
  "[a1]pan=mono|c0=0.5*c0-0.5*c1[side];" +
  "[a2]lowpass=f=150,pan=mono|c0=0.5*c0+0.5*c1[lmid];" +
  "[a3]lowpass=f=150,pan=mono|c0=0.5*c0-0.5*c1[lside];" +
  "[mid][side][lmid][lside]amerge=inputs=4,astats=metadata=0[m]";

// --- Main entry -------------------------------------------------------------

export async function analyzeTrackV2(
  inputPath: string,
  options: AnalyzeTrackV2Options = {}
): Promise<TrackAnalysisV2> {
  const startedAt = Date.now();
  const timeout = options.timeoutMsPerPass ?? DEFAULT_V2_PASS_TIMEOUT_MS;
  const notes: string[] = [];
  let subprocessCount = 0;
  let maxStderrBytesKept = 0;

  // Small, self-contained concurrency accounting. Passes run in two waves of at
  // most two children each, so peak concurrency stays low (no queue/dependency).
  let activeSubprocesses = 0;
  let maxConcurrentSubprocesses = 0;
  const runPass = async (args: string[]): Promise<FfmpegResult> => {
    subprocessCount += 1;
    activeSubprocesses += 1;
    if (activeSubprocesses > maxConcurrentSubprocesses) maxConcurrentSubprocesses = activeSubprocesses;
    try {
      const result = await runFfmpegCapture(args, timeout);
      if (result.bytesKept > maxStderrBytesKept) maxStderrBytesKept = result.bytesKept;
      return result;
    } finally {
      activeSubprocesses -= 1;
    }
  };

  const sequential = options.sequentialPasses === true;
  const runWave = async (jobs: Array<() => Promise<FfmpegResult>>): Promise<FfmpegResult[]> => {
    if (sequential) {
      const out: FfmpegResult[] = [];
      for (const job of jobs) out.push(await job());
      return out;
    }
    return Promise.all(jobs.map((job) => job()));
  };

  // --- Wave A: loudness + overall stats run concurrently (independent inputs). ---
  //   Pass 1 — ebur128 (loudness, LRA, sample+true peak, per-frame short/momentary) + banner.
  //   Pass 2 — astats + silencedetect (overall dynamics + integrity + leading silence).
  const [p1, p2] = await runWave([
    () => runPass(["-hide_banner", "-i", inputPath, "-filter_complex", "ebur128=peak=true+sample", "-f", "null", "-"]),
    () =>
      runPass([
        "-hide_banner",
        "-i",
        inputPath,
        "-af",
        "silencedetect=n=-50dB:d=0.3,astats=metadata=0",
        "-f",
        "null",
        "-"
      ])
  ]);

  const p1Text = p1.ok ? p1.stderr : "";
  if (!p1.ok) notes.push(`loudness pass failed: ${p1.error}`);

  const banner = parseBanner(p1Text);
  const integrated = lastFloat(p1Text, /I:\s*(-?\d+(?:\.\d+)?)\s*LUFS/g);
  const lra = lastFloat(p1Text, /LRA:\s*(-?\d+(?:\.\d+)?)\s*LU/g);
  // Summary emits "Sample peak:" then "Peak:" and "True peak:" then "Peak:".
  const samplePeak = (() => {
    const m = p1Text.match(/Sample peak:[\s\S]*?Peak:\s*(-?\d+(?:\.\d+)?)/);
    return m ? Number(m[1]) : null;
  })();
  const truePeak = (() => {
    const m = p1Text.match(/True peak:[\s\S]*?Peak:\s*(-?\d+(?:\.\d+)?)/);
    return m ? Number(m[1]) : null;
  })();
  // Momentary/short-term loudness parsed incrementally from ebur128 frame lines.
  const frames = p1.frames;

  const p2Text = p2.ok ? p2.stderr : "";
  if (!p2.ok) notes.push(`stats pass failed: ${p2.error}`);

  const stats = parseAstats(p2Text);
  const overall = stats.overall;
  const channelCount = banner.bannerChannels ?? stats.channels.length ?? null;
  const peakLevelDb = overall["Peak level dB"] ?? null;
  const rmsLevelDb = overall["RMS level dB"] ?? null;
  const crestFactorDb = peakLevelDb !== null && rmsLevelDb !== null ? peakLevelDb - rmsLevelDb : null;
  const peakCount = overall["Peak count"] ?? null;
  const clippingSampleCount = peakLevelDb !== null && peakLevelDb > -0.1 ? peakCount : peakLevelDb !== null ? 0 : null;

  // Leading silence from silencedetect: sound starts at first silence_end when the
  // track opens with silence (silence_start at ~0), else 0.
  const leadingSilenceSec = (() => {
    const startMatch = p2Text.match(/silence_start:\s*(-?\d+(?:\.\d+)?)/);
    if (!startMatch) return 0;
    const firstStart = Number(startMatch[1]);
    if (!Number.isFinite(firstStart) || firstStart > 0.05) return 0;
    const endMatch = p2Text.match(/silence_end:\s*(-?\d+(?:\.\d+)?)/);
    return endMatch ? Number(endMatch[1]) : 0;
  })();

  // Bit depth: only meaningful for PCM containers.
  const bitDepth = (() => {
    if (!banner.codec || !banner.codec.startsWith("pcm")) return null;
    const bd = overall["Bit depth"];
    if (bd !== undefined) return bd;
    // "Bit depth: a/b/c/d" collapses to a single number in our parser (first token).
    return null;
  })();

  const leftRmsDb = stats.channels[0]?.["RMS level dB"] ?? null;
  const rightRmsDb = stats.channels[1]?.["RMS level dB"] ?? null;

  // --- Wave B: band split + (stereo mid/side) run concurrently after channel
  // count is known. Peak concurrency here is 2 for stereo, 1 for mono. ---
  const isStereo = (channelCount ?? 1) >= 2;
  const analyzedStereo = isStereo && options.analyzeStereo !== false;

  const waveBJobs: Array<() => Promise<FfmpegResult>> = [
    // Pass 3 — per-band RMS in one decode.
    () =>
      runPass([
        "-hide_banner",
        "-i",
        inputPath,
        "-filter_complex",
        buildBandFilterComplex(),
        "-map",
        "[m]",
        "-f",
        "null",
        "-"
      ])
  ];
  // Pass 4 — stereo mid/side + low-freq mid/side (stereo only).
  if (analyzedStereo) {
    waveBJobs.push(() =>
      runPass(["-hide_banner", "-i", inputPath, "-filter_complex", STEREO_FILTER_COMPLEX, "-map", "[m]", "-f", "null", "-"])
    );
  }

  const [p3, p4] = await runWave(waveBJobs);

  if (!p3.ok) notes.push(`band pass failed: ${p3.error}`);
  const bandChannels = p3.ok ? parseAstats(p3.stderr).channels : [];
  const bandRms = (i: number): number | null => bandChannels[i]?.["RMS level dB"] ?? null;

  let midRms: number | null = null;
  let sideRms: number | null = null;
  let lowMidRms: number | null = null;
  let lowSideRms: number | null = null;
  if (analyzedStereo && p4) {
    if (!p4.ok) notes.push(`stereo pass failed: ${p4.error}`);
    const ms = p4.ok ? parseAstats(p4.stderr).channels : [];
    midRms = ms[0]?.["RMS level dB"] ?? null;
    sideRms = ms[1]?.["RMS level dB"] ?? null;
    lowMidRms = ms[2]?.["RMS level dB"] ?? null;
    lowSideRms = ms[3]?.["RMS level dB"] ?? null;
  }

  const channelMode: ChannelMode | null =
    channelCount === null ? null : channelCount <= 1 ? "mono" : channelCount === 2 ? "stereo" : "multichannel";

  const measured: TrackAnalysisV2Measured = {
    loudness: {
      integratedLufs: mk(integrated, "ebur128", "LUFS"),
      loudnessRangeLu: mk(lra, "ebur128", "LU"),
      shortTermMaxLufs: mk(frames.shortTermMax, "ebur128-frames", "LUFS", "medium"),
      momentaryMaxLufs: mk(frames.momentaryMax, "ebur128-frames", "LUFS", "medium"),
      shortTermRangeLu: mk(frames.shortTermRange, "ebur128-frames", "LU", "medium")
    },
    peaks: {
      samplePeakDb: mk(samplePeak, "ebur128", "dBFS"),
      truePeakDb: mk(truePeak, "ebur128", "dBTP")
    },
    dynamics: {
      crestFactorDb: mk(crestFactorDb, "astats", "dB"),
      rmsLevelDb: mk(rmsLevelDb, "astats", "dB"),
      rmsPeakDb: mk(overall["RMS peak dB"] ?? null, "astats", "dB"),
      rmsTroughDb: mk(overall["RMS trough dB"] ?? null, "astats", "dB"),
      dynamicRangeDb: mk(overall["Dynamic range"] ?? null, "astats", "dB"),
      flatFactor: mk(overall["Flat factor"] ?? null, "astats", "ratio", "medium"),
      zeroCrossingRate: mk(overall["Zero crossings rate"] ?? null, "astats", "ratio", "medium")
    },
    spectrumBands: {
      subBassDb: mk(bandRms(0), "astats-bands", "dB", "medium"),
      bassDb: mk(bandRms(1), "astats-bands", "dB", "medium"),
      lowMidDb: mk(bandRms(2), "astats-bands", "dB", "medium"),
      midDb: mk(bandRms(3), "astats-bands", "dB", "medium"),
      upperMidDb: mk(bandRms(4), "astats-bands", "dB", "medium"),
      presenceDb: mk(bandRms(5), "astats-bands", "dB", "medium"),
      brillianceDb: mk(bandRms(6), "astats-bands", "dB", "medium")
    },
    stereo: {
      midRmsDb: analyzedStereo ? mk(midRms, "astats-stereo", "dB", "medium") : na("dB"),
      sideRmsDb: analyzedStereo ? mk(sideRms, "astats-stereo", "dB", "medium") : na("dB"),
      lowMidRmsDb: analyzedStereo ? mk(lowMidRms, "astats-stereo", "dB", "medium") : na("dB"),
      lowSideRmsDb: analyzedStereo ? mk(lowSideRms, "astats-stereo", "dB", "medium") : na("dB")
    },
    integrity: {
      durationSec: mk(banner.durationSec, "container", "s"),
      sampleRateHz: mk(banner.sampleRateHz, "container", "Hz"),
      bitDepth: bitDepth !== null ? mk(bitDepth, "astats", "bits") : na("bits"),
      codec: banner.codec
        ? { value: banner.codec, confidence: "high", source: "container", unit: "codec" }
        : { value: null, confidence: "unavailable", source: "unavailable", unit: "codec" },
      channelCount: mk(channelCount, "astats", "count"),
      channelMode: channelMode
        ? { value: channelMode, confidence: "high", source: "container", unit: "mode" }
        : { value: null, confidence: "unavailable", source: "unavailable", unit: "mode" },
      dcOffset: mk(overall["DC offset"] ?? null, "astats", "fraction"),
      leftRmsDb: analyzedStereo ? mk(leftRmsDb, "astats", "dB") : na("dB"),
      rightRmsDb: analyzedStereo ? mk(rightRmsDb, "astats", "dB") : na("dB"),
      clippingSampleCount: mk(clippingSampleCount, "astats", "samples", "medium"),
      leadingSilenceSec: mk(leadingSilenceSec, "silencedetect", "s")
    }
  };

  const derived = buildDerivedMetrics(measured, analyzedStereo);
  const flags = deriveDiagnosticFlags(measured, derived, analyzedStereo);

  return {
    measured,
    derived,
    flags,
    meta: {
      schemaVersion: TRACK_ANALYSIS_V2_SCHEMA_VERSION,
      analyzedStereo,
      subprocessCount,
      maxConcurrentSubprocesses,
      maxStderrBytesKept,
      elapsedMs: Date.now() - startedAt,
      notes
    }
  };
}

/** Convenience: analyze and return only the compact, API-safe summary. */
export async function analyzeTrackV2Summary(inputPath: string, options?: AnalyzeTrackV2Options) {
  const analysis = await analyzeTrackV2(inputPath, options);
  return buildTrackAnalysisV2Summary(analysis);
}

// Re-exported pure helpers for consumers that already hold analyses in memory.
export { buildDerivedMetrics, deriveDiagnosticFlags, metricValue };
