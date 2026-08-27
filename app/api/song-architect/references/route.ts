import { NextRequest, NextResponse } from "next/server";
import { attachSessionCookieIfNeeded, prepareSessionForRequest } from "@/lib/identity/session-cookie";
import { consumeRateLimit, getClientIp, hashIdentifier, logAbuseGuard, tooManyAttemptsResponse } from "@/lib/security/abuse-guard";
import { resolveSavedReferenceOwner } from "@/lib/song-architect/saved-reference-access";
import { listOwnedReferences, saveOwnedReference } from "@/lib/song-architect/saved-reference-service";

function jsonError(status: number, code: string, message: string): NextResponse {
  return NextResponse.json({ ok: false, error: code, code, message }, { status });
}

async function requireOwner(request: NextRequest, sessionId: string) {
  const access = await resolveSavedReferenceOwner({ request, sessionId });
  if (!access.ok) {
    return { ok: false as const, status: 403 as const, code: access.code, message: access.message };
  }
  return { ok: true as const, normalizedEmail: access.normalizedEmail };
}

export async function GET(request: NextRequest) {
  const sessionPrep = prepareSessionForRequest(request);
  const clientIp = getClientIp(request);
  const rate = consumeRateLimit({
    bucket: "song_architect_references_list_ip",
    key: clientIp,
    limit: 60,
    windowMs: 60 * 60 * 1000
  });
  if (!rate.allowed) {
    logAbuseGuard("rate_limited", {
      endpoint: "/api/song-architect/references",
      bucket: "song_architect_references_list_ip",
      ipHash: hashIdentifier(clientIp),
      retryAfterSec: rate.retryAfterSec
    });
    const res = tooManyAttemptsResponse(rate.retryAfterSec);
    attachSessionCookieIfNeeded(res, sessionPrep);
    return res;
  }

  try {
    const owner = await requireOwner(request, sessionPrep.sessionId);
    if (!owner.ok) {
      if (owner.code === "email_verification_required") {
        logAbuseGuard("unverified_song_architect_output_blocked", {
          endpoint: "/api/song-architect/references",
          ipHash: hashIdentifier(clientIp)
        });
      }
      const res = jsonError(owner.status, owner.code, owner.message);
      attachSessionCookieIfNeeded(res, sessionPrep);
      return res;
    }

    const listed = await listOwnedReferences({ trustedEmail: owner.normalizedEmail });
    const res = NextResponse.json({ ok: true, references: listed.references }, { status: 200 });
    attachSessionCookieIfNeeded(res, sessionPrep);
    return res;
  } catch (error) {
    if (process.env.NODE_ENV !== "production") {
      console.error("[song-architect] references_list_failed", error instanceof Error ? error.message : error);
    }
    const res = jsonError(500, "references_list_failed", "Could not load saved references.");
    attachSessionCookieIfNeeded(res, sessionPrep);
    return res;
  }
}

export async function POST(request: NextRequest) {
  const sessionPrep = prepareSessionForRequest(request);
  const clientIp = getClientIp(request);
  const rate = consumeRateLimit({
    bucket: "song_architect_references_save_ip",
    key: clientIp,
    limit: 30,
    windowMs: 60 * 60 * 1000
  });
  if (!rate.allowed) {
    logAbuseGuard("rate_limited", {
      endpoint: "/api/song-architect/references",
      bucket: "song_architect_references_save_ip",
      ipHash: hashIdentifier(clientIp),
      retryAfterSec: rate.retryAfterSec
    });
    const res = tooManyAttemptsResponse(rate.retryAfterSec);
    attachSessionCookieIfNeeded(res, sessionPrep);
    return res;
  }

  try {
    const owner = await requireOwner(request, sessionPrep.sessionId);
    if (!owner.ok) {
      if (owner.code === "email_verification_required") {
        logAbuseGuard("unverified_song_architect_output_blocked", {
          endpoint: "/api/song-architect/references",
          ipHash: hashIdentifier(clientIp)
        });
      }
      const res = jsonError(owner.status, owner.code, owner.message);
      attachSessionCookieIfNeeded(res, sessionPrep);
      return res;
    }

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      const res = jsonError(400, "invalid_json", "Expected JSON body.");
      attachSessionCookieIfNeeded(res, sessionPrep);
      return res;
    }

    const saved = await saveOwnedReference({
      trustedEmail: owner.normalizedEmail,
      body
    });
    if (!saved.ok) {
      const res = jsonError(saved.status, saved.code, saved.message);
      attachSessionCookieIfNeeded(res, sessionPrep);
      return res;
    }

    const res = NextResponse.json(
      {
        ok: true,
        id: saved.id,
        reference: saved.reference,
        reused: saved.reused
      },
      { status: saved.reused ? 200 : 201 }
    );
    attachSessionCookieIfNeeded(res, sessionPrep);
    return res;
  } catch (error) {
    if (process.env.NODE_ENV !== "production") {
      console.error("[song-architect] references_save_failed", error instanceof Error ? error.message : error);
    }
    const res = jsonError(500, "references_save_failed", "Could not save that reference.");
    attachSessionCookieIfNeeded(res, sessionPrep);
    return res;
  }
}
