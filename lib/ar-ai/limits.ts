import type { PlanId } from "@/lib/subscriptions/types";
import { getCurrentMonthKeyUtc } from "@/lib/usage/month-key";

export type HitAnalyzerQuotaPeriod = "lifetime" | "monthly";

export type HitAnalyzerTierLimit = {
  limit: number;
  period: HitAnalyzerQuotaPeriod;
};

/**
 * Analyze Your Song (Hit Analyzer) tier limits.
 * - free: 2 successful evaluations total (lifetime) per account/email
 * - paid tiers: 5 successful evaluations per billing period
 *
 * Counting policy: only successful evaluations recorded with counted=true
 * consume allowance. Failed OpenAI / validation / aborted paths do not count.
 */
export const HIT_ANALYZER_TIER_LIMITS: Record<PlanId, HitAnalyzerTierLimit> = {
  free: { limit: 2, period: "lifetime" },
  creator_monthly: { limit: 5, period: "monthly" },
  pro_studio_monthly: { limit: 5, period: "monthly" }
};

export function formatHitAnalyzerLimitShort(planId: PlanId): string {
  const tier = HIT_ANALYZER_TIER_LIMITS[planId];
  if (tier.period === "lifetime") return `${tier.limit} lifetime`;
  return `${tier.limit} / month`;
}

export function getHitAnalyzerAllowanceLabel(planId: PlanId): string {
  const tier = HIT_ANALYZER_TIER_LIMITS[planId];
  if (tier.period === "lifetime") {
    return `${tier.limit} Analyze Your Song analyses — lifetime`;
  }
  return `${tier.limit} Analyze Your Song analyses / month`;
}

/** @deprecated Prefer getHitAnalyzerAllowanceLabel */
export function getHitAnalyzerMonthlyAllowanceLabel(planId: PlanId): string {
  return getHitAnalyzerAllowanceLabel(planId);
}

export function resolveHitAnalyzerUsageWindow(
  tierLimit: HitAnalyzerTierLimit,
  billingPeriodStartIso: string | null,
  billingPeriodEndIso: string | null
): { periodStart: Date; periodEnd: Date } | null {
  if (tierLimit.period === "lifetime") return null;

  if (billingPeriodStartIso && billingPeriodEndIso) {
    return {
      periodStart: new Date(billingPeriodStartIso),
      periodEnd: new Date(billingPeriodEndIso)
    };
  }

  const monthKey = getCurrentMonthKeyUtc();
  const [year, month] = monthKey.split("-").map(Number);
  return {
    periodStart: new Date(Date.UTC(year, month - 1, 1, 0, 0, 0, 0)),
    periodEnd: new Date(Date.UTC(year, month, 1, 0, 0, 0, 0))
  };
}
