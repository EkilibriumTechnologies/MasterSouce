import { PLAN_DEFINITIONS } from "@/lib/subscriptions/plans";
import { EntitlementSnapshot, PlanId } from "@/lib/subscriptions/types";
import { isSupabaseConfigured } from "@/lib/supabase/admin";
import { getCurrentMonthKeyUtc } from "@/lib/usage/month-key";
import { FREE_WAV_DOWNLOADS_PER_MONTH, resolveFreePlanWavCap } from "@/lib/usage/download-quota-policy";
import { getLocalBillableDownloadCount } from "@/lib/usage/local-download-usage";
import { countBillableDownloadsForMonth } from "@/lib/usage/supabase-download-usage";
import {
  appendCreditPackLedgerEntry,
  getBillingSubscriptionByEmail,
  getCreditPackBalance
} from "@/lib/subscriptions/billing-store";
import { resolveMasterWavExportPlanOverride } from "@/lib/subscriptions/master-wav-export-allowlist";
import { UserProfile } from "@/lib/users/user-profile";

/** @deprecated Use FREE_WAV_DOWNLOADS_PER_MONTH from download-quota-policy. */
export const FREE_MASTERS_PER_MONTH = FREE_WAV_DOWNLOADS_PER_MONTH;

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
  let stripePriceId: string | null = null;
  let subscriptionStatus: string | null = null;
  let billingPeriodStartIso: string | null = null;
  let billingPeriodEndIso: string | null = null;

  let billingSubscriptionHit = false;
  if (isSupabaseConfigured() && emailForBilling) {
    const subscription = await getBillingSubscriptionByEmail(emailForBilling);
    if (subscription) {
      billingSubscriptionHit = true;
      activePlanId = subscription.planId;
      stripeCustomerId = subscription.stripeCustomerId;
      stripeSubscriptionId = subscription.stripeSubscriptionId;
      stripePriceId = subscription.stripePriceId;
      subscriptionStatus = subscription.status;
      billingPeriodStartIso = subscription.currentPeriodStart;
      billingPeriodEndIso = subscription.currentPeriodEnd;
    }
  }

  const masterWavExportPlanOverride =
    emailForBilling != null ? resolveMasterWavExportPlanOverride(emailForBilling) : null;
  if (masterWavExportPlanOverride) {
    activePlanId = masterWavExportPlanOverride;
  }

  const plan = PLAN_DEFINITIONS[activePlanId];
  const monthlyCap =
    plan.id === "free" ? resolveFreePlanWavCap(plan.monthlyMastersLimit) : plan.monthlyMastersLimit;
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

  /** Mirrors pricing UX: paid subscription missing from DB while quota is gone (typical paid-user failure). */
  const requiresCheckout =
    isSupabaseConfigured() &&
    Boolean(emailForBilling) &&
    !canDownload &&
    (activePlanId === "free" || !billingSubscriptionHit);

  let entitlementReason: string;
  if (!isSupabaseConfigured()) {
    entitlementReason = "supabase_not_configured_local_usage";
  } else if (!emailForBilling) {
    entitlementReason = "no_billing_email_context";
  } else if (masterWavExportPlanOverride) {
    entitlementReason = "master_wav_export_allowlist";
  } else if (!billingSubscriptionHit) {
    entitlementReason =
      "no_active_trialing_subscription_in_db_or_period_ended_or_status_excluded_or_malformed_plan_row";
  } else if (activePlanId === "free" && stripeSubscriptionId) {
    entitlementReason = "subscription_row_present_but_plan_resolved_free_check_stripe_price_metadata_env";
  } else if (!canDownload) {
    entitlementReason = "monthly_and_credit_pack_quota_exhausted";
  } else {
    entitlementReason = "entitled_by_plan_or_unmetered_local";
  }

  const logEntitlements =
    process.env.BILLING_DIAGNOSTIC_LOGS === "1" ||
    !canDownload ||
    (billingSubscriptionHit && activePlanId === "free" && Boolean(stripeSubscriptionId));
  if (logEntitlements) {
    console.log(
      JSON.stringify({
        scope: "entitlement_resolution",
        event: "snapshot",
        userId: user.id,
        userEmail: user.email,
        billingEmail: emailForBilling,
        stripeCustomerId,
        stripeSubscriptionId,
        stripePriceId,
        planId: activePlanId,
        billingSubscriptionHit,
        subscriptionStatus,
        canDownload,
        mastersUsedThisPeriod: usedThisMonth,
        monthlyMastersLimit: monthlyCap,
        remainingMonthlyMasters: remainingMonthly,
        creditPackBalance,
        remainingMasters: remainingTotal,
        requiresCheckout,
        reason: entitlementReason,
        billingPeriodStartIso,
        billingPeriodEndIso,
        diagnosticMode: process.env.BILLING_DIAGNOSTIC_LOGS === "1"
      })
    );
  }

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
    stripePriceId,
    subscriptionStatus,
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
