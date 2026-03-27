import { promises as fs } from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";
import { analyzeTrack, TrackAnalysis } from "@/lib/audio/analyze-track";
import { getFfmpegExecutablePath } from "@/lib/audio/ffmpeg-bin";
import {
  GENRE_PRESETS,
  GenrePreset,
  LOUDNESS_MODES,
  LoudnessMode
} from "@/lib/genre-presets";
import { getTempRoot, makeId } from "@/lib/storage/temp-files";

export type MasteringRequest = {
  inputPath: string;
  genre: keyof typeof GENRE_PRESETS;
  loudnessMode: LoudnessMode;
  outputFormat: "wav";
  jobId: string;
};

export type MasteringResult = {
  /** Analysis of the uploaded / pre-master file */
  originalAnalysis: TrackAnalysis;
  /** Analysis of the rendered master; null if post-render analysis failed */
  masteredAnalysis: TrackAnalysis | null;
  masteredPath: string;
  previewPath: string;
  inputPreviewPath: string;
  outputMime: string;
};

function runFfmpeg(args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const ffmpegBin = getFfmpegExecutablePath();
    const child = spawn(ffmpegBin, args, { stdio: ["ignore", "ignore", "pipe"] });
    let stderr = "";
    child.stderr.on("data", (chunk) => {
      stderr += String(chunk);
    });
    child.on("error", (err) => {
      const base = err instanceof Error ? err.message : String(err);
      const tail = stderr ? ` | stderr: ${stderr.slice(-600)}` : "";
      reject(new Error(`ffmpeg spawn error: ${base}${tail}`));
    });
    child.on("close", (code) => {
      if (code !== 0) {
        reject(new Error(`ffmpeg failed (${code}): ${stderr.slice(-1200)}`));
        return;
      }
      resolve();
    });
  });
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function toFixedDb(value: number): number {
  return Number(value.toFixed(2));
}

function buildEqFilters(preset: GenrePreset, analysis: TrackAnalysis): string[] {
  const filters: string[] = [];
  for (const band of preset.eq) {
    if (band.type === "highpass") {
      filters.push(`highpass=f=${band.freq}`);
      continue;
    }
    filters.push(`equalizer=f=${band.freq}:width_type=o:width=1.2:g=${band.gain}`);
  }

  // Approximate adaptive correction. These are practical heuristics, not mastering-grade tonal modeling.
  if (analysis.lowMidDb !== null && analysis.lowMidDb > -22) {
    filters.push("equalizer=f=320:width_type=o:width=1.3:g=-1.8");
  }
  if (analysis.harshnessDb !== null && analysis.harshnessDb > -24) {
    filters.push("equalizer=f=4500:width_type=o:width=1.5:g=-1.7");
  }
  if (analysis.lowEndDb !== null && analysis.lowEndDb > -19.5) {
    filters.push("equalizer=f=75:width_type=o:width=1.5:g=-1.5");
  }
  if (analysis.airDb !== null && analysis.airDb < -34) {
    filters.push("equalizer=f=11000:width_type=o:width=1.2:g=1.2");
  }

  return filters;
}

function buildTargetLufs(preset: GenrePreset, loudnessMode: LoudnessMode): number {
  const mode = LOUDNESS_MODES[loudnessMode];
  return toFixedDb(clamp(preset.lufsTarget + mode.lufsDelta, -18, -9));
}

function buildMasteringFilterChain(
  preset: GenrePreset,
  analysis: TrackAnalysis,
  loudnessMode: LoudnessMode
): string {
  const mode = LOUDNESS_MODES[loudnessMode];
  const targetLufs = buildTargetLufs(preset, loudnessMode);
  const eqFilters = buildEqFilters(preset, analysis);
  const alreadyLoudPenalty = analysis.alreadyLimited ? 0.7 : 0;

  const compThreshold = preset.compression.threshold + alreadyLoudPenalty;
  const compRatio = Math.max(1.3, preset.compression.ratio - (analysis.alreadyLimited ? 0.5 : 0));

  // Coarse loudness push based on analysis delta to target.
  const currentLufs = analysis.integratedLufs ?? targetLufs - 2.5;
  const neededGain = clamp(targetLufs - currentLufs, -1, 6) * 0.9;

  const limiterInputDrive = clamp(neededGain * mode.limiterDrive, 0, 5);
  const limiterCeiling = preset.limiter.ceiling;

  const filters: string[] = [
    ...eqFilters,
    // FFmpeg acompressor requires makeup in [1, 64] (dB-ish scale); 0 is invalid and fails the whole chain.
    `acompressor=threshold=${toFixedDb(compThreshold)}dB:ratio=${toFixedDb(compRatio)}:attack=${preset.compression.attack}:release=${preset.compression.release}:makeup=1`,
    ...(preset.saturation ? ["asoftclip=type=tanh:threshold=0.96"] : []),
    // Pre-limiter drive only; avoid post-limiter gain so true-peak ceiling remains meaningful.
    `volume=${toFixedDb(neededGain + limiterInputDrive)}dB`,
    `alimiter=limit=${Math.pow(10, limiterCeiling / 20).toFixed(4)}:attack=${preset.limiter.lookahead}:release=${preset.limiter.release}:level=disabled`
  ];

  return filters.join(",");
}

export async function runMasteringPipeline(request: MasteringRequest): Promise<MasteringResult> {
  const preset = GENRE_PRESETS[request.genre];
  if (!preset) {
    throw new Error("Invalid genre preset.");
  }

  await fs.mkdir(getTempRoot(), { recursive: true });
  const originalAnalysis = await analyzeTrack(request.inputPath);

  const masteredPath = path.join(getTempRoot(), `${makeId(`mastered_${request.jobId}`)}.wav`);
  const previewPath = path.join(getTempRoot(), `${makeId(`preview_${request.jobId}`)}.mp3`);
  const inputPreviewPath = path.join(getTempRoot(), `${makeId(`inputpreview_${request.jobId}`)}.mp3`);

  const masteringFilter = buildMasteringFilterChain(preset, originalAnalysis, request.loudnessMode);

  await runFfmpeg([
    "-y",
    "-hide_banner",
    "-i",
    request.inputPath,
    "-af",
    masteringFilter,
    "-c:a",
    "pcm_s16le",
    "-ar",
    "44100",
    "-ac",
    "2",
    masteredPath
  ]);

  // 30s preview snippets for fast before/after checks.
  await Promise.all([
    runFfmpeg([
      "-y",
      "-hide_banner",
      "-i",
      request.inputPath,
      "-ss",
      "0",
      "-t",
      "30",
      "-codec:a",
      "libmp3lame",
      "-b:a",
      "192k",
      inputPreviewPath
    ]),
    runFfmpeg([
      "-y",
      "-hide_banner",
      "-i",
      masteredPath,
      "-ss",
      "0",
      "-t",
      "30",
      "-codec:a",
      "libmp3lame",
      "-b:a",
      "192k",
      previewPath
    ])
  ]);

  let masteredAnalysis: TrackAnalysis | null = null;
  try {
    masteredAnalysis = await analyzeTrack(masteredPath);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.warn("[mastering-pipeline] post-master analysis failed:", msg);
  }

  return {
    originalAnalysis,
    masteredAnalysis,
    masteredPath,
    previewPath,
    inputPreviewPath,
    outputMime: "audio/wav"
  };
}
