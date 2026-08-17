import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { attachSessionCookieIfNeeded, prepareSessionForRequest } from "@/lib/identity/session-cookie";
import { consumeRateLimit, getClientIp, hashIdentifier, logAbuseGuard, tooManyAttemptsResponse } from "@/lib/security/abuse-guard";
import {
  generateReferenceStyleBlueprint,
  ReferenceStyleBlueprintError
} from "@/lib/song-architect/reference-style-blueprint";
import { resolveSpotifyTrackMetadata, SpotifyMetadataError } from "@/lib/song-architect/spotify-metadata";
import { parseSpotifyTrackUrl } from "@/lib/song-architect/spotify-url";

const RequestSchema = z.object({
  url: z.string().trim().min(1).max(500)
});

function jsonError(
  status: number,
  code: string,
  message: string
): NextResponse {
  return NextResponse.json({ ok: false, error: code, code, message }, { status });
}

export async function POST(request: NextRequest) {
  const sessionPrep = prepareSessionForRequest(request);
  const clientIp = getClientIp(request);
  const rate = consumeRateLimit({
    bucket: "song_architect_reference_track_ip",
    key: clientIp,
    limit: 20,
    windowMs: 60 * 60 * 1000
  });
  if (!rate.allowed) {
    logAbuseGuard("rate_limited", {
      endpoint: "/api/song-architect/reference-track",
      bucket: "song_architect_reference_track_ip",
      ipHash: hashIdentifier(clientIp),
      retryAfterSec: rate.retryAfterSec
    });
    const res = tooManyAttemptsResponse(rate.retryAfterSec);
    attachSessionCookieIfNeeded(res, sessionPrep);
    return res;
  }

  try {
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      const res = jsonError(400, "invalid_json", "Expected JSON body.");
      attachSessionCookieIfNeeded(res, sessionPrep);
      return res;
    }

    const parsed = RequestSchema.safeParse(body);
    if (!parsed.success) {
      const res = jsonError(400, "invalid_payload", "A Spotify track URL is required.");
      attachSessionCookieIfNeeded(res, sessionPrep);
      return res;
    }

    const urlResult = parseSpotifyTrackUrl(parsed.data.url);
    if (!urlResult.ok) {
      const status = 400;
      const res = jsonError(status, urlResult.code, urlResult.message);
      attachSessionCookieIfNeeded(res, sessionPrep);
      return res;
    }

    const track = await resolveSpotifyTrackMetadata(urlResult.trackId);
    const blueprint = await generateReferenceStyleBlueprint({ track });
    const res = NextResponse.json(
      {
        ok: true,
        track: {
          id: track.id,
          title: track.title,
          artists: track.artists,
          album: track.album ?? null,
          artworkUrl: track.artworkUrl ?? null,
          durationMs: track.durationMs,
          url: track.url
        },
        blueprint
      },
      { status: 200 }
    );
    attachSessionCookieIfNeeded(res, sessionPrep);
    return res;
  } catch (error) {
    if (error instanceof SpotifyMetadataError) {
      const mapped =
        error.code === "missing_credentials"
          ? jsonError(503, "missing_spotify_config", "Spotify is not configured on this server.")
          : error.code === "not_found"
            ? jsonError(404, "spotify_not_found", "That Spotify track could not be found.")
            : error.code === "auth_failed"
              ? jsonError(503, "spotify_auth_failed", "Spotify authentication failed.")
              : error.code === "malformed_track_id"
                ? jsonError(400, "malformed_track_id", error.message)
                : jsonError(503, "spotify_unavailable", "Spotify metadata is temporarily unavailable.");
      attachSessionCookieIfNeeded(mapped, sessionPrep);
      return mapped;
    }

    if (error instanceof ReferenceStyleBlueprintError) {
      const mapped =
        error.code === "rate_limit"
          ? jsonError(429, "generation_failed", "Reference Style Blueprint generation is temporarily unavailable. Please retry.")
          : jsonError(503, "generation_failed", "Reference Style Blueprint generation is temporarily unavailable. Please retry.");
      attachSessionCookieIfNeeded(mapped, sessionPrep);
      return mapped;
    }

    if (process.env.NODE_ENV !== "production") {
      console.error("[song-architect] reference_track_failed", error instanceof Error ? error.message : error);
    }
    const res = jsonError(500, "reference_track_failed", "Could not create a Reference Style Blueprint.");
    attachSessionCookieIfNeeded(res, sessionPrep);
    return res;
  }
}
