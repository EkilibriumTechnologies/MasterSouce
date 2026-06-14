import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";
import ffmpegStatic from "ffmpeg-static";

function resolveFfprobe() {
  const env = process.env.FFPROBE_BIN?.trim();
  if (env && (existsSync(env) || !/[\\/]/.test(env))) return env;
  if (typeof ffmpegStatic === "string") {
    const sibling = path.join(
      path.dirname(ffmpegStatic),
      path.basename(ffmpegStatic).replace(/^ffmpeg/i, "ffprobe")
    );
    if (existsSync(sibling)) return sibling;
  }
  return "ffprobe";
}

function run(cmd, args) {
  const result = spawnSync(cmd, args, { encoding: "utf8" });
  return {
    status: result.status,
    stdout: result.stdout ?? "",
    stderr: result.stderr ?? ""
  };
}

const filePath = process.argv[2];
if (!filePath) {
  console.error("Usage: node scripts/inspect-wav-format.mjs <file.wav>");
  process.exit(1);
}

const ffprobe = resolveFfprobe();
const ffprobeArgs = [
  "-v",
  "error",
  "-show_entries",
  "stream=codec_name,bits_per_sample,bits_per_raw_sample,sample_rate,channels,sample_fmt",
  "-of",
  "default=nw=1",
  filePath
];

let probe = run(ffprobe, ffprobeArgs);
if (probe.status === 0 && probe.stdout.trim()) {
  process.stdout.write(probe.stdout);
  process.exit(0);
}

if (typeof ffmpegStatic !== "string") {
  console.error("Could not inspect file: ffprobe failed and ffmpeg-static is unavailable.");
  process.exit(1);
}

const ffmpegProbe = run(ffmpegStatic, ["-hide_banner", "-i", filePath]);
const streamLine = ffmpegProbe.stderr
  .split(/\r?\n/)
  .find((line) => line.includes("Audio:"));
if (streamLine) {
  console.log(streamLine.trim());
  process.exit(0);
}

console.error("Could not inspect file. ffprobe stderr:\n", probe.stderr);
console.error("ffmpeg stderr:\n", ffmpegProbe.stderr);
process.exit(1);
