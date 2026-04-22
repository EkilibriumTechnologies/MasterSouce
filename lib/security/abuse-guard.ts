import { createHash } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";

type RateWindow = {
  count: number;
  resetAt: number;
};

type ConsumeRateLimitInput = {
  bucket: string;
  key: string;
  limit: number;
  windowMs: number;
};

export type RateLimitResult = {
  allowed: boolean;
  remaining: number;
  retryAfterSec: number;
  resetAt: number;
};

type AbuseGuardEvent =
  | "blocked_domain"
  | "disposable_domain"
  | "suspicious_local_part"
  | "rate_limited"
  | "unverified_master_download_blocked"
  | "unverified_song_architect_output_blocked";

const RATE_WINDOWS = new Map<string, RateWindow>();

function gcRateWindows(now: number): void {
  for (const [key, window] of RATE_WINDOWS) {
    if (window.resetAt <= now) {
      RATE_WINDOWS.delete(key);
    }
  }
}

export function getClientIp(request: NextRequest): string {
  const forwardedFor = request.headers.get("x-forwarded-for");
  if (forwardedFor) {
    const first = forwardedFor.split(",")[0]?.trim();
    if (first) return first;
  }
  return request.ip ?? "unknown";
}

export function hashIdentifier(value: string): string {
  return createHash("sha256").update(value).digest("hex").slice(0, 16);
}

export function maskEmail(email: string): string {
  const trimmed = email.trim().toLowerCase();
  const [local, domain] = trimmed.split("@");
  if (!local || !domain) return "<invalid-email>";
  const localMasked =
    local.length <= 2 ? `${local[0] ?? "*"}*` : `${local.slice(0, 2)}***${local.slice(-1)}`;
  const domainParts = domain.split(".");
  const root = domainParts[0] ?? "";
  const tld = domainParts.slice(1).join(".");
  const domainMasked = root.length <= 2 ? `${root[0] ?? "*"}*` : `${root.slice(0, 2)}***`;
  return `${localMasked}@${domainMasked}${tld ? `.${tld}` : ""}`;
}

export function logAbuseGuard(event: AbuseGuardEvent, meta: Record<string, unknown>): void {
  console.warn(`[ABUSE_GUARD] ${event}`, meta);
}

export function consumeRateLimit(input: ConsumeRateLimitInput): RateLimitResult {
  const now = Date.now();
  gcRateWindows(now);
  const mapKey = `${input.bucket}:${input.key}`;
  const current = RATE_WINDOWS.get(mapKey);
  if (!current || current.resetAt <= now) {
    const resetAt = now + input.windowMs;
    RATE_WINDOWS.set(mapKey, { count: 1, resetAt });
    return {
      allowed: true,
      remaining: Math.max(input.limit - 1, 0),
      retryAfterSec: Math.ceil(input.windowMs / 1000),
      resetAt
    };
  }

  current.count += 1;
  RATE_WINDOWS.set(mapKey, current);
  const allowed = current.count <= input.limit;
  const retryAfterSec = Math.max(Math.ceil((current.resetAt - now) / 1000), 1);
  return {
    allowed,
    remaining: Math.max(input.limit - current.count, 0),
    retryAfterSec,
    resetAt: current.resetAt
  };
}

export function tooManyAttemptsResponse(retryAfterSec: number): NextResponse {
  return NextResponse.json(
    { error: "Too many attempts. Please try again shortly." },
    {
      status: 429,
      headers: {
        "Retry-After": String(Math.max(retryAfterSec, 1))
      }
    }
  );
}

export function shouldChallengeSuspiciousRequest(params: {
  suspiciousReason: "blocked_domain" | "disposable_domain" | "suspicious_local_part";
  ip: string;
  normalizedEmail?: string;
}): { challengeRecommended: boolean; provider: "turnstile" | null } {
  void params;
  // Extension point: wire Turnstile or similar challenge verification here later.
  return { challengeRecommended: true, provider: "turnstile" };
}
