import { NextRequest, NextResponse } from "next/server";
import { attachSessionCookieIfNeeded, prepareSessionForRequest } from "@/lib/identity/session-cookie";
import { isSongArchitectPremiumPlan } from "@/lib/song-architect/premium-access";
import { resolveSongArchitectVerifiedContext } from "@/lib/song-architect/access";

/**
 * Server-side premium gate for Song Architect advanced output.
 * Clients must not rely on UI-only hiding; premium fields are stripped at generate time for free plans.
 */
export async function GET(request: NextRequest) {
  const sessionPrep = prepareSessionForRequest(request);
  try {
    const access = await resolveSongArchitectVerifiedContext({
      request,
      sessionId: sessionPrep.sessionId
    });
    if (!access.ok) {
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

    const isPremium = isSongArchitectPremiumPlan(access.usage.planId);
    if (!isPremium) {
      const res = NextResponse.json(
        {
          ok: false,
          code: "song_architect_premium_required",
          message: "Upgrade to Creator or Pro Studio to unlock advanced Song Architect output.",
          usage: access.usage
        },
        { status: 403 }
      );
      attachSessionCookieIfNeeded(res, sessionPrep);
      return res;
    }

    const res = NextResponse.json({
      ok: true,
      planId: access.usage.planId,
      usage: access.usage
    });
    attachSessionCookieIfNeeded(res, sessionPrep);
    return res;
  } catch (error) {
    const detail = error instanceof Error ? error.message : "Unknown premium access error";
    console.error("[song-architect] premium_access_failed", { detail });
    const res = NextResponse.json(
      {
        ok: false,
        code: "song_architect_premium_access_failed",
        message: "Unable to verify Song Architect premium access right now."
      },
      { status: 500 }
    );
    attachSessionCookieIfNeeded(res, sessionPrep);
    return res;
  }
}
