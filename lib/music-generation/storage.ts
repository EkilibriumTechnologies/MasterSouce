import { randomUUID } from "node:crypto";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

const DEFAULT_BUCKET = "generated-songs";

export function getGeneratedAudioBucket(): string {
  return process.env.MASTERSAUCE_GENERATED_AUDIO_BUCKET?.trim() || DEFAULT_BUCKET;
}

function extensionForMimeType(mimeType: string): string {
  if (mimeType.includes("wav")) return "wav";
  if (mimeType.includes("ogg")) return "ogg";
  if (mimeType.includes("mp4") || mimeType.includes("m4a")) return "m4a";
  return "mp3";
}

export async function storeGeneratedSongAudio(input: {
  userId: string;
  projectId: string;
  audio: Buffer;
  mimeType: string;
}): Promise<{ bucket: string; path: string }> {
  const bucket = getGeneratedAudioBucket();
  const extension = extensionForMimeType(input.mimeType);
  const path = `${input.userId}/${input.projectId}/${Date.now()}-${randomUUID()}.${extension}`;
  const supabase = getSupabaseAdmin();
  const { error } = await supabase.storage.from(bucket).upload(path, input.audio, {
    contentType: input.mimeType,
    cacheControl: "3600",
    upsert: false
  });
  if (error) {
    throw new Error(`Generated song storage failed: ${error.message}`);
  }
  return { bucket, path };
}

export async function createGeneratedSongSignedUrl(input: {
  bucket: string;
  path: string;
  expiresInSeconds?: number;
}): Promise<string> {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase.storage
    .from(input.bucket)
    .createSignedUrl(input.path, input.expiresInSeconds ?? 600);
  if (error || !data?.signedUrl) {
    throw new Error(`Generated song signed URL failed: ${error?.message ?? "no URL returned"}`);
  }
  return data.signedUrl;
}
