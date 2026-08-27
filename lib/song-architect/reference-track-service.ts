import {
  generateReferenceStyleBlueprint,
  ReferenceStyleBlueprintError,
  type ReferenceStyleBlueprint
} from "@/lib/song-architect/reference-style-blueprint";
import {
  resolveSpotifyTrackMetadata,
  SpotifyMetadataError,
  type SpotifyTrackMetadata
} from "@/lib/song-architect/spotify-metadata";
import { parseSpotifyTrackUrl } from "@/lib/song-architect/spotify-url";

export type ReferenceTrackPublicTrack = {
  id: string;
  title: string;
  artists: string[];
  album: string | null;
  artworkUrl: string | null;
  durationMs: number;
  url: string;
};

export type ReferenceTrackSuccess = {
  ok: true;
  track: ReferenceTrackPublicTrack;
  blueprint: ReferenceStyleBlueprint;
};

export type ReferenceTrackFailure = {
  ok: false;
  status: number;
  code: string;
  message: string;
};

export type ReferenceTrackResult = ReferenceTrackSuccess | ReferenceTrackFailure;

export function toPublicSpotifyTrack(track: SpotifyTrackMetadata): ReferenceTrackPublicTrack {
  return {
    id: track.id,
    title: track.title,
    artists: [...track.artists],
    album: track.album ?? null,
    artworkUrl: track.artworkUrl ?? null,
    durationMs: track.durationMs,
    url: track.url
  };
}

function fail(status: number, code: string, message: string): ReferenceTrackFailure {
  return { ok: false, status, code, message };
}

export function serializeReferenceTrackResult(result: ReferenceTrackResult): string {
  return JSON.stringify(result);
}

export async function createReferenceTrackFromUrl(args: {
  url: string;
  fetchImpl?: typeof fetch;
  env?: NodeJS.ProcessEnv;
  completeJson?: (systemText: string, userText: string) => Promise<unknown>;
}): Promise<ReferenceTrackResult> {
  const parsed = parseSpotifyTrackUrl(args.url);
  if (!parsed.ok) {
    return fail(400, parsed.code, parsed.message);
  }

  try {
    const track = await resolveSpotifyTrackMetadata(parsed.trackId, {
      fetchImpl: args.fetchImpl,
      env: args.env
    });
    const blueprint = await generateReferenceStyleBlueprint({
      track,
      completeJson: args.completeJson
    });
    return {
      ok: true,
      track: toPublicSpotifyTrack(track),
      blueprint
    };
  } catch (error) {
    if (error instanceof SpotifyMetadataError) {
      if (error.code === "missing_credentials") {
        return fail(503, "missing_spotify_config", "Spotify is not configured on this server.");
      }
      if (error.code === "not_found") {
        return fail(404, "spotify_not_found", "That Spotify track could not be found.");
      }
      if (error.code === "auth_failed") {
        return fail(503, "spotify_auth_failed", "Spotify authentication failed.");
      }
      if (error.code === "malformed_track_id") {
        return fail(400, "malformed_track_id", error.message);
      }
      return fail(503, "spotify_unavailable", "Spotify metadata is temporarily unavailable.");
    }

    if (error instanceof ReferenceStyleBlueprintError) {
      return fail(
        error.code === "rate_limit" ? 429 : 503,
        "generation_failed",
        "Reference Style Blueprint generation is temporarily unavailable. Please retry."
      );
    }

    return fail(500, "reference_track_failed", "Could not create a Reference Style Blueprint.");
  }
}
