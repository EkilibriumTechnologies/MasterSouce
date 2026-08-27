import { NextRequest, NextResponse } from "next/server";
import { attachSessionCookieIfNeeded, prepareSessionForRequest } from "@/lib/identity/session-cookie";
import { consumeRateLimit, getClientIp, hashIdentifier, logAbuseGuard, tooManyAttemptsResponse } from "@/lib/security/abuse-guard";
import { resolveSavedReferenceOwner } from "@/lib/song-architect/saved-reference-access";
import { deleteOwnedReference } from "@/lib/song-architect/saved-reference-service";

function jsonError(status: number, code: string, message: string): NextResponse {
  return NextResponse.json({ ok: false, error: code, code, message }, { status });
}

export async function DELETE(request: NextRequest, context: { params: { id: string } }) {
  const sessionPrep = prepareSessionForRequest(request);
  const clientIp = getClientIp(request);
  const rate = consumeRateLimit({
    bucket: "song_architect_references_delete_ip",
    key: clientIp,
    limit: 30,
    windowMs: 60 * 60 * 1000
  });
  if (!rate.allowed) {
    logAbuseGuard("rate_limited", {
      endpoint: "/api/song-architect/references",
      bucket: "song_architect_references_delete_ip",
      ipHash: hashIdentifier(clientIp),
      retryAfterSec: rate.retryAfterSec
    });
    const res = tooManyAttemptsResponse(rate.retryAfterSec);
    attachSessionCookieIfNeeded(res, sessionPrep);
    return res;
  }

  try {
    const access = await resolveSavedReferenceOwner({ request, sessionId: sessionPrep.sessionId });
    if (!access.ok) {
      if (access.code === "email_verification_required") {
        logAbuseGuard("unverified_song_architect_output_blocked", {
          endpoint: "/api/song-architect/references",
          ipHash: hashIdentifier(clientIp)
        });
      }
      const res = jsonError(403, access.code, access.message);
      attachSessionCookieIfNeeded(res, sessionPrep);
      return res;
    }

    const deleted = await deleteOwnedReference({
      trustedEmail: access.normalizedEmail,
      id: context.params.id
    });
    if (!deleted.ok) {
      const res = jsonError(deleted.status, deleted.code, deleted.message);
      attachSessionCookieIfNeeded(res, sessionPrep);
      return res;
    }

    const res = NextResponse.json({ ok: true }, { status: 200 });
    attachSessionCookieIfNeeded(res, sessionPrep);
    return res;
  } catch (error) {
    if (process.env.NODE_ENV !== "production") {
      console.error("[song-architect] references_delete_failed", error instanceof Error ? error.message : error);
    }
    const res = jsonError(500, "references_delete_failed", "Could not remove that reference.");
    attachSessionCookieIfNeeded(res, sessionPrep);
    return res;
  }
}
