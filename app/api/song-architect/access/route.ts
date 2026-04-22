import { NextRequest, NextResponse } from "next/server";
import { attachSessionCookieIfNeeded, prepareSessionForRequest } from "@/lib/identity/session-cookie";
import { consumeRateLimit, getClientIp, hashIdentifier, logAbuseGuard, tooManyAttemptsResponse } from "@/lib/security/abuse-guard";
import { attachTrustedEmailAccessState } from "@/lib/security/verified-email-state";
import { resolveSongArchitectVerifiedContext } from "@/lib/song-architect/access";

export async function GET(request: NextRequest) {
  const sessionPrep = prepareSessionForRequest(request);
  const clientIp = getClientIp(request);
  const accessRate = consumeRateLimit({
    bucket: "song_architect_access_ip",
    key: clientIp,
    limit: 10,
    windowMs: 60 * 60 * 1000
  });
  if (!accessRate.allowed) {
    logAbuseGuard("rate_limited", {
      endpoint: "/api/song-architect/access",
      bucket: "song_architect_access_ip",
      ipHash: hashIdentifier(clientIp),
      retryAfterSec: accessRate.retryAfterSec
    });
    const res = tooManyAttemptsResponse(accessRate.retryAfterSec);
    attachSessionCookieIfNeeded(res, sessionPrep);
    return res;
  }
  try {
    const access = await resolveSongArchitectVerifiedContext({
      request,
      sessionId: sessionPrep.sessionId
    });
    if (!access.ok) {
      if (access.code === "email_not_allowed") {
        const blockedAttemptsRate = consumeRateLimit({
          bucket: "blocked_email_attempts_ip",
          key: clientIp,
          limit: 10,
          windowMs: 60 * 60 * 1000
        });
        if (!blockedAttemptsRate.allowed) {
          logAbuseGuard("rate_limited", {
            endpoint: "/api/song-architect/access",
            bucket: "blocked_email_attempts_ip",
            ipHash: hashIdentifier(clientIp),
            retryAfterSec: blockedAttemptsRate.retryAfterSec
          });
          const limited = tooManyAttemptsResponse(blockedAttemptsRate.retryAfterSec);
          attachSessionCookieIfNeeded(limited, sessionPrep);
          return limited;
        }
      }
      const res = NextResponse.json(
        {
          ok: false,
          code: access.code,
          message: access.message
        },
        { status: 403 }
      );
      attachSessionCookieIfNeeded(res, sessionPrep);
      return res;
    }

    const res = NextResponse.json({
      ok: true,
      usage: access.usage
    });
    attachTrustedEmailAccessState(res, access.normalizedEmail);
    attachSessionCookieIfNeeded(res, sessionPrep);
    return res;
  } catch (error) {
    const detail = error instanceof Error ? error.message : "Unknown Song Architect access error";
    console.error("[song-architect] access_failed", { detail });
    const res = NextResponse.json(
      {
        ok: false,
        code: "song_architect_access_failed",
        message: "Unable to confirm Song Architect email access right now."
      },
      { status: 500 }
    );
    attachSessionCookieIfNeeded(res, sessionPrep);
    return res;
  }
}
