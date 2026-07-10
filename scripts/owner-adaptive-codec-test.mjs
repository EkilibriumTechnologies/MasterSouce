import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import ffmpegStatic from "ffmpeg-static";

import { probeAudioStream } from "@/lib/audio/media-probe";
import {
  resolveCodecForQuality,
  WAV_EXPORT_CHANNELS,
  WAV_EXPORT_SAMPLE_RATE
} from "@/lib/audio/wav-export-codec";
import { validateExportedWav } from "@/lib/audio/wav-export-validation";

if (typeof ffmpegStatic !== "string") {
  throw new Error("ffmpeg-static is required for owner adaptive codec tests.");
}

function runFfmpeg(args) {
  const result = spawnSync(ffmpegStatic, args, { encoding: "utf8" });
  assert.equal(result.status, 0, `ffmpeg failed: ${result.stderr.slice(-1000)}`);
}

const outputQuality = "32bit_float";
const outputCodec = resolveCodecForQuality(outputQuality);
assert.equal(outputCodec, "pcm_f32le", "owner 32bit_float quality maps to pcm_f32le");

const workDir = mkdtempSync(path.join(tmpdir(), "mastersouce-owner-adaptive-codec-"));
const sourceWav = path.join(workDir, "owner-adaptive-source.wav");
const ownerAdaptiveWav = path.join(workDir, "owner-adaptive-master.wav");

runFfmpeg([
  "-y",
  "-hide_banner",
  "-f",
  "lavfi",
  "-i",
  "sine=frequency=440:duration=2",
  "-c:a",
  "pcm_s16le",
  "-ar",
  String(WAV_EXPORT_SAMPLE_RATE),
  "-ac",
  String(WAV_EXPORT_CHANNELS),
  sourceWav
]);

runFfmpeg([
  "-y",
  "-hide_banner",
  "-i",
  sourceWav,
  "-af",
  "volume=-6dB,alimiter=limit=0.8913:attack=5:release=80:level=disabled",
  "-c:a",
  outputCodec,
  "-ar",
  String(WAV_EXPORT_SAMPLE_RATE),
  "-ac",
  String(WAV_EXPORT_CHANNELS),
  ownerAdaptiveWav
]);

await validateExportedWav(ownerAdaptiveWav, { codec: outputCodec });
const probe = await probeAudioStream(ownerAdaptiveWav);

assert.equal(probe.codec_name, "pcm_f32le", "owner Adaptive WAV codec is pcm_f32le");
assert.equal(probe.sample_fmt, "flt", "owner Adaptive WAV sample format is 32-bit float");
assert.equal(probe.bits_per_sample ?? probe.bits_per_raw_sample, 32, "owner Adaptive WAV bit depth is 32");
assert.equal(probe.sample_rate, WAV_EXPORT_SAMPLE_RATE, "owner Adaptive WAV sample rate is 44.1 kHz");
assert.equal(probe.channels, WAV_EXPORT_CHANNELS, "owner Adaptive WAV is stereo");

console.log(
  JSON.stringify({
    ownerAdaptiveWav,
    outputQuality,
    outputCodec,
    ffprobe: probe
  })
);
console.log("owner adaptive codec test passed");
