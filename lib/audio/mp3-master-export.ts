import { spawn } from "node:child_process";
import path from "node:path";
import { getFfmpegExecutablePath } from "@/lib/audio/ffmpeg-bin";
import { probeAudioStream } from "@/lib/audio/media-probe";
import {
  findLatestRecordForJob,
  getTempRoot,
  makeId,
  registerExistingFile,
  type TempRecord
} from "@/lib/storage/temp-files";

/** Full-length MP3 master export bitrate (CBR via libmp3lame). */
export const MP3_MASTER_BITRATE = "320k";

export const MP3_MASTER_MIME = "audio/mpeg";

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
      reject(new Error(`ffmpeg spawn error: ${base}`));
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

export function buildMp3MasterDownloadUrl(params: { fileId: string; jobId?: string }): string {
  const qs = new URLSearchParams({
    fileId: params.fileId,
    format: "mp3",
    as: "mastered.mp3",
    dl: "1"
  });
  if (params.jobId) qs.set("jobId", params.jobId);
  return `/api/download?${qs.toString()}`;
}

/**
 * Lazily encodes a full-length MP3 master from an existing finalized WAV.
 * Reuses a cached `mastered_mp3` record for the job when still valid.
 */
export async function ensureMasteredMp3ForJob(params: {
  jobId: string;
  wavSourcePath: string;
  ttlMs?: number;
}): Promise<TempRecord> {
  const cached = await findLatestRecordForJob(params.jobId, "mastered_mp3");
  if (cached) {
    return cached;
  }

  const outPath = path.join(getTempRoot(), `${makeId(`mastered_mp3_${params.jobId}`)}.mp3`);
  await runFfmpeg([
    "-y",
    "-hide_banner",
    "-i",
    params.wavSourcePath,
    "-codec:a",
    "libmp3lame",
    "-b:a",
    MP3_MASTER_BITRATE,
    "-ac",
    "2",
    outPath
  ]);

  const probe = await probeAudioStream(outPath);
  if (!probe.codec_name.includes("mp3") && probe.codec_name !== "mp3") {
    throw new Error(`MP3 master export codec mismatch: expected mp3, got ${probe.codec_name || "unknown"}.`);
  }

  return registerExistingFile({
    filePath: outPath,
    kind: "mastered_mp3",
    mime: MP3_MASTER_MIME,
    jobId: params.jobId,
    ttlMs: params.ttlMs
  });
}
