import { PLAN_DEFINITIONS } from "@/lib/subscriptions/plans";
import { EntitlementSnapshot, PlanId } from "@/lib/subscriptions/types";
import { isSupabaseConfigured } from "@/lib/supabase/admin";
import { getCurrentMonthKeyUtc } from "@/lib/usage/month-key";
import { getLocalBillableDownloadCount } from "@/lib/usage/local-download-usage";
import { countBillableDownloadsForMonth } from "@/lib/usage/supabase-download-usage";
import {
  appendCreditPackLedgerEntry,
  getBillingSubscriptionByEmail,
  getCreditPackBalance
} from "@/lib/subscriptions/billing-store";
import { UserProfile } from "@/lib/users/user-profile";

export const FREE_MASTERS_PER_MONTH = 2;

// Service boundary for plan + usage resolution.

export type EntitlementBillingContext = {
  /** Lowercased email for Supabase download events; omit when unknown. */
  normalizedEmail?: string | null;
};

export async function getEntitlementsForUser(
  user: UserProfile,
  billing?: EntitlementBillingContext
): Promise<EntitlementSnapshot> {
  const emailForBilling = billing?.normalizedEmail ?? user.email?.trim().toLowerCase() ?? null;
  let activePlanId: PlanId = "free";
  let stripeCustomerId: string | null = null;
  let stripeSubscriptionId: string | null = null;
  let billingPeriodStartIso: string | null = null;
  let billingPeriodEndIso: string | null = null;

  if (isSupabaseConfigured() && emailForBilling) {
    const subscription = await getBillingSubscriptionByEmail(emailForBilling);
    if (subscription) {
      activePlanId = subscription.planId;
      stripeCustomerId = subscription.stripeCustomerId;
      stripeSubscriptionId = subscription.stripeSubscriptionId;
      billingPeriodStartIso = subscription.currentPeriodStart;
      billingPeriodEndIso = subscription.currentPeriodEnd;
    }
  }
  const plan = PLAN_DEFINITIONS[activePlanId];
  const monthlyCap = plan.id === "free" ? Math.min(plan.monthlyMastersLimit, FREE_MASTERS_PER_MONTH) : plan.monthlyMastersLimit;
  const monthKey = getCurrentMonthKeyUtc();

  let usedThisMonth: number | null;
  let remainingMonthly: number | null;
  let creditPackBalance: number | null = 0;

  if (isSupabaseConfigured()) {
    if (emailForBilling) {
      const used =
        plan.id === "free"
          ? await countBillableDownloadsForMonth(emailForBilling, monthKey)
          : await countBillableDownloadsForMonth(
              emailForBilling,
              getCurrentMonthKeyUtc(),
              billingPeriodStartIso ? new Date(billingPeriodStartIso) : undefined,
              billingPeriodEndIso ? new Date(billingPeriodEndIso) : undefined
            );
      usedThisMonth = used;
      remainingMonthly = Math.max(monthlyCap - used, 0);
      creditPackBalance = await getCreditPackBalance(emailForBilling);
    } else {
      usedThisMonth = null;
      remainingMonthly = null;
      creditPackBalance = null;
    }
  } else {
    const used = getLocalBillableDownloadCount(user.sessionId);
    usedThisMonth = used;
    remainingMonthly = Math.max(monthlyCap - used, 0);
    creditPackBalance = 0;
  }

  const remainingTotal = remainingMonthly === null || creditPackBalance === null ? null : remainingMonthly + creditPackBalance;
  const canDownload = remainingTotal === null ? true : remainingTotal > 0;

  return {
    planId: activePlanId,
    canMaster: true,
    canDownload,
    mastersUsedThisPeriod: usedThisMonth,
    monthlyMastersLimit: monthlyCap,
    remainingMonthlyMasters: remainingMonthly,
    creditPackBalance,
    remainingMasters: remainingTotal,
    billingPeriodStartIso,
    billingPeriodEndIso,
    quality: plan.quality,
    stripeCustomerId,
    stripeSubscriptionId,
    customerPortalEligible: plan.canUseCustomerPortal && Boolean(stripeCustomerId)
  };
}

export async function consumeCreditPackMaster(normalizedEmail: string, metadata?: Record<string, unknown>): Promise<boolean> {
  const balance = await getCreditPackBalance(normalizedEmail);
  if (balance <= 0) return false;
  await appendCreditPackLedgerEntry({
    normalizedEmail,
    delta: -1,
    reason: "credit_pack_consume",
    metadata: metadata ?? null
  });
  return true;
}
