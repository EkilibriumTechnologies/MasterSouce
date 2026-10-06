import { Buffer } from "node:buffer";
import { getGoogleCloudAccessToken, getGoogleCloudProjectId, isGoogleCloudServiceAccountConfigured } from "@/lib/music-generation/google-auth";

const DEFAULT_MODEL = "lyria-3-pro-preview";
const DEFAULT_TIMEOUT_MS = 210_000;
const MAX_TIMEOUT_MS = 300_000;

export type GeneratedMusic = {
  provider: "lyria";
  model: string;
  interactionId: string | null;
  mimeType: string;
  audio: Buffer;
  description: string | null;
  returnedLyrics: string | null;
};

export class MusicGenerationProviderError extends Error {
  constructor(
    public readonly code:
      | "provider_not_configured"
      | "provider_timeout"
      | "provider_http_error"
      | "provider_empty_audio",
    message: string
  ) {
    super(message);
    this.name = "MusicGenerationProviderError";
  }
}

export function isLyriaConfigured(): boolean {
  return isGoogleCloudServiceAccountConfigured();
}

export async function generateSongWithLyria(prompt: string): Promise<GeneratedMusic> {
  if (!isLyriaConfigured()) {
    throw new MusicGenerationProviderError("provider_not_configured", "Google Lyria is not configured.");
  }

  const projectId = getGoogleCloudProjectId();
  const accessToken = await getGoogleCloudAccessToken();
  const model = process.env.GOOGLE_LYRIA_MODEL?.trim() || DEFAULT_MODEL;
  const configuredTimeout = Number(process.env.GOOGLE_LYRIA_TIMEOUT_MS ?? DEFAULT_TIMEOUT_MS);
  const timeoutMs = Number.isFinite(configuredTimeout)
    ? Math.min(Math.max(configuredTimeout, 15_000), MAX_TIMEOUT_MS)
    : DEFAULT_TIMEOUT_MS;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(
      `https://aiplatform.googleapis.com/v1beta1/projects/${encodeURIComponent(projectId)}/locations/global/interactions`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json; charset=utf-8"
        },
        body: JSON.stringify({
          model,
          input: [{ type: "text", text: prompt }]
        }),
        signal: controller.signal
      }
    );

    const payload = (await response.json().catch(() => ({}))) as {
      id?: string;
      name?: string;
      model?: string;
      error?: { message?: string; status?: string; code?: number };
      outputs?: Array<{
        type?: string;
        text?: string;
        data?: string;
        mime_type?: string;
      }>;
    };

    if (!response.ok) {
      throw new MusicGenerationProviderError(
        "provider_http_error",
        `Lyria request failed (${response.status}): ${payload.error?.message ?? "unknown_error"}`
      );
    }

    const audioOutput = payload.outputs?.find(
      (item) => item.type === "audio" && typeof item.data === "string" && item.data.length > 0
    );
    if (!audioOutput?.data) {
      throw new MusicGenerationProviderError("provider_empty_audio", "Lyria returned no audio.");
    }

    const textOutputs = (payload.outputs ?? [])
      .filter((item) => item.type === "text" && typeof item.text === "string")
      .map((item) => item.text!.trim())
      .filter(Boolean);

    return {
      provider: "lyria",
      model: payload.model?.trim() || model,
      interactionId: payload.id?.trim() || payload.name?.trim() || null,
      mimeType: audioOutput.mime_type?.trim() || "audio/mpeg",
      audio: Buffer.from(audioOutput.data, "base64"),
      returnedLyrics: textOutputs[0] ?? null,
      description: textOutputs[1] ?? null
    };
  } catch (error) {
    if (error instanceof MusicGenerationProviderError) throw error;
    if (error instanceof Error && error.name === "AbortError") {
      throw new MusicGenerationProviderError(
        "provider_timeout",
        `Lyria generation timed out after ${timeoutMs}ms.`
      );
    }
    throw new MusicGenerationProviderError(
      "provider_http_error",
      error instanceof Error ? error.message : "Unknown Lyria error."
    );
  } finally {
    clearTimeout(timer);
  }
}
