import { createHmac, timingSafeEqual } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";

const ACCOUNT_SESSION_COOKIE = "ms_account";
const ACCOUNT_SESSION_MAX_AGE_SEC = 60 * 60 * 24 * 30;

export type AppSession = {
  v: 1;
  userId: string;
  authUserId: string;
  normalizedEmail: string;
  issuedAt: string;
};

function getSessionSecret(): string | null {
  const secret =
    process.env.MASTERSAUCE_EMAIL_VERIFY_SECRET?.trim() ||
    process.env.NEXTAUTH_SECRET?.trim() ||
    "";
  if (secret) return secret;
  if (process.env.NODE_ENV === "production") return null;
  return "mastersouce-account-session-dev-secret";
}

function signature(payloadBase64: string): string | null {
  const secret = getSessionSecret();
  if (!secret) return null;
  return createHmac("sha256", `account-session:v1:${secret}`)
    .update(payloadBase64)
    .digest("base64url");
}

function encode(session: AppSession): string {
  const payloadBase64 = Buffer.from(JSON.stringify(session), "utf8").toString("base64url");
  const sig = signature(payloadBase64);
  if (!sig) throw new Error("Account session signing secret is not configured.");
  return `${payloadBase64}.${sig}`;
}

function decode(raw: string): AppSession | null {
  const [payloadBase64, supplied] = raw.split(".");
  if (!payloadBase64 || !supplied) return null;
  const expected = signature(payloadBase64);
  if (!expected) return null;
  const left = Buffer.from(supplied);
  const right = Buffer.from(expected);
  if (left.length !== right.length || !timingSafeEqual(left, right)) return null;
  try {
    const parsed = JSON.parse(Buffer.from(payloadBase64, "base64url").toString("utf8")) as AppSession;
    if (
      parsed.v !== 1 ||
      !parsed.userId ||
      !parsed.authUserId ||
      !parsed.normalizedEmail ||
      !parsed.issuedAt
    ) {
      return null;
    }
    const issuedAtMs = Date.parse(parsed.issuedAt);
    if (!Number.isFinite(issuedAtMs)) return null;
    const ageMs = Date.now() - issuedAtMs;
    if (ageMs < -5 * 60 * 1000 || ageMs > ACCOUNT_SESSION_MAX_AGE_SEC * 1000) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function readAppSession(request: NextRequest): AppSession | null {
  const raw = request.cookies.get(ACCOUNT_SESSION_COOKIE)?.value;
  return raw ? decode(raw) : null;
}

export function attachAppSession(response: NextResponse, session: Omit<AppSession, "v" | "issuedAt">): void {
  const payload: AppSession = {
    v: 1,
    ...session,
    issuedAt: new Date().toISOString()
  };
  response.cookies.set(ACCOUNT_SESSION_COOKIE, encode(payload), {
    path: "/",
    maxAge: ACCOUNT_SESSION_MAX_AGE_SEC,
    sameSite: "lax",
    httpOnly: true,
    secure: process.env.NODE_ENV === "production"
  });
}

export function clearAppSession(response: NextResponse): void {
  response.cookies.set(ACCOUNT_SESSION_COOKIE, "", {
    path: "/",
    maxAge: 0,
    sameSite: "lax",
    httpOnly: true,
    secure: process.env.NODE_ENV === "production"
  });
}
