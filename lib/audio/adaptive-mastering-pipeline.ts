import { promises as fs } from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";
import { analyzeTrack, type TrackAnalysis } from "@/lib/audio/analyze-track";
import { getFfmpegExecutablePath } from "@/lib/audio/ffmpeg-bin";
import { requestAdaptiveDecisionFromOpenAI } from "@/lib/openai/adaptive-mastering";
import { evaluateTrackReadiness } from "@/lib/audio/readiness";
import { GENRE_PRESETS, type LoudnessMode } from "@/lib/genre-presets";
import { getTempRoot, makeId } from "@/lib/storage/temp-files";
import type { PlanQuality } from "@/lib/subscriptions/types";

export type AdaptiveMasteringRequest = {
  inputPath: string;
  jobId: string;
  genre?: keyof typeof GENRE_PRESETS;
  loudnessMode?: LoudnessMode;
  userIntent?: string;
  outputQuality: PlanQuality;
};

export type AdaptiveInstructionSettings = {
  eqDirection: {
    lowEnd: number;
    lowMid: number;
    presence: number;
    air: number;
  };
  compressionIntensity: "light" | "medium" | "strong";
  saturationAmount: number;
  stereoWidth: number;
  targetLufs: number;
  limiterCeilingDb: number;
  transientHandling: "preserve" | "balanced" | "tight";
  vocalPresenceEmphasis: number;
};

export type AdaptiveInstructionSummary = {
  source: "ai";
  rationale: string;
  settings: AdaptiveInstructionSettings;
};

export type AdaptiveMasteringResult = {
  baselineAnalysis: TrackAnalysis;
  adaptiveAnalysis: TrackAnalysis | null;
  adaptiveReadiness: ReturnType<typeof evaluateTrackReadiness> | null;
  instructionSummary: AdaptiveInstructionSummary;
  adaptiveMasteredPath: string;
  adaptivePreviewPath: string;
  baselinePreviewPath: string;
  outputMime: string;
  outputCodec: "pcm_s16le" | "pcm_s24le" | "pcm_f32le";
  validation: {
    correctivePasses: number;
    warnings: string[];
  };
};

function resolveCodecForQuality(quality: PlanQuality): "pcm_s16le" | "pcm_s24le" | "pcm_f32le" {
  if (quality === "24bit") return "pcm_s24le";
  if (quality === "32bit_float") return "pcm_f32le";
  return "pcm_s16le";
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function toFixedDb(value: number): number {
  return Number(value.toFixed(2));
}

function runFfmpeg(args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(getFfmpegExecutablePath(), args, { stdio: ["ignore", "ignore", "pipe"] });
    let stderr = "";
    child.stderr.on("data", (chunk) => {
      stderr += String(chunk);
    });
    child.on("error", (err) => {
      const base = err instanceof Error ? err.message : String(err);
      reject(new Error(`ffmpeg spawn error: ${base}${stderr ? ` | stderr: ${stderr.slice(-600)}` : ""}`));
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

async function applyCorrectiveGainPass(params: {
  sourcePath: string;
  outputCodec: "pcm_s16le" | "pcm_s24le" | "pcm_f32le";
  gainDb: number;
  limiterCeilingDb: number;
}): Promise<void> {
  const tempPassPath = path.join(getTempRoot(), `${makeId("adaptive_corrective")}.wav`);
  await runFfmpeg([
    "-y",
    "-hide_banner",
    "-i",
    params.sourcePath,
    "-af",
    `volume=${toFixedDb(params.gainDb)}dB,alimiter=limit=${Math.pow(10, params.limiterCeilingDb / 20).toFixed(4)}:attack=4:release=70:level=disabled`,
    "-c:a",
    params.outputCodec,
    "-ar",
    "44100",
    "-ac",
    "2",
    tempPassPath
  ]);
  await fs.copyFile(tempPassPath, params.sourcePath);
  await fs.unlink(tempPassPath).catch(() => undefined);
}

function mapLowEqActionToDb(action: "tighten" | "reduce" | "neutral" | "enhance"): number {
  if (action === "tighten") return -1.2;
  if (action === "reduce") return -1.8;
  if (action === "enhance") return 1.2;
  return 0;
}

function mapMidEqActionToDb(action: "smooth" | "reduce" | "neutral" | "forward"): number {
  if (action === "smooth") return -0.8;
  if (action === "reduce") return -1.4;
  if (action === "forward") return 0.8;
  return 0;
}

function mapHighEqActionToDb(action: "soften" | "neutral" | "add_presence" | "add_air"): { presence: number; air: number } {
  if (action === "soften") return { presence: -1.1, air: -0.9 };
  if (action === "add_presence") return { presence: 1.1, air: 0.3 };
  if (action === "add_air") return { presence: 0.5, air: 1.2 };
  return { presence: 0, air: 0 };
}

function mapCompressionAmountToIntensity(amount: "low" | "medium" | "high"): AdaptiveInstructionSettings["compressionIntensity"] {
  if (amount === "high") return "strong";
  if (amount === "medium") return "medium";
  return "light";
}

function mapSaturationAmount(amount: "none" | "low" | "medium"): number {
  if (amount === "medium") return 0.6;
  if (amount === "low") return 0.35;
  return 0;
}

function mapStereoWidth(width: "narrow" | "moderate" | "wide"): number {
  if (width === "wide") return 1.1;
  if (width === "narrow") return 0.96;
  return 1.02;
}

function mapTransientEmphasis(value: "low" | "medium" | "high"): AdaptiveInstructionSettings["transientHandling"] {
  if (value === "high") return "preserve";
  if (value === "low") return "tight";
  return "balanced";
}

async function generateAdaptiveInstructions(
  baseline: TrackAnalysis,
  genre: keyof typeof GENRE_PRESETS | undefined,
  loudnessMode: LoudnessMode | undefined,
  userIntent: string | undefined
): Promise<AdaptiveInstructionSummary> {
  const decision = await requestAdaptiveDecisionFromOpenAI({
    analysis: baseline,
    genre,
    loudnessMode,
    userIntent
  });
  const highBand = mapHighEqActionToDb(decision.eq_high_action);
  const isHarshTrack = baseline.notes.some((note) => note.includes("reduce potential harshness"));
  const subtlePresenceLiftDb = decision.eq_high_action === "add_presence" && !isHarshTrack ? 0.3 : 0;
  const compStyleBonus = decision.compression_style === "punch" ? 0.25 : decision.compression_style === "glue" ? 0.15 : 0;

  return {
    source: "ai",
    rationale: decision.reasoning_summary,
    settings: {
      eqDirection: {
        lowEnd: clamp(mapLowEqActionToDb(decision.eq_low_action), -2.2, 2.2),
        lowMid: clamp(mapMidEqActionToDb(decision.eq_mid_action), -2.2, 2.2),
        presence: clamp(highBand.presence + subtlePresenceLiftDb, -2.2, 2.2),
        air: clamp(highBand.air, -2.2, 2.2)
      },
      compressionIntensity: mapCompressionAmountToIntensity(decision.compression_amount),
      saturationAmount: clamp(mapSaturationAmount(decision.saturation_amount), 0, 1),
      stereoWidth: clamp(mapStereoWidth(decision.stereo_width), 0.9, 1.2),
      targetLufs: clamp(decision.target_lufs, -14, -8.8),
      limiterCeilingDb: clamp(decision.limiter_ceiling_db, -2, -0.1),
      transientHandling: mapTransientEmphasis(decision.transient_emphasis),
      vocalPresenceEmphasis: clamp(decision.vocal_presence_focus ? 1 + compStyleBonus : compStyleBonus, -1.5, 2)
    }
  };
}

function buildAdaptiveFilterChain(settings: AdaptiveInstructionSettings): string {
  const ratioByCompression = { light: 1.5, medium: 2.1, strong: 2.8 };
  const thresholdByCompression = { light: -18, medium: -15, strong: -12 };
  const attackByTransient = { preserve: 28, balanced: 16, tight: 8 };
  const releaseByTransient = { preserve: 190, balanced: 145, tight: 105 };
  const limiterCeiling = settings.limiterCeilingDb;
  // This is the primary translation point from AI `target_lufs` into render gain.
  // It is only an initial estimate; validation passes may adjust final loudness.
  const preGain = clamp((settings.targetLufs + 11.4) * 0.7, -1.2, 2.8);
  const extraStereo = clamp((settings.stereoWidth - 1) * 2.2, 0, 0.5);

  return [
    `equalizer=f=85:width_type=o:width=1.2:g=${toFixedDb(settings.eqDirection.lowEnd)}`,
    `equalizer=f=320:width_type=o:width=1.2:g=${toFixedDb(settings.eqDirection.lowMid)}`,
    `equalizer=f=2500:width_type=o:width=1.2:g=${toFixedDb(settings.eqDirection.presence + settings.vocalPresenceEmphasis * 0.35)}`,
    `equalizer=f=11000:width_type=o:width=1.1:g=${toFixedDb(settings.eqDirection.air)}`,
    `acompressor=threshold=${toFixedDb(thresholdByCompression[settings.compressionIntensity])}dB:ratio=${toFixedDb(ratioByCompression[settings.compressionIntensity])}:attack=${attackByTransient[settings.transientHandling]}:release=${releaseByTransient[settings.transientHandling]}:makeup=1`,
    ...(settings.saturationAmount > 0.2
      ? [`asoftclip=type=tanh:threshold=${toFixedDb(clamp(0.97 - settings.saturationAmount * 0.12, 0.84, 0.97))}`]
      : []),
    ...(extraStereo > 0 ? [`extrastereo=m=${toFixedDb(extraStereo)}`] : []),
    `volume=${toFixedDb(preGain)}dB`,
    `alimiter=limit=${Math.pow(10, limiterCeiling / 20).toFixed(4)}:attack=5:release=80:level=disabled`
  ].join(",");
}

export async function runAdaptiveMasteringPipeline(request: AdaptiveMasteringRequest): Promise<AdaptiveMasteringResult> {
  await fs.mkdir(getTempRoot(), { recursive: true });
  const baselineAnalysis = await analyzeTrack(request.inputPath);
  const instructionSummary = await generateAdaptiveInstructions(
    baselineAnalysis,
    request.genre,
    request.loudnessMode,
    request.userIntent
  );
  const outputCodec = resolveCodecForQuality(request.outputQuality);

  const adaptiveMasteredPath = path.join(getTempRoot(), `${makeId(`adaptive_${request.jobId}`)}.wav`);
  const adaptivePreviewPath = path.join(getTempRoot(), `${makeId(`adaptive_preview_${request.jobId}`)}.mp3`);
  const baselinePreviewPath = path.join(getTempRoot(), `${makeId(`standard_preview_${request.jobId}`)}.mp3`);

  const warnings: string[] = [];
  let correctivePasses = 0;
  const maxCorrectivePasses = 2;
  const filterChain = buildAdaptiveFilterChain(instructionSummary.settings);
  const competitiveLufsGapMax = 1.5;
  const safePeakForBoostDb = -0.4;
  const correctiveLimiterCeilingDb = clamp(instructionSummary.settings.limiterCeilingDb - 0.25, -1.2, -0.65);

  await runFfmpeg([
    "-y",
    "-hide_banner",
    "-i",
    request.inputPath,
    "-af",
    filterChain,
    "-c:a",
    outputCodec,
    "-ar",
    "44100",
    "-ac",
    "2",
    adaptiveMasteredPath
  ]);

  let adaptiveAnalysis: TrackAnalysis | null = null;
  try {
    adaptiveAnalysis = await analyzeTrack(adaptiveMasteredPath);
    while (adaptiveAnalysis && correctivePasses < maxCorrectivePasses) {
      const peakUnsafe = adaptiveAnalysis.peakDb !== null && adaptiveAnalysis.peakDb > -0.3;
      const tooQuietVsTarget =
        adaptiveAnalysis.integratedLufs !== null &&
        adaptiveAnalysis.integratedLufs < instructionSummary.settings.targetLufs - 1.2;
      const tooQuietVsStandard =
        adaptiveAnalysis.integratedLufs !== null &&
        baselineAnalysis.integratedLufs !== null &&
        adaptiveAnalysis.integratedLufs < baselineAnalysis.integratedLufs - competitiveLufsGapMax;
      const needsCorrectivePass = peakUnsafe || tooQuietVsTarget || tooQuietVsStandard;
      if (!needsCorrectivePass) break;

      correctivePasses += 1;
      const baselineGap =
        adaptiveAnalysis.integratedLufs !== null && baselineAnalysis.integratedLufs !== null
          ? baselineAnalysis.integratedLufs - adaptiveAnalysis.integratedLufs
          : null;

      let correctiveGain = 0;
      if (peakUnsafe) {
        correctiveGain = -0.8;
      } else {
        const desiredBoostFromGap = baselineGap !== null ? baselineGap - competitiveLufsGapMax : 0;
        const defaultBoost = tooQuietVsTarget ? 0.9 : 0.6;
        const peakHeadroom =
          adaptiveAnalysis.peakDb !== null ? Math.max(0, safePeakForBoostDb - adaptiveAnalysis.peakDb) : 1.2;
        correctiveGain = clamp(Math.max(defaultBoost, desiredBoostFromGap), 0.4, Math.min(2.4, peakHeadroom + 0.25));
      }

      await applyCorrectiveGainPass({
        sourcePath: adaptiveMasteredPath,
        outputCodec,
        gainDb: correctiveGain,
        limiterCeilingDb: correctiveLimiterCeilingDb
      });
      adaptiveAnalysis = await analyzeTrack(adaptiveMasteredPath);
    }

    // Final competitiveness guard: if still materially below both target and baseline guard,
    // allow one additional small correction when peak headroom permits.
    const materiallyBelowTarget =
      adaptiveAnalysis?.integratedLufs !== null &&
      adaptiveAnalysis.integratedLufs < instructionSummary.settings.targetLufs - 0.35;
    const materiallyBelowStandardGuard =
      adaptiveAnalysis?.integratedLufs !== null &&
      baselineAnalysis.integratedLufs !== null &&
      adaptiveAnalysis.integratedLufs < baselineAnalysis.integratedLufs - (competitiveLufsGapMax + 0.15);
    const hasBoostHeadroom = adaptiveAnalysis?.peakDb !== null && adaptiveAnalysis.peakDb <= -0.9;
    if (adaptiveAnalysis && materiallyBelowTarget && materiallyBelowStandardGuard && hasBoostHeadroom) {
      const targetCatchUp = instructionSummary.settings.targetLufs - adaptiveAnalysis.integratedLufs!;
      const baselineCatchUp =
        baselineAnalysis.integratedLufs! - adaptiveAnalysis.integratedLufs! - competitiveLufsGapMax;
      const extraGain = clamp(Math.min(targetCatchUp, baselineCatchUp), 0.35, 0.85);
      correctivePasses += 1;
      await applyCorrectiveGainPass({
        sourcePath: adaptiveMasteredPath,
        outputCodec,
        gainDb: extraGain,
        limiterCeilingDb: correctiveLimiterCeilingDb
      });
      adaptiveAnalysis = await analyzeTrack(adaptiveMasteredPath);
      warnings.push("Applied a final micro-correction pass to better align adaptive loudness safely.");
    }
    if (correctivePasses > 0) {
      warnings.push("Applied adaptive validation correction to keep output competitive and safe.");
    }
    if (process.env.NODE_ENV !== "production") {
      const baselineLufs = baselineAnalysis.integratedLufs;
      const adaptiveLufs = adaptiveAnalysis?.integratedLufs ?? null;
      const lufsDelta =
        baselineLufs !== null && adaptiveLufs !== null ? Number((adaptiveLufs - baselineLufs).toFixed(2)) : null;
      console.log("[ADAPTIVE_VALIDATION_DEBUG] loudness_compare", {
        baselineLufs,
        adaptiveLufs,
        adaptiveMinusStandardLufs: lufsDelta,
        baselinePeakDb: baselineAnalysis.peakDb,
        adaptivePeakDb: adaptiveAnalysis?.peakDb ?? null,
        baselineCrestDb: baselineAnalysis.crestDb,
        adaptiveCrestDb: adaptiveAnalysis?.crestDb ?? null,
        targetLufs: instructionSummary.settings.targetLufs,
        limiterCeilingDb: instructionSummary.settings.limiterCeilingDb,
        compressionIntensity: instructionSummary.settings.compressionIntensity,
        correctivePasses
      });
    }
  } catch {
    warnings.push("Post-render analysis was unavailable for adaptive output.");
  }

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
      baselinePreviewPath
    ]),
    runFfmpeg([
      "-y",
      "-hide_banner",
      "-i",
      adaptiveMasteredPath,
      "-ss",
      "0",
      "-t",
      "30",
      "-codec:a",
      "libmp3lame",
      "-b:a",
      "192k",
      adaptivePreviewPath
    ])
  ]);

  return {
    baselineAnalysis,
    adaptiveAnalysis,
    adaptiveReadiness: adaptiveAnalysis ? evaluateTrackReadiness(adaptiveAnalysis, "postmaster") : null,
    instructionSummary,
    adaptiveMasteredPath,
    adaptivePreviewPath,
    baselinePreviewPath,
    outputMime: "audio/wav",
    outputCodec,
    validation: {
      correctivePasses,
      warnings
    }
  };
}
