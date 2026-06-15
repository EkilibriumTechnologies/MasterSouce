import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import ffmpegStatic from "ffmpeg-static";

if (typeof ffmpegStatic !== "string") {
  throw new Error("ffmpeg-static is required for mp3 master export tests.");
}

const FFMPEG = ffmpegStatic;
const workDir = mkdtempSync(path.join(tmpdir(), "mastersouce-mp3-master-test-"));

function runFfmpeg(args) {
  const result = spawnSync(FFMPEG, args, { encoding: "utf8" });
  assert.equal(result.status, 0, `ffmpeg failed: ${result.stderr.slice(-800)}`);
  return result;
}

function probeStream(filePath) {
  const result = spawnSync(FFMPEG, ["-hide_banner", "-i", filePath], { encoding: "utf8" });
  const line = result.stderr.split(/\r?\n/).find((row) => row.includes("Audio:"));
  assert.ok(line, `missing Audio stream line for ${filePath}`);
  const codecMatch = line.match(/Audio:\s*([^\s,]+)/);
  const rateMatch = line.match(/,\s*(\d+)\s*Hz,/);
  const channelMatch = line.match(/Hz,\s*([^,]+),/);
  assert.ok(codecMatch && rateMatch && channelMatch, `unable to parse probe line: ${line}`);
  const durationMatch = result.stderr.match(/Duration:\s*(\d+):(\d+):(\d+(?:\.\d+)?)/);
  let durationSec = null;
  if (durationMatch) {
    durationSec =
      Number(durationMatch[1]) * 3600 + Number(durationMatch[2]) * 60 + Number(durationMatch[3]);
  }
  return {
    codec: codecMatch[1],
    sampleRate: Number(rateMatch[1]),
    channels: channelMatch[1].trim().toLowerCase(),
    durationSec,
    raw: line.trim()
  };
}

function isStereoChannels(token) {
  return token === "stereo" || token === "2 channels" || token === "2";
}

try {
  const sourceWav = path.join(workDir, "source.wav");
  runFfmpeg([
    "-y",
    "-hide_banner",
    "-f",
    "lavfi",
    "-i",
    "sine=frequency=440:duration=45",
    "-c:a",
    "pcm_s16le",
    "-ar",
    "44100",
    "-ac",
    "2",
    sourceWav
  ]);

  const previewMp3 = path.join(workDir, "preview.mp3");
  const fullMp3 = path.join(workDir, "full_master.mp3");

  runFfmpeg([
    "-y",
    "-hide_banner",
    "-i",
    sourceWav,
    "-ss",
    "0",
    "-t",
    "30",
    "-codec:a",
    "libmp3lame",
    "-b:a",
    "192k",
    previewMp3
  ]);

  runFfmpeg([
    "-y",
    "-hide_banner",
    "-i",
    sourceWav,
    "-codec:a",
    "libmp3lame",
    "-b:a",
    "320k",
    fullMp3
  ]);

  const previewProbe = probeStream(previewMp3);
  const fullProbe = probeStream(fullMp3);

  assert.match(previewProbe.codec, /mp3/i, "preview should be mp3");
  assert.match(fullProbe.codec, /mp3/i, "full master should be mp3");
  assert.equal(fullProbe.sampleRate, 44100, "full MP3 keeps 44.1 kHz");
  assert.ok(isStereoChannels(fullProbe.channels), "full MP3 stays stereo");
  assert.ok(fullProbe.durationSec !== null && fullProbe.durationSec > 40, "full MP3 is full-length, not 30s");
  assert.ok(
    previewProbe.durationSec !== null && fullProbe.durationSec !== null && previewProbe.durationSec < fullProbe.durationSec,
    "preview clip should be shorter than full master"
  );

  const bitrateProbe = spawnSync(
    FFMPEG,
    ["-hide_banner", "-i", fullMp3, "-f", "null", "-"],
    { encoding: "utf8" }
  );
  assert.match(bitrateProbe.stderr, /320\s*kb/i, "full MP3 encodes at 320k CBR");

  console.log("mp3 master export tests passed");
  console.log(
    JSON.stringify({
      preview: previewProbe.raw,
      fullMaster: fullProbe.raw,
      fullDurationSec: fullProbe.durationSec
    })
  );
} finally {
  rmSync(workDir, { recursive: true, force: true });
}
