import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import ffmpegStatic from "ffmpeg-static";

if (typeof ffmpegStatic !== "string") {
  throw new Error("ffmpeg-static is required for wav export format tests.");
}

const FFMPEG = ffmpegStatic;
const workDir = mkdtempSync(path.join(tmpdir(), "mastersouce-wav-export-test-"));

function runFfmpeg(args) {
  const result = spawnSync(FFMPEG, args, { encoding: "utf8" });
  assert.equal(result.status, 0, `ffmpeg failed: ${result.stderr.slice(-800)}`);
  return result;
}

function probeStream(filePath) {
  const result = spawnSync(FFMPEG, ["-hide_banner", "-i", filePath], { encoding: "utf8" });
  const line = result.stderr.split(/\r?\n/).find((row) => row.includes("Audio:"));
  assert.ok(line, `missing Audio stream line for ${filePath}`);
  const parts = line.split(",").map((part) => part.trim().toLowerCase());
  const codecMatch = line.match(/Audio:\s*([^\s,]+)/);
  const rateMatch = line.match(/,\s*(\d+)\s*Hz,/);
  const channelMatch = line.match(/Hz,\s*([^,]+),/);
  assert.ok(codecMatch && rateMatch && channelMatch, `unable to parse probe line: ${line}`);
  const bitMatch = line.match(/\((\d+)\s*bit\)/);
  const codecMatchBits =
    codecMatch[1] === "pcm_s24le" ? 24 : codecMatch[1] === "pcm_s16le" ? 16 : codecMatch[1] === "pcm_f32le" ? 32 : null;
  return {
    codec: codecMatch[1],
    sampleRate: Number(rateMatch[1]),
    channels: channelMatch[1].trim().toLowerCase(),
    sampleFmt: parts.find((part) => part === "s16" || part.startsWith("s32") || part === "flt")?.split(/\s+/)[0] ?? null,
    bits: bitMatch ? Number(bitMatch[1]) : codecMatchBits,
    raw: line.trim()
  };
}

function isStereoChannels(token) {
  return token === "stereo" || token === "2 channels" || token === "2";
}

function measureMaxVolumeDb(filePath) {
  const result = runFfmpeg(["-hide_banner", "-i", filePath, "-af", "volumedetect", "-f", "null", "-"]);
  const match = result.stderr.match(/max_volume:\s*(-?\d+(?:\.\d+)?)\s*dB/);
  assert.ok(match, "volumedetect max_volume missing");
  return Number(match[1]);
}

try {
  const sourceWav = path.join(workDir, "source.wav");
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
    "44100",
    "-ac",
    "2",
    sourceWav
  ]);

  const wav16 = path.join(workDir, "export_16bit.wav");
  const wav24 = path.join(workDir, "export_24bit.wav");
  const previewMp3 = path.join(workDir, "preview.mp3");

  runFfmpeg([
    "-y",
    "-hide_banner",
    "-i",
    sourceWav,
    "-af",
    "volume=-6dB,alimiter=limit=0.8913:attack=5:release=80:level=disabled",
    "-c:a",
    "pcm_s16le",
    "-ar",
    "44100",
    "-ac",
    "2",
    wav16
  ]);

  runFfmpeg([
    "-y",
    "-hide_banner",
    "-i",
    sourceWav,
    "-af",
    "volume=-6dB,alimiter=limit=0.8913:attack=5:release=80:level=disabled",
    "-c:a",
    "pcm_s24le",
    "-ar",
    "44100",
    "-ac",
    "2",
    wav24
  ]);

  runFfmpeg([
    "-y",
    "-hide_banner",
    "-i",
    wav24,
    "-ss",
    "0.5",
    "-t",
    "1.0",
    "-codec:a",
    "libmp3lame",
    "-b:a",
    "192k",
    previewMp3
  ]);

  const probe16 = probeStream(wav16);
  assert.equal(probe16.codec, "pcm_s16le");
  assert.equal(probe16.sampleRate, 44100);
  assert.ok(isStereoChannels(probe16.channels));
  assert.equal(probe16.sampleFmt, "s16");
  assert.equal(probe16.bits, 16);

  const probe24 = probeStream(wav24);
  assert.equal(probe24.codec, "pcm_s24le");
  assert.equal(probe24.sampleRate, 44100);
  assert.ok(isStereoChannels(probe24.channels));
  assert.equal(probe24.sampleFmt, "s32");
  assert.equal(probe24.bits, 24);

  const wav32 = path.join(workDir, "export_32bit.wav");
  runFfmpeg([
    "-y",
    "-hide_banner",
    "-i",
    sourceWav,
    "-af",
    "volume=-6dB,alimiter=limit=0.8913:attack=5:release=80:level=disabled",
    "-c:a",
    "pcm_f32le",
    "-ar",
    "44100",
    "-ac",
    "2",
    wav32
  ]);

  const probe32 = probeStream(wav32);
  assert.equal(probe32.codec, "pcm_f32le");
  assert.equal(probe32.sampleRate, 44100);
  assert.ok(isStereoChannels(probe32.channels));
  assert.equal(probe32.sampleFmt, "flt");
  assert.equal(probe32.bits, 32);

  const probeMp3 = probeStream(previewMp3);
  assert.match(probeMp3.codec, /mp3/i);

  const peak24 = measureMaxVolumeDb(wav24);
  assert.ok(peak24 <= 0, `24-bit export introduced clipping: max_volume=${peak24} dB`);

  console.log("wav export format tests passed");
  console.log(
    JSON.stringify({ wav16: probe16.raw, wav24: probe24.raw, wav32: probe32.raw, preview: probeMp3.raw, peak24Db: peak24 })
  );
} finally {
  rmSync(workDir, { recursive: true, force: true });
}
