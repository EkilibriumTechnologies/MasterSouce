export type SpotifyTrackUrlErrorCode =
  | "malformed_url"
  | "unsupported_spotify_url"
  | "malformed_track_id";

export type SpotifyTrackUrlParseResult =
  | { ok: true; trackId: string }
  | { ok: false; code: SpotifyTrackUrlErrorCode; message: string };

const SPOTIFY_TRACK_ID_PATTERN = /^[0-9A-Za-z]{22}$/;
const UNSUPPORTED_RESOURCE_TYPES = new Set([
  "playlist",
  "album",
  "artist",
  "episode",
  "show",
  "user",
  "collection",
  "search",
  "genre",
  "concert",
  "audiobook"
]);

export function isSpotifyTrackId(value: string): boolean {
  return SPOTIFY_TRACK_ID_PATTERN.test(value.trim());
}

function unsupportedMessage(resourceType: string): string {
  return `Spotify ${resourceType} URLs are not supported. Paste a track URL instead.`;
}

function parseSpotifyUri(trimmed: string): SpotifyTrackUrlParseResult | null {
  const uriMatch = /^spotify:([a-z]+):([0-9A-Za-z]+)$/i.exec(trimmed);
  if (!uriMatch) return null;
  const resourceType = uriMatch[1].toLowerCase();
  const resourceId = uriMatch[2];
  if (resourceType !== "track") {
    return {
      ok: false,
      code: "unsupported_spotify_url",
      message: unsupportedMessage(resourceType)
    };
  }
  if (!isSpotifyTrackId(resourceId)) {
    return {
      ok: false,
      code: "malformed_track_id",
      message: "That Spotify track ID is not valid."
    };
  }
  return { ok: true, trackId: resourceId };
}

function hostLooksLikeSpotify(hostname: string): boolean {
  const host = hostname.toLowerCase();
  return (
    host === "open.spotify.com" ||
    host === "play.spotify.com" ||
    host === "spotify.link" ||
    host.endsWith(".spotify.com")
  );
}

const PATH_PREFIXES = new Set(["embed", "open"]);

function resourceFromPath(pathname: string): { type: string; id: string } | null {
  const parts = pathname
    .split("/")
    .map((part) => part.trim())
    .filter(Boolean);
  if (parts.length === 0) return null;

  let index = 0;
  while (index < parts.length) {
    const part = parts[index].toLowerCase();
    if (part.startsWith("intl-") || PATH_PREFIXES.has(part)) {
      index += 1;
      continue;
    }
    break;
  }
  if (index >= parts.length) return null;
  const type = parts[index]?.toLowerCase();
  const id = parts[index + 1] ?? "";
  if (!type) return null;
  return { type, id };
}

export function parseSpotifyTrackUrl(input: string | null | undefined): SpotifyTrackUrlParseResult {
  if (typeof input !== "string") {
    return { ok: false, code: "malformed_url", message: "Paste a Spotify track URL." };
  }

  const trimmed = input.trim();
  if (!trimmed) {
    return { ok: false, code: "malformed_url", message: "Paste a Spotify track URL." };
  }

  if (isSpotifyTrackId(trimmed)) {
    return { ok: true, trackId: trimmed };
  }

  const uriResult = parseSpotifyUri(trimmed);
  if (uriResult) return uriResult;

  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    return { ok: false, code: "malformed_url", message: "That Spotify URL is not valid." };
  }

  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    return { ok: false, code: "malformed_url", message: "That Spotify URL is not valid." };
  }
  if (!hostLooksLikeSpotify(parsed.hostname)) {
    return { ok: false, code: "malformed_url", message: "That Spotify URL is not valid." };
  }

  const resource = resourceFromPath(parsed.pathname);
  if (!resource) {
    return { ok: false, code: "malformed_url", message: "That Spotify URL is not valid." };
  }

  if (UNSUPPORTED_RESOURCE_TYPES.has(resource.type) || resource.type !== "track") {
    return {
      ok: false,
      code: "unsupported_spotify_url",
      message: unsupportedMessage(resource.type || "resource")
    };
  }

  if (!resource.id) {
    return { ok: false, code: "malformed_track_id", message: "That Spotify track ID is not valid." };
  }
  if (!isSpotifyTrackId(resource.id)) {
    return { ok: false, code: "malformed_track_id", message: "That Spotify track ID is not valid." };
  }

  return { ok: true, trackId: resource.id };
}
