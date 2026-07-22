import { promises as fs } from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";
import { assessAudioArtifacts } from "@/lib/audio/audio-artifact-assessment";
import {
  AUDIO_RESTORATION_THRESHOLDS,
  exceedsAudioRestorationThreshold
} from "@/lib/audio/audio-restoration-thresholds";
import type {
  AudioArtifactProfile,
  AudioRestorationResult,
  AudioRestorationStrength
} from "@/lib/audio/audio-restoration-types";
import { getFfmpegExecutablePath } from "@/lib/audio/ffmpeg-bin";
import { probeAudioStream } from "@/lib/audio/media-probe";
import { getTempRoot, makeId } from "@/lib/storage/temp-files";

type RestorationModule =
  | "harsh_resonance_control"
  | "high_frequency_smoothing"
  | "de_essing"
  | "transient_recovery"
  | "stereo_stabilization"
  | "codec_residue_cleanup"
  | "safety_gain_control";

export type RunAudioArtifactRestorationRequest = {
  inputPath: string;
  jobId: string;
  strength: AudioRestorationStrength;
  artifactProfile?: AudioArtifactProfile;
  force?: boolean;
};

function toFixed(value: number): number {
  return Number(value.toFixed(4));
}

function fallbackResult(params: {
  inputPath: string;
  strength: AudioRestorationStrength;
  attempted: boolean;
  fallbackReason: string;
  processingTimeMs?: number;
}): AudioRestorationResult {
  return {
    attempted: params.attempted,
    applied: false,
    success: false,
    strength: params.strength,
    inputPath: params.inputPath,
    fallbackUsed: true,
    fallbackReason: params.fallbackReason,
    modulesApplied: [],
    ...(params.processingTimeMs !== undefined ? { processingTimeMs: params.processingTimeMs } : {})
  };
}

function buildAudioArtifactRestorationFilterChain(
  profile: AudioArtifactProfile,
  strength: AudioRestorationStrength
): { filterChain: string; modulesApplied: RestorationModule[] } {
  const amount = AUDIO_RESTORATION_THRESHOLDS.amount[strength];
  const filters: string[] = [];
  const modulesApplied: RestorationModule[] = [];

  if (
    exceedsAudioRestorationThreshold(
      profile.metallicHarshness,
      AUDIO_RESTORATION_THRESHOLDS.artifact.metallicHarshness
    )
  ) {
    filters.push(`equalizer=f=4200:width_type=o:width=1.1:g=${toFixed(amount.resonanceCutDb)}`);
    filters.push(`equalizer=f=7800:width_type=o:width=0.9:g=${toFixed(amount.resonanceCutDb * 0.55)}`);
    modulesApplied.push("harsh_resonance_control");
  }

  if (
    exceedsAudioRestorationThreshold(
      profile.highFrequencySmear,
      AUDIO_RESTORATION_THRESHOLDS.artifact.highFrequencySmear
    )
  ) {
    filters.push(`equalizer=f=12000:width_type=o:width=1.2:g=${toFixed(amount.highShelfDb)}`);
    modulesApplied.push("high_frequency_smoothing");
  }

  if (
    exceedsAudioRestorationThreshold(
      profile.sibilanceHarshness,
      AUDIO_RESTORATION_THRESHOLDS.artifact.sibilanceHarshness
    )
  ) {
    filters.push(`deesser=i=${toFixed(amount.deEssIntensity)}:m=${toFixed(Math.min(0.42, amount.deEssIntensity + 0.14))}:f=0.55:s=o`);
    modulesApplied.push("de_essing");
  }

  if (
    exceedsAudioRestorationThreshold(
      profile.transientSoftness,
      AUDIO_RESTORATION_THRESHOLDS.artifact.transientSoftness
    )
  ) {
    filters.push(
      `acompressor=mode=upward:threshold=0.06:ratio=${toFixed(amount.transientRatio)}:attack=8:release=90:makeup=1`
    );
    modulesApplied.push("transient_recovery");
  }

  if (
    exceedsAudioRestorationThreshold(
      profile.stereoInstability,
      AUDIO_RESTORATION_THRESHOLDS.artifact.stereoInstability
    )
  ) {
    filters.push(`extrastereo=m=${toFixed(amount.stereoMultiplier)}`);
    modulesApplied.push("stereo_stabilization");
  }

  if (
    exceedsAudioRestorationThreshold(
      profile.codecLikeResidue,
      AUDIO_RESTORATION_THRESHOLDS.artifact.codecLikeResidue
    )
  ) {
    filters.push(`afftdn=nr=${toFixed(amount.denoiseNr)}:nf=-60:nt=w`);
    modulesApplied.push("codec_residue_cleanup");
  }

  filters.push("volume=-0.2dB");
  filters.push("alimiter=limit=0.9441:attack=5:release=80:level=disabled");
  modulesApplied.push("safety_gain_control");

  return { filterChain: filters.join(","), modulesApplied };
}

function runFfmpeg(args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(getFfmpegExecutablePath(), args, { stdio: ["ignore", "ignore", "pipe"] });
    let stderr = "";
    child.stderr.on("data", (chunk) => {
      stderr += String(chunk);
    });
    child.on("error", (err) => {
      const message = err instanceof Error ? err.message : String(err);
      reject(new Error(`ffmpeg spawn error: ${message}`));
    });
    child.on("close", (code) => {
      if (code !== 0) {
        reject(new Error(`ffmpeg failed (${code}): ${stderr.slice(-900)}`));
        return;
      }
      resolve();
    });
  });
}

export async function runAudioArtifactRestoration(
  request: RunAudioArtifactRestorationRequest
): Promise<AudioRestorationResult> {
  const startedAt = Date.now();
  const profile = request.artifactProfile ?? (await assessAudioArtifacts(request.inputPath));

  if (!profile.restorationRecommended && request.force !== true) {
    return fallbackResult({
      inputPath: request.inputPath,
      strength: request.strength,
      attempted: false,
      fallbackReason: "not_recommended",
      processingTimeMs: Date.now() - startedAt
    });
  }

  try {
    await fs.mkdir(getTempRoot(), { recursive: true });
    const probe = await probeAudioStream(request.inputPath);
    const sampleRate = Number.isFinite(probe.sample_rate) && probe.sample_rate > 0 ? probe.sample_rate : 44100;
    const channels = probe.channels === 1 ? 1 : 2;
    const outputPath = path.join(getTempRoot(), `${makeId(`restored_${request.jobId}`)}.wav`);
    const { filterChain, modulesApplied } = buildAudioArtifactRestorationFilterChain(profile, request.strength);

    if (modulesApplied.length === 1 && modulesApplied[0] === "safety_gain_control") {
      return fallbackResult({
        inputPath: request.inputPath,
        strength: request.strength,
        attempted: false,
        fallbackReason: "no_artifact_modules_selected",
        processingTimeMs: Date.now() - startedAt
      });
    }

    await runFfmpeg([
      "-y",
      "-hide_banner",
      "-i",
      request.inputPath,
      "-af",
      filterChain,
      "-c:a",
      "pcm_s24le",
      "-ar",
      String(sampleRate),
      "-ac",
      String(channels),
      outputPath
    ]);

    const stats = await fs.stat(outputPath);
    if (!stats.isFile() || stats.size <= 0) {
      return fallbackResult({
        inputPath: request.inputPath,
        strength: request.strength,
        attempted: true,
        fallbackReason: "empty_output",
        processingTimeMs: Date.now() - startedAt
      });
    }

    return {
      attempted: true,
      applied: true,
      success: true,
      strength: request.strength,
      inputPath: request.inputPath,
      outputPath,
      fallbackUsed: false,
      modulesApplied,
      processingTimeMs: Date.now() - startedAt
    };
  } catch {
    return fallbackResult({
      inputPath: request.inputPath,
      strength: request.strength,
      attempted: true,
      fallbackReason: "processing_error",
      processingTimeMs: Date.now() - startedAt
    });
  }
}

export const __audioArtifactRestorationForTest = {
  buildAudioArtifactRestorationFilterChain
};
