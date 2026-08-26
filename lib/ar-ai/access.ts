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
import {
  countHitAnalyzerUsageAllTime,
  countHitAnalyzerUsageInPeriod,
  type HitAnalyzerUsageSnapshot
} from "@/lib/ar-ai/usage";
import { HIT_ANALYZER_TIER_LIMITS, resolveHitAnalyzerUsageWindow, type HitAnalyzerQuotaPeriod, type HitAnalyzerTierLimit } from "@/lib/ar-ai/limits";

export { HIT_ANALYZER_TIER_LIMITS, getHitAnalyzerAllowanceLabel, getHitAnalyzerMonthlyAllowanceLabel, resolveHitAnalyzerUsageWindow } from "@/lib/ar-ai/limits";

/** Default launch window end (UTC). One month from initial Hit Analyzer launch. */
export const HIT_ANALYZER_DEFAULT_LAUNCH_END_DATE = "2026-07-30T23:59:59.999Z";

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
      message: "Launch access has ended. Plan limits apply."
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

export function resolveHitAnalyzerTierLimit(
  planId: PlanId,
  normalizedEmail?: string | null
): HitAnalyzerTierLimit | null {
  if (isAdminEntitlementOverrideEmail(normalizedEmail)) return null;
  return HIT_ANALYZER_TIER_LIMITS[planId];
}

type HitAnalyzerBillingContext = {
  planId: PlanId;
  billingPeriodStartIso: string | null;
  billingPeriodEndIso: string | null;
};

async function resolveBillingContextForEmail(normalizedEmail: string): Promise<HitAnalyzerBillingContext> {
  if (!isSupabaseConfigured()) {
    return { planId: "free", billingPeriodStartIso: null, billingPeriodEndIso: null };
  }
  const sub = await getBillingSubscriptionByEmail(normalizedEmail);
  return {
    planId: sub?.planId ?? "free",
    billingPeriodStartIso: sub?.currentPeriodStart ?? null,
    billingPeriodEndIso: sub?.currentPeriodEnd ?? null
  };
}

function resolveBillingEmailHint(request: NextRequest, billingEmailHint?: string): string {
  const fromHeader = request.headers.get(MASTERSOUCE_BILLING_EMAIL_HEADER)?.trim() ?? "";
  const fromQuery = request.nextUrl.searchParams.get("email")?.trim() ?? "";
  const fromHint = billingEmailHint?.trim() ?? "";
  const fromCookie = readVerifiedEmailState(request)?.normalizedEmail?.trim() ?? "";
  return fromHeader || fromQuery || fromHint || fromCookie;
}

function buildQuotaExhaustedMessage(planId: PlanId, quotaPeriod: HitAnalyzerQuotaPeriod): string {
  if (planId === "free") {
    return "You used both free song analyses. Upgrade to Creator or Pro for more Analyze Your Song access.";
  }
  if (quotaPeriod === "monthly") {
    return "You reached your monthly Analyze Your Song limit. Upgrade your plan or wait for your next billing period.";
  }
  return "You reached your Hit Analyzer limit. Upgrade your plan to continue.";
}

export async function resolveHitAnalyzerUsageForEmail(normalizedEmail: string): Promise<HitAnalyzerUsageSnapshot> {
  const billing = await resolveBillingContextForEmail(normalizedEmail);
  const planId = billing.planId;
  const adminUnlimited = isAdminEntitlementOverrideEmail(normalizedEmail);
  const tierLimit = resolveHitAnalyzerTierLimit(planId, normalizedEmail);

  if (adminUnlimited || tierLimit == null) {
    return {
      used: 0,
      limit: null,
      remaining: null,
      planId,
      unlimited: true,
      entitled: true,
      quotaPeriod: "unlimited",
      periodStartIso: null,
      periodEndIso: null
    };
  }

  const usageWindow = resolveHitAnalyzerUsageWindow(
    tierLimit,
    billing.billingPeriodStartIso,
    billing.billingPeriodEndIso
  );
  const used =
    tierLimit.period === "lifetime"
      ? await countHitAnalyzerUsageAllTime(normalizedEmail)
      : await countHitAnalyzerUsageInPeriod(
          normalizedEmail,
          usageWindow!.periodStart,
          usageWindow!.periodEnd
        );
  const limit = tierLimit.limit;
  const remaining = Math.max(limit - used, 0);

  return {
    used,
    limit,
    remaining,
    planId,
    unlimited: false,
    entitled: remaining > 0,
    quotaPeriod: tierLimit.period,
    periodStartIso: usageWindow?.periodStart.toISOString() ?? null,
    periodEndIso: usageWindow?.periodEnd.toISOString() ?? null
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
    const quotaPeriod = usage.quotaPeriod === "unlimited" ? "lifetime" : usage.quotaPeriod;
    return {
      ok: false,
      code: "hit_analyzer_quota_exhausted",
      message: buildQuotaExhaustedMessage(usage.planId, quotaPeriod),
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
