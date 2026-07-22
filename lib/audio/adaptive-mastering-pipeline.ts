import { promises as fs } from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";
import { analyzeTrack, type TrackAnalysis } from "@/lib/audio/analyze-track";
import type { AdaptiveAnalysisDiagnostics, AdaptiveTrackAnalyzer } from "@/lib/audio/adaptive-track-analysis";
import { getFfmpegExecutablePath } from "@/lib/audio/ffmpeg-bin";
import { getPreviewStartSeconds, getSafePreviewDurationSeconds } from "@/lib/audio/preview-segment";
import type { AdaptiveDecision } from "@/lib/openai/adaptive-mastering";
import { tryRequestAdaptiveDecisionWithTimeoutRetry } from "@/lib/openai/adaptive-mastering";
import { evaluateTrackReadiness } from "@/lib/audio/readiness";
import { GENRE_PRESETS, getLoudnessModeLufsTarget, getLoudnessModeTruePeak, type LoudnessMode } from "@/lib/genre-presets";
import { applyReferenceTrackGuidance } from "@/lib/audio/reference-track-guidance";
import { validateExportedWav } from "@/lib/audio/wav-export-validation";
import { resolveCodecForQuality, WAV_EXPORT_CHANNELS, WAV_EXPORT_SAMPLE_RATE } from "@/lib/audio/wav-export-codec";
import { markJobExportCodecVerified } from "@/lib/jobs/job-export-verify";
import { getTempRoot, makeId } from "@/lib/storage/temp-files";
import type { PlanQuality } from "@/lib/subscriptions/types";
import {
  classifyAdaptiveStereoIntent,
  mapAdaptiveStereoWidth,
  resolveAdaptiveStereoWidthMultiplier,
  shouldApplyAdaptiveStereoWidthFilter,
  type AdaptiveStereoIntent
} from "@/lib/audio/adaptive-stereo-width";

export type AdaptiveMasteringRequest = {
  inputPath: string;
  jobId: string;
  genre?: keyof typeof GENRE_PRESETS;
  loudnessMode?: LoudnessMode;
  userIntent?: string;
  referenceAnalysis?: TrackAnalysis;
  outputQuality: PlanQuality;
  analyzeForAdaptive?: AdaptiveTrackAnalyzer;
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
  source: "ai" | "heuristic";
  rationale: string;
  settings: AdaptiveInstructionSettings;
};

export type AdaptiveMasteringResult = {
  baselineAnalysis: TrackAnalysis;
  adaptiveAnalysis: TrackAnalysis | null;
  adaptiveReadiness: ReturnType<typeof evaluateTrackReadiness> | null;
  instructionSummary: AdaptiveInstructionSummary;
  referenceTrackApplied: boolean;
  adaptiveMasteredPath: string;
  adaptivePreviewPath: string;
  baselinePreviewPath: string;
  outputMime: string;
  outputCodec: "pcm_s16le" | "pcm_s24le" | "pcm_f32le";
  validation: {
    correctivePasses: number;
    warnings: string[];
  };
  analysisDiagnostics: {
    baseline: AdaptiveAnalysisDiagnostics;
    adaptive: AdaptiveAnalysisDiagnostics | null;
  };
  adaptiveAiFallback?: boolean;
  adaptiveAiFallbackReason?: "timeout";
  adaptiveAiFallbackMessage?: string;
};

function defaultV1Diagnostics(): AdaptiveAnalysisDiagnostics {
  return {
    requestedAnalysisVersion: "v1",
    ownerEligible: false,
    featureFlagMode: "off",
    featureFlagValue: null,
    actualImplementation: "v1",
    fallbackOccurred: false,
    fallbackReason: null
  };
}

async function analyzeAdaptiveDefault(inputPath: string) {
  return {
    analysis: await analyzeTrack(inputPath),
    diagnostics: defaultV1Diagnostics()
  };
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
    String(WAV_EXPORT_SAMPLE_RATE),
    "-ac",
    String(WAV_EXPORT_CHANNELS),
    tempPassPath
  ]);
  await validateExportedWav(tempPassPath, { codec: params.outputCodec });
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

function mapStereoWidth(width: "narrow" | "moderate" | "wide", intent: AdaptiveStereoIntent): number {
  return mapAdaptiveStereoWidth(width, intent);
}

function mapTransientEmphasis(value: "low" | "medium" | "high"): AdaptiveInstructionSettings["transientHandling"] {
  if (value === "high") return "preserve";
  if (value === "low") return "tight";
  return "balanced";
}

function mapAiDecisionToInstructionSummary(
  decision: AdaptiveDecision,
  baseline: TrackAnalysis,
  stereoIntent: AdaptiveStereoIntent
): AdaptiveInstructionSummary {
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
      stereoWidth: clamp(mapStereoWidth(decision.stereo_width, stereoIntent), 0.35, 1.2),
      targetLufs: clamp(decision.target_lufs, -14, -8.8),
      limiterCeilingDb: clamp(decision.limiter_ceiling_db, -2, -0.1),
      transientHandling: mapTransientEmphasis(decision.transient_emphasis),
      vocalPresenceEmphasis: clamp(decision.vocal_presence_focus ? 1 + compStyleBonus : compStyleBonus, -1.5, 2)
    }
  };
}

/** Standard MasterSauce profile derived from genre + loudness when Adaptive AI is unavailable. */
function buildHeuristicAdaptiveInstructionSummary(
  baseline: TrackAnalysis,
  genre: keyof typeof GENRE_PRESETS | undefined,
  loudnessMode: LoudnessMode | undefined,
  stereoIntent: AdaptiveStereoIntent
): AdaptiveInstructionSummary {
  const presetKey: keyof typeof GENRE_PRESETS =
    genre !== undefined && Object.prototype.hasOwnProperty.call(GENRE_PRESETS, genre) ? genre : "pop";
  const preset = GENRE_PRESETS[presetKey];
  const mode: LoudnessMode = loudnessMode ?? "balanced";

  const targetLufs = clamp(getLoudnessModeLufsTarget(preset, mode), -14, -8.8);
  const limiterCeilingDb = clamp(getLoudnessModeTruePeak(preset, mode), -2, -0.1);

  const ratio = preset.compression.ratio;
  const compressionIntensity: AdaptiveInstructionSettings["compressionIntensity"] =
    ratio >= 3.4 ? "strong" : ratio >= 2.1 ? "medium" : "light";

  const attack = preset.compression.attack;
  const transientHandling: AdaptiveInstructionSettings["transientHandling"] =
    attack <= 12 ? "tight" : attack >= 45 ? "preserve" : "balanced";

  let lowEnd = 0;
  let lowMid = 0;
  let presence = 0;
  let air = 0;
  let nLe = 0;
  let nLm = 0;
  let nPr = 0;
  let nAr = 0;

  for (const band of preset.eq) {
    if (band.type === "highpass") continue;
    const f = band.freq;
    const g = band.gain;
    if (f < 180) {
      lowEnd += g;
      nLe += 1;
    } else if (f < 900) {
      lowMid += g;
      nLm += 1;
    } else if (f < 7000) {
      presence += g;
      nPr += 1;
    } else {
      air += g;
      nAr += 1;
    }
  }

  const avg = (sum: number, n: number) => (n > 0 ? sum / n : 0);

  const eqDirection = {
    lowEnd: clamp(avg(lowEnd, nLe), -2.2, 2.2),
    lowMid: clamp(avg(lowMid, nLm), -2.2, 2.2),
    presence: clamp(avg(presence, nPr), -2.2, 2.2),
    air: clamp(avg(air, nAr), -2.2, 2.2)
  };

  if (baseline.notes.some((n) => n.includes("reduce potential harshness"))) {
    eqDirection.presence = clamp(eqDirection.presence - 0.4, -2.2, 2.2);
  }
  if (baseline.alreadyLimited) {
    eqDirection.lowEnd = clamp(eqDirection.lowEnd - 0.2, -2.2, 2.2);
  }

  return {
    source: "heuristic",
    rationale:
      "Applied the standard MasterSauce genre and loudness profile because Adaptive AI was unavailable.",
    settings: {
      eqDirection,
      compressionIntensity,
      saturationAmount: clamp(preset.saturation ? 0.35 : 0, 0, 1),
      stereoWidth: clamp(mapStereoWidth("moderate", stereoIntent), 0.35, 1.2),
      targetLufs,
      limiterCeilingDb,
      transientHandling,
      vocalPresenceEmphasis: clamp(0.35, -1.5, 2)
    }
  };
}

async function generateAdaptiveInstructions(
  baseline: TrackAnalysis,
  genre: keyof typeof GENRE_PRESETS | undefined,
  loudnessMode: LoudnessMode | undefined,
  userIntent: string | undefined,
  referenceAnalysis?: TrackAnalysis
): Promise<{
  instructionSummary: AdaptiveInstructionSummary;
  adaptiveAiFallback?: boolean;
  adaptiveAiFallbackReason?: "timeout";
  adaptiveAiFallbackMessage?: string;
}> {
  const tryResult = await tryRequestAdaptiveDecisionWithTimeoutRetry({
    analysis: baseline,
    genre,
    loudnessMode,
    userIntent,
    referenceAnalysis
  });
  const stereoIntent = classifyAdaptiveStereoIntent(userIntent);

  if (tryResult.ok) {
    return { instructionSummary: mapAiDecisionToInstructionSummary(tryResult.decision, baseline, stereoIntent) };
  }

  return {
    instructionSummary: buildHeuristicAdaptiveInstructionSummary(baseline, genre, loudnessMode, stereoIntent),
    adaptiveAiFallback: true,
    adaptiveAiFallbackReason: "timeout",
    adaptiveAiFallbackMessage:
      "Adaptive AI took too long, so we used the standard MasterSauce mastering chain."
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
  const stereoWidthMultiplier = resolveAdaptiveStereoWidthMultiplier(settings.stereoWidth);

  return [
    `equalizer=f=85:width_type=o:width=1.2:g=${toFixedDb(settings.eqDirection.lowEnd)}`,
    `equalizer=f=320:width_type=o:width=1.2:g=${toFixedDb(settings.eqDirection.lowMid)}`,
    `equalizer=f=2500:width_type=o:width=1.2:g=${toFixedDb(settings.eqDirection.presence + settings.vocalPresenceEmphasis * 0.35)}`,
    `equalizer=f=11000:width_type=o:width=1.1:g=${toFixedDb(settings.eqDirection.air)}`,
    `acompressor=threshold=${toFixedDb(thresholdByCompression[settings.compressionIntensity])}dB:ratio=${toFixedDb(ratioByCompression[settings.compressionIntensity])}:attack=${attackByTransient[settings.transientHandling]}:release=${releaseByTransient[settings.transientHandling]}:makeup=1`,
    ...(settings.saturationAmount > 0.2
      ? [`asoftclip=type=tanh:threshold=${toFixedDb(clamp(0.97 - settings.saturationAmount * 0.12, 0.84, 0.97))}`]
      : []),
    ...(shouldApplyAdaptiveStereoWidthFilter(settings.stereoWidth)
      ? [`extrastereo=m=${toFixedDb(stereoWidthMultiplier)}`]
      : []),
    `volume=${toFixedDb(preGain)}dB`,
    `alimiter=limit=${Math.pow(10, limiterCeiling / 20).toFixed(4)}:attack=5:release=80:level=disabled`
  ].join(",");
}

export async function runAdaptiveMasteringPipeline(request: AdaptiveMasteringRequest): Promise<AdaptiveMasteringResult> {
  await fs.mkdir(getTempRoot(), { recursive: true });
  const analyzeForAdaptive = request.analyzeForAdaptive ?? analyzeAdaptiveDefault;
  const baselineResult = await analyzeForAdaptive(request.inputPath);
  const baselineAnalysis = baselineResult.analysis;
  if (process.env.NODE_ENV !== "production") {
    console.log("[ADAPTIVE_ANALYSIS_DEBUG] baseline", {
      requestedAnalysisVersion: baselineResult.diagnostics.requestedAnalysisVersion,
      ownerEligible: baselineResult.diagnostics.ownerEligible,
      featureFlagMode: baselineResult.diagnostics.featureFlagMode,
      featureFlagValue: baselineResult.diagnostics.featureFlagValue,
      actualImplementation: baselineResult.diagnostics.actualImplementation,
      fallbackOccurred: baselineResult.diagnostics.fallbackOccurred,
      fallbackReason: baselineResult.diagnostics.fallbackReason
    });
  }
  const generated = await generateAdaptiveInstructions(
    baselineAnalysis,
    request.genre,
    request.loudnessMode,
    request.userIntent,
    request.referenceAnalysis
  );
  let { instructionSummary, adaptiveAiFallback, adaptiveAiFallbackReason, adaptiveAiFallbackMessage } = generated;
  const stereoIntent = classifyAdaptiveStereoIntent(request.userIntent);
  const referenceTrackApplied = Boolean(request.referenceAnalysis);
  if (request.referenceAnalysis) {
    instructionSummary = applyReferenceTrackGuidance(
      instructionSummary,
      baselineAnalysis,
      request.referenceAnalysis
    );
  }
  const outputCodec = resolveCodecForQuality(request.outputQuality);

  const adaptiveMasteredPath = path.join(getTempRoot(), `${makeId(`adaptive_${request.jobId}`)}.wav`);
  const adaptivePreviewPath = path.join(getTempRoot(), `${makeId(`adaptive_preview_${request.jobId}`)}.mp3`);
  const baselinePreviewPath = path.join(getTempRoot(), `${makeId(`standard_preview_${request.jobId}`)}.mp3`);

  const warnings: string[] = [];
  let correctivePasses = 0;
  const maxCorrectivePasses = 2;
  const filterChain = buildAdaptiveFilterChain(instructionSummary.settings);
  const finalStereoWidthMultiplier = resolveAdaptiveStereoWidthMultiplier(instructionSummary.settings.stereoWidth);
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
    String(WAV_EXPORT_SAMPLE_RATE),
    "-ac",
    String(WAV_EXPORT_CHANNELS),
    adaptiveMasteredPath
  ]);

  // Export-only verification — corrective passes preserve the same PCM codec.
  await validateExportedWav(adaptiveMasteredPath, { codec: outputCodec });

  let adaptiveAnalysis: TrackAnalysis | null = null;
  let adaptiveAnalysisDiagnostics: AdaptiveAnalysisDiagnostics | null = null;
  try {
    const firstAdaptiveResult = await analyzeForAdaptive(adaptiveMasteredPath);
    adaptiveAnalysis = firstAdaptiveResult.analysis;
    adaptiveAnalysisDiagnostics = firstAdaptiveResult.diagnostics;
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
      const correctedResult = await analyzeForAdaptive(adaptiveMasteredPath);
      adaptiveAnalysis = correctedResult.analysis;
      adaptiveAnalysisDiagnostics = correctedResult.diagnostics;
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
      const finalCorrectedResult = await analyzeForAdaptive(adaptiveMasteredPath);
      adaptiveAnalysis = finalCorrectedResult.analysis;
      adaptiveAnalysisDiagnostics = finalCorrectedResult.diagnostics;
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
        stereoIntent,
        parsedStereoWidth: instructionSummary.settings.stereoWidth,
        finalStereoWidthMultiplier,
        stereoWidthFilterApplied: shouldApplyAdaptiveStereoWidthFilter(instructionSummary.settings.stereoWidth),
        monoCompatibilityActivated: false,
        lowFrequencyMonoActivated: false,
        artistProfileWidthValue: null,
        correctivePasses,
        analysisDiagnostics: {
          baseline: baselineResult.diagnostics,
          adaptive: adaptiveAnalysisDiagnostics
        }
      });
    }
  } catch {
    warnings.push("Post-render analysis was unavailable for adaptive output.");
  }

  const previewStartSeconds = getPreviewStartSeconds(baselineAnalysis.durationSec);
  const previewDurationSeconds = getSafePreviewDurationSeconds(
    baselineAnalysis.durationSec,
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
      baselinePreviewPath
    ]),
    runFfmpeg([
      "-y",
      "-hide_banner",
      "-i",
      adaptiveMasteredPath,
      "-ss",
      previewStartSeconds.toFixed(2),
      "-t",
      previewDurationSeconds.toFixed(2),
      "-codec:a",
      "libmp3lame",
      "-b:a",
      "192k",
      adaptivePreviewPath
    ])
  ]);

  await validateExportedWav(adaptiveMasteredPath, { codec: outputCodec });
  await markJobExportCodecVerified(request.jobId, outputCodec);
  console.log(`[adaptive-mastering] verifiedExportCodec=${outputCodec}`);

  return {
    baselineAnalysis,
    adaptiveAnalysis,
    adaptiveReadiness: adaptiveAnalysis ? evaluateTrackReadiness(adaptiveAnalysis, "postmaster") : null,
    instructionSummary,
    referenceTrackApplied,
    adaptiveMasteredPath,
    adaptivePreviewPath,
    baselinePreviewPath,
    outputMime: "audio/wav",
    outputCodec,
    validation: {
      correctivePasses,
      warnings
    },
    analysisDiagnostics: {
      baseline: baselineResult.diagnostics,
      adaptive: adaptiveAnalysisDiagnostics
    },
    ...(adaptiveAiFallback === true
      ? {
          adaptiveAiFallback: true as const,
          adaptiveAiFallbackReason,
          adaptiveAiFallbackMessage
        }
      : {})
  };
}
