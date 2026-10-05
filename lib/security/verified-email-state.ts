import { createHmac, timingSafeEqual } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";

const VERIFIED_EMAIL_COOKIE = "ms_verified_email";
const VERIFIED_EMAIL_MAX_AGE_SEC = 60 * 60 * 24 * 30; // 30 days

export type TrustedEmailProof = "stripe_checkout" | "authenticated_user" | "owner_token";

type VerifiedEmailCookiePayload = {
  normalizedEmail: string;
  verifiedAt: string;
  proof?: TrustedEmailProof;
};

function getSignatureSecret(): string | null {
  const configured =
    process.env.MASTERSAUCE_EMAIL_VERIFY_SECRET?.trim() ||
    process.env.NEXTAUTH_SECRET?.trim() ||
    "";
  if (configured) return configured;
  if (process.env.NODE_ENV === "production") return null;
  return "mastersouce-email-verify-dev-secret";
}

function signPayload(payloadBase64: string): string | null {
  const secret = getSignatureSecret();
  if (!secret) return null;
  return createHmac("sha256", secret).update(payloadBase64).digest("base64url");
}

function encodePayload(payload: VerifiedEmailCookiePayload): string {
  const payloadBase64 = Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
  const signature = signPayload(payloadBase64);
  if (!signature) {
    throw new Error("Trusted email signing secret is not configured.");
  }
  return `${payloadBase64}.${signature}`;
}

function decodePayload(raw: string): VerifiedEmailCookiePayload | null {
  const [payloadBase64, signature] = raw.split(".");
  if (!payloadBase64 || !signature) return null;
  const expected = signPayload(payloadBase64);
  if (!expected) return null;
  const left = Buffer.from(signature);
  const right = Buffer.from(expected);
  if (left.length !== right.length || !timingSafeEqual(left, right)) {
    return null;
  }
  try {
    const parsed = JSON.parse(Buffer.from(payloadBase64, "base64url").toString("utf8")) as VerifiedEmailCookiePayload;
    if (!parsed.normalizedEmail || !parsed.verifiedAt) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function readVerifiedEmailState(request: NextRequest): VerifiedEmailCookiePayload | null {
  const raw = request.cookies.get(VERIFIED_EMAIL_COOKIE)?.value;
  if (!raw) return null;
  return decodePayload(raw);
}

export function isVerifiedEmailForRequest(request: NextRequest, normalizedEmail: string): boolean {
  const state = readVerifiedEmailState(request);
  if (!state) return false;
  return state.normalizedEmail === normalizedEmail;
}

function attachVerifiedEmailState(
  response: NextResponse,
  normalizedEmail: string,
  proof: TrustedEmailProof
): void {
  const payload: VerifiedEmailCookiePayload = {
    normalizedEmail,
    verifiedAt: new Date().toISOString(),
    proof
  };
  response.cookies.set(VERIFIED_EMAIL_COOKIE, encodePayload(payload), {
    path: "/",
    maxAge: VERIFIED_EMAIL_MAX_AGE_SEC,
    sameSite: "lax",
    httpOnly: true,
    secure: process.env.NODE_ENV === "production"
  });
}

/**
 * Trusted email access means the server accepted the submitted email + abuse checks and
 * issued a signed cookie. It is not cryptographic inbox ownership verification.
 */
export function hasTrustedEmailAccess(request: NextRequest, normalizedEmail: string): boolean {
  return isVerifiedEmailForRequest(request, normalizedEmail);
}

/**
 * Sets signed trusted-email-access state for subsequent guarded endpoints.
 */
export function attachTrustedEmailAccessState(
  response: NextResponse,
  normalizedEmail: string,
  proof: TrustedEmailProof
): void {
  attachVerifiedEmailState(response, normalizedEmail, proof);
}

export function clearTrustedEmailAccessState(response: NextResponse): void {
  response.cookies.set(VERIFIED_EMAIL_COOKIE, "", {
    path: "/",
    maxAge: 0,
    sameSite: "lax",
    httpOnly: true,
    secure: process.env.NODE_ENV === "production"
  });
}
