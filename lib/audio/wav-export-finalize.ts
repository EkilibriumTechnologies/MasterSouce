import { promises as fs } from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";
import { getFfmpegExecutablePath } from "@/lib/audio/ffmpeg-bin";
import { probeAudioStream } from "@/lib/audio/media-probe";
import { validateExportedWav } from "@/lib/audio/wav-export-validation";
import {
  resolveCodecForQuality,
  WAV_EXPORT_CHANNELS,
  WAV_EXPORT_SAMPLE_RATE,
  type WavOutputCodec
} from "@/lib/audio/wav-export-codec";
import { markJobExportCodecVerified } from "@/lib/jobs/job-export-verify";
import { getEntitlementsForUser } from "@/lib/subscriptions/entitlements";
import type { EntitlementEmailSource } from "@/lib/subscriptions/resolve-entitlement-billing-context";
import { getTempRoot, makeId } from "@/lib/storage/temp-files";
import type { UserProfile } from "@/lib/users/user-profile";

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

async function transcodeWavToCodec(sourcePath: string, targetCodec: WavOutputCodec): Promise<string> {
  await fs.mkdir(getTempRoot(), { recursive: true });
  const tempOut = path.join(getTempRoot(), `${makeId("wav_finalize")}.wav`);
  await runFfmpeg([
    "-y",
    "-hide_banner",
    "-i",
    sourcePath,
    "-c:a",
    targetCodec,
    "-ar",
    String(WAV_EXPORT_SAMPLE_RATE),
    "-ac",
    String(WAV_EXPORT_CHANNELS),
    tempOut
  ]);
  await validateExportedWav(tempOut, { codec: targetCodec });
  return tempOut;
}

export type FinalizeMasteredWavResult = {
  outputCodec: WavOutputCodec;
  finalized: boolean;
  sourceCodec: string | null;
};

/**
 * Muxes a deferred float archive (or re-validates an already-delivered codec) to the
 * server-resolved plan codec using the unlock / billing email — not client plan hints.
 */
export async function finalizeMasteredWavDelivery(params: {
  jobId: string;
  sourcePath: string;
  normalizedEmail: string;
  endpoint: "/api/master" | "/api/master-ai" | "/api/capture-email";
  user: UserProfile;
  emailSource?: EntitlementEmailSource;
}): Promise<FinalizeMasteredWavResult> {
  const entitlements = await getEntitlementsForUser(params.user, {
    normalizedEmail: params.normalizedEmail
  });
  const targetCodec = resolveCodecForQuality(entitlements.quality);
  const probe = await probeAudioStream(params.sourcePath);
  const sourceCodec = probe.codec_name;

  if (sourceCodec === targetCodec) {
    await markJobExportCodecVerified(params.jobId, targetCodec);
    return { outputCodec: targetCodec, finalized: false, sourceCodec };
  }

  if (sourceCodec !== "pcm_f32le") {
    console.warn(
      JSON.stringify({
        scope: "wav_export_finalize",
        event: "skipped_non_archive_source",
        jobId: params.jobId,
        endpoint: params.endpoint,
        sourceCodec,
        targetCodec,
        planId: entitlements.planId,
        normalizedEmailPresent: Boolean(params.normalizedEmail)
      })
    );
    return {
      outputCodec: (sourceCodec as WavOutputCodec | null) ?? targetCodec,
      finalized: false,
      sourceCodec
    };
  }

  const tempOut = await transcodeWavToCodec(params.sourcePath, targetCodec);
  await fs.rename(tempOut, params.sourcePath);

  await markJobExportCodecVerified(params.jobId, targetCodec);

  console.log(
    JSON.stringify({
      scope: "wav_export_finalize",
      event: "delivery_codec_applied",
      jobId: params.jobId,
      endpoint: params.endpoint,
      sourceCodec,
      outputCodec: targetCodec,
      planId: entitlements.planId,
      outputQuality: entitlements.quality
    })
  );

  return { outputCodec: targetCodec, finalized: true, sourceCodec };
}
