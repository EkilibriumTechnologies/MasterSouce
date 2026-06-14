import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";
import { getFfmpegExecutablePath } from "@/lib/audio/ffmpeg-bin";

export type MediaStreamProbe = {
  codec_name: string;
  bits_per_sample: number | null;
  bits_per_raw_sample: number | null;
  sample_rate: number;
  channels: number;
  sample_fmt: string | null;
};

function runProbeCommand(
  executable: string,
  args: string[]
): Promise<{ stdout: string; stderr: string; exitCode: number | null }> {
  return new Promise((resolve, reject) => {
    const child = spawn(executable, args, { stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => {
      stdout += String(chunk);
    });
    child.stderr.on("data", (chunk) => {
      stderr += String(chunk);
    });
    child.on("error", (err) => {
      reject(err);
    });
    child.on("close", (code) => {
      resolve({ stdout, stderr, exitCode: code });
    });
  });
}

function resolveFfprobeExecutablePath(): string | null {
  const envProbe = process.env.FFPROBE_BIN?.trim();
  if (envProbe) {
    if (existsSync(envProbe) || !envProbe.includes("/") && !envProbe.includes("\\")) {
      return envProbe;
    }
  }

  const ffmpegPath = getFfmpegExecutablePath();
  const sibling = path.join(
    path.dirname(ffmpegPath),
    path.basename(ffmpegPath).replace(/^ffmpeg/i, "ffprobe")
  );
  if (existsSync(sibling)) {
    return sibling;
  }

  return "ffprobe";
}

function parseFfprobeDefaultOutput(text: string): Partial<MediaStreamProbe> {
  const lines = text.split(/\r?\n/);
  const out: Partial<MediaStreamProbe> = {};
  for (const line of lines) {
    const idx = line.indexOf("=");
    if (idx === -1) continue;
    const key = line.slice(0, idx).trim();
    const value = line.slice(idx + 1).trim();
    if (key === "codec_name") out.codec_name = value;
    if (key === "sample_fmt") out.sample_fmt = value || null;
    if (key === "sample_rate") out.sample_rate = Number(value);
    if (key === "channels") out.channels = Number(value);
    if (key === "bits_per_sample") out.bits_per_sample = value ? Number(value) : null;
    if (key === "bits_per_raw_sample") out.bits_per_raw_sample = value ? Number(value) : null;
  }
  return out;
}

function parseFfmpegInputStreamLine(stderr: string): Partial<MediaStreamProbe> | null {
  const match = stderr.match(
    /Stream\s+#\d+:\d+(?:\([^)]+\))?:\s*Audio:\s*([^\s,]+)[^,]*,\s*(\d+)\s*Hz,\s*([^,]+)(?:,\s*([^\s,]+))?(?:,\s*[^,]*\((\d+)\s*bit\))?/i
  );
  if (!match) return null;

  const codec_name = match[1]?.trim() ?? "";
  const sample_rate = Number(match[2]);
  const channelToken = match[3]?.trim().toLowerCase() ?? "";
  const sample_fmt = match[4]?.trim() ?? null;
  const bitsFromParen = match[5] ? Number(match[5]) : null;
  const bitsFromCodec =
    codec_name === "pcm_s24le" ? 24 : codec_name === "pcm_s16le" ? 16 : codec_name === "pcm_f32le" ? 32 : null;
  const bitsFromSampleFmt =
    sample_fmt === "s16"
      ? 16
      : sample_fmt === "s32"
        ? bitsFromParen ?? 24
        : sample_fmt === "flt"
          ? 32
          : null;
  const resolvedBits = bitsFromParen ?? bitsFromSampleFmt ?? bitsFromCodec;

  let channels = 0;
  if (channelToken.includes("mono")) channels = 1;
  else if (channelToken.includes("stereo")) channels = 2;
  else {
    const numeric = Number(channelToken.replace(/[^0-9]/g, ""));
    channels = Number.isFinite(numeric) && numeric > 0 ? numeric : 0;
  }

  return {
    codec_name,
    sample_rate: Number.isFinite(sample_rate) ? sample_rate : undefined,
    channels: channels > 0 ? channels : undefined,
    sample_fmt,
    bits_per_sample: resolvedBits,
    bits_per_raw_sample: resolvedBits
  };
}

async function probeWithFfprobe(filePath: string): Promise<MediaStreamProbe | null> {
  const ffprobeBin = resolveFfprobeExecutablePath();
  if (!ffprobeBin) return null;

  try {
    const result = await runProbeCommand(ffprobeBin, [
      "-v",
      "error",
      "-show_entries",
      "stream=codec_name,bits_per_sample,bits_per_raw_sample,sample_rate,channels,sample_fmt",
      "-select_streams",
      "a:0",
      "-of",
      "default=nw=1",
      filePath
    ]);
    if (result.exitCode !== 0) return null;
    const parsed = parseFfprobeDefaultOutput(result.stdout);
    if (!parsed.codec_name || !parsed.sample_rate || !parsed.channels) return null;
    return {
      codec_name: parsed.codec_name,
      bits_per_sample: parsed.bits_per_sample ?? null,
      bits_per_raw_sample: parsed.bits_per_raw_sample ?? null,
      sample_rate: parsed.sample_rate,
      channels: parsed.channels,
      sample_fmt: parsed.sample_fmt ?? null
    };
  } catch {
    return null;
  }
}

async function probeWithFfmpeg(filePath: string): Promise<MediaStreamProbe> {
  const ffmpegBin = getFfmpegExecutablePath();
  const result = await runProbeCommand(ffmpegBin, ["-hide_banner", "-i", filePath]);
  const parsed = parseFfmpegInputStreamLine(result.stderr);
  if (!parsed?.codec_name || !parsed.sample_rate || !parsed.channels) {
    throw new Error("Unable to probe audio stream from exported WAV.");
  }
  return {
    codec_name: parsed.codec_name,
    bits_per_sample: parsed.bits_per_sample ?? null,
    bits_per_raw_sample: parsed.bits_per_raw_sample ?? null,
    sample_rate: parsed.sample_rate,
    channels: parsed.channels,
    sample_fmt: parsed.sample_fmt ?? null
  };
}

/** Probe the first audio stream using ffprobe when available, otherwise ffmpeg -i parsing. */
export async function probeAudioStream(filePath: string): Promise<MediaStreamProbe> {
  const ffprobeResult = await probeWithFfprobe(filePath);
  if (ffprobeResult) return ffprobeResult;
  return probeWithFfmpeg(filePath);
}
