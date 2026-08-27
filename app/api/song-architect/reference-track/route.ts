import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { attachSessionCookieIfNeeded, prepareSessionForRequest } from "@/lib/identity/session-cookie";
import { consumeRateLimit, getClientIp, hashIdentifier, logAbuseGuard, tooManyAttemptsResponse } from "@/lib/security/abuse-guard";
import { createReferenceTrackFromUrl } from "@/lib/song-architect/reference-track-service";

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

    const result = await createReferenceTrackFromUrl({ url: parsed.data.url });
    if (!result.ok) {
      const res = jsonError(result.status, result.code, result.message);
      attachSessionCookieIfNeeded(res, sessionPrep);
      return res;
    }

    const res = NextResponse.json(
      {
        ok: true,
        track: result.track,
        blueprint: result.blueprint
      },
      { status: 200 }
    );
    attachSessionCookieIfNeeded(res, sessionPrep);
    return res;
  } catch (error) {
    if (process.env.NODE_ENV !== "production") {
      console.error("[song-architect] reference_track_failed", error instanceof Error ? error.message : error);
    }
    const res = jsonError(500, "reference_track_failed", "Could not create a Reference Style Blueprint.");
    attachSessionCookieIfNeeded(res, sessionPrep);
    return res;
  }
}
