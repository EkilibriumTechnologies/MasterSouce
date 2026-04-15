import { NextRequest, NextResponse } from "next/server";
import { attachSessionCookieIfNeeded, prepareSessionForRequest } from "@/lib/identity/session-cookie";
import { resolveSongArchitectVerifiedContext } from "@/lib/song-architect/access";

export async function GET(request: NextRequest) {
  const sessionPrep = prepareSessionForRequest(request);
  try {
    const verified = await resolveSongArchitectVerifiedContext({
      request,
      sessionId: sessionPrep.sessionId
    });
    if (!verified) {
      const res = NextResponse.json(
        {
          ok: false,
          code: "email_verification_required",
          message: "Verify your email to unlock Song Architect generation."
        },
        { status: 403 }
      );
      attachSessionCookieIfNeeded(res, sessionPrep);
      return res;
    }

    const res = NextResponse.json({
      ok: true,
      usage: verified.usage
    });
    attachSessionCookieIfNeeded(res, sessionPrep);
    return res;
  } catch (error) {
    const detail = error instanceof Error ? error.message : "Unknown Song Architect access error";
    console.error("[song-architect] access_failed", { detail });
    const res = NextResponse.json(
      {
        ok: false,
        code: "song_architect_access_failed",
        message: "Unable to verify Song Architect access right now."
      },
      { status: 500 }
    );
    attachSessionCookieIfNeeded(res, sessionPrep);
    return res;
  }
}
