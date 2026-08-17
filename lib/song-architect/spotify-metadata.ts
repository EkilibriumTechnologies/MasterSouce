import { isSpotifyTrackId } from "@/lib/song-architect/spotify-url";

export type SpotifyTrackMetadata = {
  id: string;
  title: string;
  artists: string[];
  album?: string;
  artworkUrl?: string;
  durationMs: number;
  url: string;
};

export type SpotifyMetadataErrorCode =
  | "missing_credentials"
  | "auth_failed"
  | "not_found"
  | "http_error"
  | "invalid_response"
  | "malformed_track_id";

export class SpotifyMetadataError extends Error {
  constructor(
    public readonly code: SpotifyMetadataErrorCode,
    message: string
  ) {
    super(message);
    this.name = "SpotifyMetadataError";
  }
}

type SpotifyCredentials = {
  clientId: string;
  clientSecret: string;
};

type FetchLike = typeof fetch;

type TokenCache = {
  accessToken: string;
  expiresAtMs: number;
};

const SPOTIFY_TOKEN_URL = "https://accounts.spotify.com/api/token";
const SPOTIFY_TRACK_URL = "https://api.spotify.com/v1/tracks";
const TOKEN_EXPIRY_SKEW_MS = 30_000;

let tokenCache: TokenCache | null = null;

export function readSpotifyClientCredentials(
  env: NodeJS.ProcessEnv = process.env
): SpotifyCredentials | null {
  const clientId = env.SPOTIFY_CLIENT_ID?.trim();
  const clientSecret = env.SPOTIFY_CLIENT_SECRET?.trim();
  if (!clientId || !clientSecret) return null;
  return { clientId, clientSecret };
}

function pickArtworkUrl(images: unknown): string | undefined {
  if (!Array.isArray(images)) return undefined;
  const usable = images
    .map((image) => {
      if (!image || typeof image !== "object") return null;
      const url = typeof (image as { url?: unknown }).url === "string" ? (image as { url: string }).url.trim() : "";
      const width = typeof (image as { width?: unknown }).width === "number" ? (image as { width: number }).width : 0;
      if (!url) return null;
      return { url, width };
    })
    .filter((image): image is { url: string; width: number } => Boolean(image));
  if (usable.length === 0) return undefined;
  const preferred = usable.find((image) => image.width >= 200 && image.width <= 400);
  return (preferred ?? usable[0]).url;
}

function normalizeTrackPayload(payload: Record<string, unknown>, trackId: string): SpotifyTrackMetadata {
  const title = typeof payload.name === "string" ? payload.name.trim() : "";
  const artistsSource = Array.isArray(payload.artists) ? payload.artists : [];
  const artists = artistsSource
    .map((artist) => {
      if (!artist || typeof artist !== "object") return "";
      return typeof (artist as { name?: unknown }).name === "string" ? (artist as { name: string }).name.trim() : "";
    })
    .filter(Boolean);
  const albumSource = payload.album && typeof payload.album === "object" ? (payload.album as Record<string, unknown>) : null;
  const album = typeof albumSource?.name === "string" ? albumSource.name.trim() : undefined;
  const durationMs = typeof payload.duration_ms === "number" && Number.isFinite(payload.duration_ms) ? Math.max(0, Math.round(payload.duration_ms)) : 0;
  const external = payload.external_urls && typeof payload.external_urls === "object" ? (payload.external_urls as { spotify?: unknown }) : null;
  const url =
    typeof external?.spotify === "string" && external.spotify.trim()
      ? external.spotify.trim()
      : `https://open.spotify.com/track/${trackId}`;
  const id = typeof payload.id === "string" && isSpotifyTrackId(payload.id) ? payload.id : trackId;

  if (!title || artists.length === 0) {
    throw new SpotifyMetadataError("invalid_response", "Spotify returned incomplete track metadata.");
  }

  return {
    id,
    title,
    artists,
    ...(album ? { album } : {}),
    ...(pickArtworkUrl(albumSource?.images) ? { artworkUrl: pickArtworkUrl(albumSource?.images) } : {}),
    durationMs,
    url
  };
}

async function readErrorPreview(response: Response): Promise<string> {
  const text = await response.text().catch(() => "");
  return text.slice(0, 400);
}

async function requestClientCredentialsToken(args: {
  credentials: SpotifyCredentials;
  fetchImpl: FetchLike;
}): Promise<string> {
  const now = Date.now();
  if (tokenCache && tokenCache.expiresAtMs - TOKEN_EXPIRY_SKEW_MS > now) {
    return tokenCache.accessToken;
  }

  const basic = Buffer.from(`${args.credentials.clientId}:${args.credentials.clientSecret}`).toString("base64");
  const response = await args.fetchImpl(SPOTIFY_TOKEN_URL, {
    method: "POST",
    headers: {
      Authorization: `Basic ${basic}`,
      "Content-Type": "application/x-www-form-urlencoded"
    },
    body: "grant_type=client_credentials"
  });

  if (!response.ok) {
    await readErrorPreview(response);
    throw new SpotifyMetadataError(
      response.status === 401 || response.status === 403 ? "auth_failed" : "http_error",
      "Spotify authentication failed."
    );
  }

  const payload = (await response.json()) as { access_token?: unknown; expires_in?: unknown };
  const accessToken = typeof payload.access_token === "string" ? payload.access_token.trim() : "";
  const expiresIn = typeof payload.expires_in === "number" && Number.isFinite(payload.expires_in) ? payload.expires_in : 3600;
  if (!accessToken) {
    throw new SpotifyMetadataError("auth_failed", "Spotify authentication failed.");
  }

  tokenCache = {
    accessToken,
    expiresAtMs: now + Math.max(30, expiresIn) * 1000
  };
  return accessToken;
}

export function resetSpotifyTokenCacheForTests(): void {
  tokenCache = null;
}

export async function resolveSpotifyTrackMetadata(
  trackId: string,
  options?: {
    fetchImpl?: FetchLike;
    credentials?: SpotifyCredentials | null;
    env?: NodeJS.ProcessEnv;
  }
): Promise<SpotifyTrackMetadata> {
  if (!isSpotifyTrackId(trackId)) {
    throw new SpotifyMetadataError("malformed_track_id", "That Spotify track ID is not valid.");
  }

  const credentials = options?.credentials !== undefined ? options.credentials : readSpotifyClientCredentials(options?.env);
  if (!credentials) {
    throw new SpotifyMetadataError(
      "missing_credentials",
      "Spotify is not configured. Set SPOTIFY_CLIENT_ID and SPOTIFY_CLIENT_SECRET."
    );
  }

  const fetchImpl = options?.fetchImpl ?? fetch;
  const accessToken = await requestClientCredentialsToken({ credentials, fetchImpl });
  const response = await fetchImpl(`${SPOTIFY_TRACK_URL}/${encodeURIComponent(trackId)}`, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${accessToken}`
    }
  });

  if (response.status === 404) {
    throw new SpotifyMetadataError("not_found", "That Spotify track could not be found.");
  }
  if (response.status === 401 || response.status === 403) {
    tokenCache = null;
    throw new SpotifyMetadataError("auth_failed", "Spotify authentication failed.");
  }
  if (!response.ok) {
    await readErrorPreview(response);
    throw new SpotifyMetadataError("http_error", "Spotify metadata is temporarily unavailable.");
  }

  const payload = (await response.json()) as Record<string, unknown>;
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    throw new SpotifyMetadataError("invalid_response", "Spotify returned incomplete track metadata.");
  }
  return normalizeTrackPayload(payload, trackId);
}
