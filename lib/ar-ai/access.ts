import type { NextRequest } from "next/server";
import { MASTERSOUCE_BILLING_EMAIL_HEADER } from "@/lib/billing/client-key";
import { normalizeBillingEmail } from "@/lib/billing/email";
import { getBillingSubscriptionByEmail } from "@/lib/billing/store";
import { getClientIp, hashIdentifier, logAbuseGuard, maskEmail, shouldChallengeSuspiciousRequest } from "@/lib/security/abuse-guard";
import { readVerifiedEmailState } from "@/lib/security/verified-email-state";
import { validateEmailAddress } from "@/lib/security/validate-email-address";
import { isAdminEntitlementOverrideEmail } from "@/lib/subscriptions/admin-entitlement-override";
import type { PlanId } from "@/lib/subscriptions/types";
import { isSupabaseConfigured } from "@/lib/supabase/admin";
import { countHitAnalyzerUsageThisMonth, type HitAnalyzerUsageSnapshot } from "@/lib/ar-ai/usage";

/** Default launch window end (UTC). One month from initial Hit Analyzer launch. */
export const HIT_ANALYZER_DEFAULT_LAUNCH_END_DATE = "2026-07-30T23:59:59.999Z";

export const HIT_ANALYZER_TIER_LIMITS: Record<PlanId, number> = {
  free: 1,
  creator_monthly: 10,
  pro_studio_monthly: 50
};

export type HitAnalyzerLaunchCountdown = {
  launchActive: boolean;
  launchEndsAt: string;
  unit: "days" | "hours";
  value: number;
  label: string;
};

export type HitAnalyzerLaunchMetadata = HitAnalyzerLaunchCountdown & {
  message: string;
};

export type HitAnalyzerAccessBlockedCode =
  | "email_verification_required"
  | "email_not_allowed"
  | "hit_analyzer_quota_exhausted";

export type HitAnalyzerAccessContext =
  | {
      ok: true;
      launchActive: boolean;
      launch: HitAnalyzerLaunchMetadata;
      normalizedEmail: string | null;
      planId: PlanId;
      unlimited: boolean;
      usage: HitAnalyzerUsageSnapshot | null;
    }
  | {
      ok: false;
      code: HitAnalyzerAccessBlockedCode;
      message: string;
      upgradeRequired?: boolean;
      limit?: number;
      remaining?: number;
    };

type ResolveHitAnalyzerAccessInput = {
  request: NextRequest;
  billingEmailHint?: string;
  now?: Date;
};

function parseLaunchEndDate(raw: string | undefined): Date | null {
  if (!raw?.trim()) return null;
  const parsed = new Date(raw.trim());
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed;
}

export function resolveHitAnalyzerLaunchEndDate(now: Date = new Date()): Date {
  const fromEnv = parseLaunchEndDate(process.env.HIT_ANALYZER_FREE_LAUNCH_END_DATE);
  if (fromEnv) return fromEnv;
  const fallback = parseLaunchEndDate(HIT_ANALYZER_DEFAULT_LAUNCH_END_DATE);
  return fallback ?? now;
}

export function isHitAnalyzerLaunchActive(now: Date = new Date()): boolean {
  const end = resolveHitAnalyzerLaunchEndDate(now);
  return now.getTime() < end.getTime();
}

export function buildHitAnalyzerLaunchCountdown(now: Date = new Date()): HitAnalyzerLaunchMetadata {
  const launchEndsAt = resolveHitAnalyzerLaunchEndDate(now).toISOString();
  const endMs = new Date(launchEndsAt).getTime();
  const msRemaining = Math.max(0, endMs - now.getTime());
  const launchActive = msRemaining > 0;
  const oneDayMs = 24 * 60 * 60 * 1000;

  if (!launchActive) {
    return {
      launchActive: false,
      launchEndsAt,
      unit: "days",
      value: 0,
      label: "0 days",
      message: "Launch access has ended. Monthly plan limits apply."
    };
  }

  if (msRemaining >= oneDayMs) {
    const days = Math.ceil(msRemaining / oneDayMs);
    const label = `${days} day${days === 1 ? "" : "s"}`;
    return {
      launchActive: true,
      launchEndsAt,
      unit: "days",
      value: days,
      label,
      message: `Free launch access ends in ${label}`
    };
  }

  const hours = Math.max(1, Math.ceil(msRemaining / (60 * 60 * 1000)));
  const label = `${hours} hour${hours === 1 ? "" : "s"}`;
  return {
    launchActive: true,
    launchEndsAt,
    unit: "hours",
    value: hours,
    label,
    message: `Free launch access ends in ${label}`
  };
}

export function resolveHitAnalyzerTierLimit(planId: PlanId, normalizedEmail?: string | null): number | null {
  if (isAdminEntitlementOverrideEmail(normalizedEmail)) return null;
  return HIT_ANALYZER_TIER_LIMITS[planId];
}

async function resolvePlanIdForEmail(normalizedEmail: string): Promise<PlanId> {
  if (!isSupabaseConfigured()) return "free";
  const sub = await getBillingSubscriptionByEmail(normalizedEmail);
  return sub?.planId ?? "free";
}

function resolveBillingEmailHint(request: NextRequest, billingEmailHint?: string): string {
  const fromHeader = request.headers.get(MASTERSOUCE_BILLING_EMAIL_HEADER)?.trim() ?? "";
  const fromQuery = request.nextUrl.searchParams.get("email")?.trim() ?? "";
  const fromHint = billingEmailHint?.trim() ?? "";
  const fromCookie = readVerifiedEmailState(request)?.normalizedEmail?.trim() ?? "";
  return fromHeader || fromQuery || fromHint || fromCookie;
}

function buildQuotaExhaustedMessage(planId: PlanId): string {
  if (planId === "free") {
    return "You used your free Hit Analyzer report for this month. Upgrade to Creator or Pro to analyze more songs.";
  }
  if (planId === "creator_monthly") {
    return "You used all 10 Hit Analyzer reports for this month on Creator. Upgrade to Pro Studio for more.";
  }
  return "You used all 50 Hit Analyzer reports for this month on Pro Studio.";
}

export async function resolveHitAnalyzerUsageForEmail(normalizedEmail: string): Promise<HitAnalyzerUsageSnapshot> {
  const planId = await resolvePlanIdForEmail(normalizedEmail);
  const unlimited = isAdminEntitlementOverrideEmail(normalizedEmail);
  const tierLimit = resolveHitAnalyzerTierLimit(planId, normalizedEmail);
  const used = unlimited ? 0 : await countHitAnalyzerUsageThisMonth(normalizedEmail);
  const limit = unlimited || tierLimit == null ? null : tierLimit;
  const remaining = unlimited || limit == null ? null : Math.max(limit - used, 0);
  return {
    used,
    limit,
    remaining,
    planId,
    unlimited,
    entitled: unlimited || (remaining != null && remaining > 0)
  };
}

export async function resolveHitAnalyzerAccess(input: ResolveHitAnalyzerAccessInput): Promise<HitAnalyzerAccessContext> {
  const now = input.now ?? new Date();
  const launch = buildHitAnalyzerLaunchCountdown(now);
  const launchActive = launch.launchActive;
  const rawEmail = resolveBillingEmailHint(input.request, input.billingEmailHint);

  if (!rawEmail) {
    if (launchActive) {
      return {
        ok: true,
        launchActive,
        launch,
        normalizedEmail: null,
        planId: "free",
        unlimited: false,
        usage: null
      };
    }
    return {
      ok: false,
      code: "email_verification_required",
      message: "Confirm your email to use Hit Analyzer after the launch period."
    };
  }

  const emailValidation = validateEmailAddress(rawEmail);
  if (!emailValidation.allowed || !emailValidation.normalizedEmail) {
    const validationReason = emailValidation.reason ?? "invalid_format";
    if (
      validationReason === "blocked_domain" ||
      validationReason === "disposable_domain" ||
      validationReason === "suspicious_local_part"
    ) {
      const ip = getClientIp(input.request);
      logAbuseGuard(validationReason, {
        endpoint: "/api/ar-ai",
        ipHash: hashIdentifier(ip),
        emailMasked: maskEmail(rawEmail),
        challenge: shouldChallengeSuspiciousRequest({
          suspiciousReason: validationReason,
          ip
        })
      });
    }
    return {
      ok: false,
      code: "email_not_allowed",
      message: "Please use a real email address (temporary/disposable test inboxes are blocked)."
    };
  }

  const normalizedEmail = normalizeBillingEmail(emailValidation.normalizedEmail);
  if (!normalizedEmail) {
    if (launchActive) {
      return {
        ok: true,
        launchActive,
        launch,
        normalizedEmail: null,
        planId: "free",
        unlimited: false,
        usage: null
      };
    }
    return {
      ok: false,
      code: "email_verification_required",
      message: "Confirm your email to use Hit Analyzer after the launch period."
    };
  }

  const usage = await resolveHitAnalyzerUsageForEmail(normalizedEmail);

  if (launchActive || usage.unlimited) {
    return {
      ok: true,
      launchActive,
      launch,
      normalizedEmail,
      planId: usage.planId,
      unlimited: usage.unlimited,
      usage
    };
  }

  if (usage.remaining != null && usage.remaining <= 0) {
    return {
      ok: false,
      code: "hit_analyzer_quota_exhausted",
      message: buildQuotaExhaustedMessage(usage.planId),
      upgradeRequired: true,
      limit: usage.limit ?? 0,
      remaining: 0
    };
  }

  return {
    ok: true,
    launchActive,
    launch,
    normalizedEmail,
    planId: usage.planId,
    unlimited: false,
    usage
  };
}

export function getHitAnalyzerMonthlyAllowanceLabel(planId: PlanId): string {
  const limit = HIT_ANALYZER_TIER_LIMITS[planId];
  if (planId === "pro_studio_monthly") return `Pro: ${limit}/month`;
  if (planId === "creator_monthly") return `Creator: ${limit}/month`;
  return `Free: ${limit}/month`;
}
