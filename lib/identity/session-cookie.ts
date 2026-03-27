import type { NextRequest } from "next/server";
import type { NextResponse } from "next/server";
import { randomUUID } from "node:crypto";

export const MASTER_SESSION_COOKIE = "ms_session";

const COOKIE_MAX_AGE_SEC = 60 * 60 * 24 * 400; // ~13 months

export type SessionPreparation = {
  sessionId: string;
  /** When true, attach Set-Cookie on the outgoing response. */
  setCookieOnResponse: boolean;
};

export function prepareSessionForRequest(request: NextRequest): SessionPreparation {
  const existing = request.cookies.get(MASTER_SESSION_COOKIE)?.value;
  if (existing && existing.length >= 8) {
    return { sessionId: existing, setCookieOnResponse: false };
  }
  return { sessionId: randomUUID(), setCookieOnResponse: true };
}

export function attachSessionCookieIfNeeded(response: NextResponse, prep: SessionPreparation): void {
  if (prep.setCookieOnResponse) {
    response.cookies.set(MASTER_SESSION_COOKIE, prep.sessionId, {
      path: "/",
      maxAge: COOKIE_MAX_AGE_SEC,
      sameSite: "lax",
      httpOnly: true
    });
  }
}
