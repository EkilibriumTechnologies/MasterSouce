import { spawn } from "node:child_process";
import { analyzeTrack } from "@/lib/audio/analyze-track";
import { getFfmpegExecutablePath } from "@/lib/audio/ffmpeg-bin";
import { probeAudioStream } from "@/lib/audio/media-probe";
import type { AudioArtifactProfile } from "@/lib/audio/audio-restoration-types";
import {
  AUDIO_RESTORATION_THRESHOLDS,
  clamp01,
  selectAudioRestorationStrength,
  shouldRecommendAudioRestoration
} from "@/lib/audio/audio-restoration-thresholds";

function emptyProfile(): AudioArtifactProfile {
  return {
    version: "v1",
    metallicHarshness: 0,
    highFrequencySmear: 0,
    transientSoftness: 0,
    stereoInstability: 0,
    sibilanceHarshness: 0,
    codecLikeResidue: 0,
    overallSeverity: 0,
    recommendedStrength: "light",
    restorationRecommended: false
  };
}

function normalizeDbAbove(referenceDb: number | null, bandDb: number | null, startDb: number, fullScaleDb: number): number {
  if (referenceDb === null || bandDb === null) return 0;
  return clamp01((bandDb - referenceDb - startDb) / fullScaleDb);
}

function normalizeDbAbsolute(valueDb: number | null, startDb: number, fullScaleDb: number): number {
  if (valueDb === null) return 0;
  return clamp01((valueDb - startDb) / fullScaleDb);
}

function runFfmpegStderr(args: string[]): Promise<string> {
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
      resolve(stderr);
    });
  });
}

function parseLastFloat(text: string, pattern: RegExp): number | null {
  const matches = [...text.matchAll(pattern)];
  if (!matches.length) return null;
  const value = Number(matches[matches.length - 1][1]);
  return Number.isFinite(value) ? value : null;
}

async function measureBandMeanDb(inputPath: string, highpass: number, lowpass: number): Promise<number | null> {
  try {
    const stderr = await runFfmpegStderr([
      "-hide_banner",
      "-i",
      inputPath,
      "-af",
      `highpass=f=${highpass},lowpass=f=${lowpass},volumedetect`,
      "-f",
      "null",
      "-"
    ]);
    return parseLastFloat(stderr, /mean_volume:\s*(-?\d+(?:\.\d+)?)\s*dB/g);
  } catch {
    return null;
  }
}

function dbToPower(db: number): number {
  return 10 ** (db / 10);
}

function parseChannelRms(stderr: string): number[] {
  const rms: number[] = [];
  let channel: number | null = null;
  for (const line of stderr.split(/\r?\n/)) {
    const channelMatch = line.match(/Channel:\s*(\d+)/);
    if (channelMatch) {
      channel = Number(channelMatch[1]);
      continue;
    }
    const rmsMatch = line.match(/RMS level dB:\s*(-?\d+(?:\.\d+)?)/);
    if (rmsMatch && channel !== null && rms[channel - 1] === undefined) {
      rms[channel - 1] = Number(rmsMatch[1]);
    }
  }
  return rms.filter((value) => Number.isFinite(value));
}

async function measureStereoInstability(inputPath: string): Promise<number> {
  try {
    const probe = await probeAudioStream(inputPath);
    if (probe.channels < 2) return 0;
    const stderr = await runFfmpegStderr([
      "-hide_banner",
      "-i",
      inputPath,
      "-filter_complex",
      "[0:a]asplit=2[a][b];[a]pan=mono|c0=0.5*c0+0.5*c1[mid];[b]pan=mono|c0=0.5*c0-0.5*c1[side];[mid][side]amerge=inputs=2,astats=metadata=0:reset=0[m]",
      "-map",
      "[m]",
      "-f",
      "null",
      "-"
    ]);
    const [midRmsDb, sideRmsDb] = parseChannelRms(stderr);
    if (!Number.isFinite(midRmsDb) || !Number.isFinite(sideRmsDb)) return 0;
    const midPower = dbToPower(midRmsDb);
    const sidePower = dbToPower(sideRmsDb);
    if (midPower + sidePower <= 0) return 0;
    const correlation = (midPower - sidePower) / (midPower + sidePower);
    const sideToMidDb = sideRmsDb - midRmsDb;
    const veryWide = clamp01((sideToMidDb + 7) / 10);
    const lowCorrelation = clamp01((0.35 - correlation) / 0.7);
    return clamp01(Math.max(veryWide, lowCorrelation));
  } catch {
    return 0;
  }
}

export async function assessAudioArtifacts(inputPath: string): Promise<AudioArtifactProfile> {
  try {
    const [analysis, sibilanceDb, brillianceDb, stereoInstability] = await Promise.all([
      analyzeTrack(inputPath),
      measureBandMeanDb(inputPath, 5500, 9500),
      measureBandMeanDb(inputPath, 9500, 16000),
      measureStereoInstability(inputPath)
    ]);

    const effectivelySilent =
      (analysis.meanDb !== null && analysis.meanDb < -70) ||
      (analysis.peakDb !== null && analysis.peakDb < -60) ||
      analysis.durationSec === 0;
    if (effectivelySilent) return emptyProfile();

    // V1 uses measurable proxies only. High-frequency smear and codec-like
    // residue are approximate until benchmarked against a larger fixture set.
    const metallicHarshness = clamp01(
      Math.max(
        normalizeDbAbove(analysis.meanDb, analysis.harshnessDb, 8, 16),
        normalizeDbAbsolute(analysis.harshnessDb, -30, 18)
      )
    );
    const sibilanceHarshness = clamp01(
      Math.max(
        normalizeDbAbove(analysis.meanDb, sibilanceDb, 9, 16),
        normalizeDbAbsolute(sibilanceDb, -31, 17)
      )
    );
    const highFrequencySmear = clamp01(
      Math.max(
        normalizeDbAbove(analysis.harshnessDb, brillianceDb, -2, 12),
        normalizeDbAbove(analysis.meanDb, brillianceDb, 12, 18)
      )
    );
    const transientSoftness = clamp01(
      analysis.crestDb === null ? 0 : (AUDIO_RESTORATION_THRESHOLDS.artifact.transientSoftness * 10 - analysis.crestDb) / 8
    );
    const codecLikeResidue = clamp01(
      Math.max(
        highFrequencySmear * 0.65 + normalizeDbAbsolute(brillianceDb, -42, 18) * 0.35,
        normalizeDbAbove(analysis.meanDb, brillianceDb, 14, 18)
      )
    );

    const metrics = [
      metallicHarshness,
      highFrequencySmear,
      transientSoftness,
      stereoInstability,
      sibilanceHarshness,
      codecLikeResidue
    ];
    const strongestMetric = Math.max(...metrics);
    const overallSeverity = clamp01(
      metrics.reduce((sum, value) => sum + value, 0) / metrics.length * 0.55 + strongestMetric * 0.45
    );
    const profile: AudioArtifactProfile = {
      version: "v1",
      metallicHarshness,
      highFrequencySmear,
      transientSoftness,
      stereoInstability,
      sibilanceHarshness,
      codecLikeResidue,
      overallSeverity,
      recommendedStrength: selectAudioRestorationStrength(overallSeverity, strongestMetric),
      restorationRecommended: false
    };
    return {
      ...profile,
      restorationRecommended: shouldRecommendAudioRestoration(profile)
    };
  } catch {
    return emptyProfile();
  }
}
