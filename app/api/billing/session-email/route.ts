import { NextRequest, NextResponse } from "next/server";
import { attachSessionCookieIfNeeded, prepareSessionForRequest } from "@/lib/identity/session-cookie";
import { readVerifiedEmailState } from "@/lib/security/verified-email-state";

export const dynamic = "force-dynamic";

/**
 * Hydrates client sessionStorage with the server-trusted billing email cookie so
 * subsequent /api/master requests also send x-mastersouce-billing-email.
 */
export async function GET(request: NextRequest) {
  const sessionPrep = prepareSessionForRequest(request);
  const verified = readVerifiedEmailState(request);
  const res = NextResponse.json(
    {
      normalizedEmail: verified?.normalizedEmail ?? null
    },
    {
      headers: {
        "Cache-Control": "no-store"
      }
    }
  );
  attachSessionCookieIfNeeded(res, sessionPrep);
  return res;
}
