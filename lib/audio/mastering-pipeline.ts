import { promises as fs } from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";
import { analyzeTrack, type TrackAnalysis } from "@/lib/audio/analyze-track";
import { getFfmpegExecutablePath } from "@/lib/audio/ffmpeg-bin";
import { getPreviewStartSeconds, getSafePreviewDurationSeconds } from "@/lib/audio/preview-segment";
import {
  GENRE_PRESETS,
  getLoudnessModeLufsTarget,
  getLoudnessModeTruePeak,
  LOUDNESS_MODES,
  type GenrePreset,
  type LoudnessMode
} from "@/lib/genre-presets";
import { probeAudioStream } from "@/lib/audio/media-probe";
import { validateExportedWav } from "@/lib/audio/wav-export-validation";
import {
  resolveCodecForQuality,
  resolveExportSampleRate,
  WAV_EXPORT_CHANNELS
} from "@/lib/audio/wav-export-codec";
import { markJobExportCodecVerified } from "@/lib/jobs/job-export-verify";
import { getTempRoot, makeId } from "@/lib/storage/temp-files";
import type { PlanQuality } from "@/lib/subscriptions/types";

export type MasteringRequest = {
  inputPath: string;
  genre: keyof typeof GENRE_PRESETS;
  loudnessMode: LoudnessMode;
  outputFormat: "wav";
  outputQuality: PlanQuality;
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
  outputCodec: "pcm_s16le" | "pcm_s24le" | "pcm_f32le";
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
    // Modest air only — avoid stacking harshness on top of genre HF bands.
    filters.push("equalizer=f=11000:width_type=o:width=1.2:g=0.8");
  }

  return filters;
}

function buildTargetLufs(preset: GenrePreset, loudnessMode: LoudnessMode): number {
  return toFixedDb(clamp(getLoudnessModeLufsTarget(preset, loudnessMode), -18, -7));
}

/**
 * FFmpeg `alimiter` is sample-peak only. Oversampled true-peak routinely exceeds the
 * configured sample ceiling by ~0.4–0.7 dB on dense masters, so the final brick-wall
 * stage aims this many dB below the advertised dBTP target.
 */
const TRUE_PEAK_ISP_MARGIN_DB = 0.55;

function resolveModeDynamics(
  preset: GenrePreset,
  loudnessMode: LoudnessMode,
  alreadyLoudPenalty: number,
  analysisAlreadyLimited: boolean
): {
  compThreshold: number;
  compRatio: number;
  compAttack: number;
  compRelease: number;
  limiterCeiling: number;
  limiterAttack: number;
  limiterRelease: number;
} {
  const modeTargets = preset.loudnessModes[loudnessMode];
  const compSrc = modeTargets.compression ?? preset.compression;
  const limSrc = modeTargets.limiter;
  const compThreshold = (compSrc.threshold ?? preset.compression.threshold) + alreadyLoudPenalty;
  const baseRatio = compSrc.ratio;
  const compRatio = Math.max(1.3, baseRatio - (analysisAlreadyLimited ? 0.5 : 0));
  const truePeakDbTp = getLoudnessModeTruePeak(preset, loudnessMode);
  return {
    compThreshold,
    compRatio,
    compAttack: compSrc.attack,
    compRelease: compSrc.release,
    limiterCeiling: limSrc?.ceiling ?? truePeakDbTp,
    limiterAttack: limSrc?.attack ?? preset.limiter.lookahead,
    limiterRelease: limSrc?.release ?? preset.limiter.release
  };
}

/**
 * Estimate EQ/comp/softclip insertion loss ahead of the pre-limiter volume stage.
 * Bounded and analysis-derived — replaces a fixed global makeup (+3.2 dB) that
 * overshoots dense commercial mixes. EQ boosts are intentional character and are
 * not treated as negative loss (that under-compensated and crushed loudness).
 */
function estimateInsertLossDb(preset: GenrePreset, analysis: TrackAnalysis): number {
  // Baseline: acompressor with makeup=1 plus typical adaptive/EQ path loss.
  let loss = 1.7;
  for (const band of preset.eq) {
    if (band.type === "highpass") {
      loss += 0.15;
      continue;
    }
    if (band.gain < 0) loss += Math.abs(band.gain) * 0.25;
  }
  if (analysis.lowMidDb !== null && analysis.lowMidDb > -22) loss += 0.35;
  if (analysis.harshnessDb !== null && analysis.harshnessDb > -24) loss += 0.3;
  if (analysis.lowEndDb !== null && analysis.lowEndDb > -19.5) loss += 0.25;
  if (preset.saturation) loss += 0.08;
  if (analysis.alreadyLimited) loss -= 0.45;
  if (analysis.crestDb !== null && analysis.crestDb < 9) loss -= 0.25;
  return clamp(loss, 1.2, 2.35);
}

/**
 * Mode true-peak target, optionally tightened by a genre floor (never loosened).
 * Lo-Fi may keep quieter genre-specific ceilings via truePeakSafetyLimiterDbTp.
 */
function resolveEnforcedTruePeakCeilingDb(preset: GenrePreset, loudnessMode: LoudnessMode): number {
  const modeCeiling = getLoudnessModeTruePeak(preset, loudnessMode);
  const genreFloor = preset.truePeakSafetyLimiterDbTp;
  if (genreFloor === undefined) return modeCeiling;
  return Math.min(modeCeiling, genreFloor);
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

  const {
    compThreshold,
    compRatio,
    compAttack,
    compRelease,
    limiterCeiling,
    limiterAttack,
    limiterRelease
  } = resolveModeDynamics(preset, loudnessMode, alreadyLoudPenalty, analysis.alreadyLimited);

  // Single-stage pre-limiter gain toward the mode LUFS target.
  // Prefer slight undershoot; fail only when >1.0 LU hotter than target.
  const currentLufs = analysis.integratedLufs ?? targetLufs - 2.5;
  const rawDelta = targetLufs - currentLufs;
  const insertLossDb = estimateInsertLossDb(preset, analysis);
  // Always restore estimated insert loss (EQ cuts still apply on downward moves).
  const undershootBiasDb = rawDelta > 0 ? -0.15 : 0;
  // Large upward pushes densify under the limiter and overshoot integrated LUFS.
  const densityGuardDb = rawDelta > 4.5 ? clamp((rawDelta - 4.5) * 0.3, 0, 0.55) : 0;
  const loudnessDelta = clamp(
    rawDelta + insertLossDb + undershootBiasDb - densityGuardDb,
    -2.5,
    8.5
  );
  const approach = clamp(0.95 + (mode.limiterDrive - 1) * 0.1, 0.84, 1.04);
  const preLimiterGain = clamp(loudnessDelta * approach, -2.5, 8.5);

  const enforcedTruePeakDb = resolveEnforcedTruePeakCeilingDb(preset, loudnessMode);
  // Final brick-wall sample ceiling below the advertised dBTP so exported true-peak matches.
  const finalSampleCeilingDb = enforcedTruePeakDb - TRUE_PEAK_ISP_MARGIN_DB;

  const filters: string[] = [
    ...eqFilters,
    // FFmpeg acompressor requires makeup in [1, 64] (dB-ish scale); 0 is invalid and fails the whole chain.
    `acompressor=threshold=${toFixedDb(compThreshold)}dB:ratio=${toFixedDb(compRatio)}:attack=${compAttack}:release=${compRelease}:makeup=1`,
    ...(preset.saturation ? ["asoftclip=type=tanh:threshold=0.96"] : []),
    // Pre-limiter drive only — no volume/makeup/normalization after the final safety limiter.
    `volume=${toFixedDb(preLimiterGain)}dB`,
    `alimiter=limit=${Math.pow(10, limiterCeiling / 20).toFixed(4)}:attack=${limiterAttack}:release=${limiterRelease}:level=disabled`,
    // Final gain-changing DSP stage: mode-aware brick-wall with ISP margin (level disabled).
    `alimiter=limit=${Math.pow(10, finalSampleCeilingDb / 20).toFixed(4)}:attack=0.1:release=1:level=disabled`
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
  const outputCodec = resolveCodecForQuality(request.outputQuality);
  const inputProbe = await probeAudioStream(request.inputPath);
  const exportSampleRate = resolveExportSampleRate(inputProbe.sample_rate);

  // Final mux only: PCM codec/bit depth + preserved sample rate; DSP chain above is unchanged.
  await runFfmpeg([
    "-y",
    "-hide_banner",
    "-i",
    request.inputPath,
    "-af",
    masteringFilter,
    "-c:a",
    outputCodec,
    "-ar",
    String(exportSampleRate),
    "-ac",
    String(WAV_EXPORT_CHANNELS),
    masteredPath
  ]);

  // Export-only verification — does not alter mastering decisions or loudness.
  await validateExportedWav(masteredPath, { codec: outputCodec, sampleRate: exportSampleRate });
  await markJobExportCodecVerified(request.jobId, outputCodec);

  // 30s preview snippets for fast before/after checks.
  const previewStartSeconds = getPreviewStartSeconds(originalAnalysis.durationSec);
  const previewDurationSeconds = getSafePreviewDurationSeconds(
    originalAnalysis.durationSec,
    previewStartSeconds,
    30
  );

  await Promise.all([
    runFfmpeg([
      "-y",
      "-hide_banner",
      "-i",
      request.inputPath,
      "-ss",
      previewStartSeconds.toFixed(2),
      "-t",
      previewDurationSeconds.toFixed(2),
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
      previewStartSeconds.toFixed(2),
      "-t",
      previewDurationSeconds.toFixed(2),
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
    outputMime: "audio/wav",
    outputCodec
  };
}
