import { PLAN_DEFINITIONS } from "@/lib/subscriptions/plans";
import { EntitlementSnapshot, PlanId } from "@/lib/subscriptions/types";
import { isSupabaseConfigured } from "@/lib/supabase/admin";
import { getCurrentMonthKeyUtc } from "@/lib/usage/month-key";
import {
  FREE_WAV_DOWNLOADS_PER_MONTH,
  resolvePlanMonthlyWavCap
} from "@/lib/usage/download-quota-policy";
import { getLocalBillableDownloadCount } from "@/lib/usage/local-download-usage";
import { countBillableDownloadsForMonth } from "@/lib/usage/supabase-download-usage";
import {
  appendCreditPackLedgerEntry,
  getBillingSubscriptionByEmail,
  getCreditPackBalance
} from "@/lib/subscriptions/billing-store";
import { applyAdminEntitlementOverride, isAdminEntitlementOverrideEmail } from "@/lib/subscriptions/admin-entitlement-override";
import { resolveMasterWavExportPlanOverride } from "@/lib/subscriptions/master-wav-export-allowlist";
import { logMasteringFunnelEvent, normalizeEmailForFunnelLog } from "@/lib/analytics/mastering-funnel";
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
  const monthlyCap = resolvePlanMonthlyWavCap(activePlanId, plan.monthlyMastersLimit);
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
      remainingMonthly = monthlyCap === null ? null : Math.max(monthlyCap - used, 0);
      creditPackBalance = await getCreditPackBalance(emailForBilling);
    } else {
      usedThisMonth = null;
      remainingMonthly = null;
      creditPackBalance = null;
    }
  } else {
    const used = getLocalBillableDownloadCount(user.sessionId);
    usedThisMonth = used;
    remainingMonthly = monthlyCap === null ? null : Math.max(monthlyCap - used, 0);
    creditPackBalance = 0;
  }

  const remainingTotal = remainingMonthly === null || creditPackBalance === null ? null : remainingMonthly + creditPackBalance;
  const canDownload = remainingTotal === null ? true : remainingTotal > 0;

  let entitlementReason: string;
  if (!isSupabaseConfigured()) {
    entitlementReason = "supabase_not_configured_local_usage";
  } else if (!emailForBilling) {
    entitlementReason = "no_billing_email_context";
  } else if (isAdminEntitlementOverrideEmail(emailForBilling)) {
    entitlementReason = "admin_entitlement_override";
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

  const snapshot: EntitlementSnapshot = {
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

  const resolved = applyAdminEntitlementOverride(snapshot, emailForBilling);

  const logEntitlements =
    process.env.BILLING_DIAGNOSTIC_LOGS === "1" ||
    !resolved.canDownload ||
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
        planId: resolved.planId,
        billingSubscriptionHit,
        subscriptionStatus,
        canDownload: resolved.canDownload,
        mastersUsedThisPeriod: resolved.mastersUsedThisPeriod,
        monthlyMastersLimit: resolved.monthlyMastersLimit,
        remainingMonthlyMasters: resolved.remainingMonthlyMasters,
        creditPackBalance: resolved.creditPackBalance,
        remainingMasters: resolved.remainingMasters,
        requiresCheckout:
          isSupabaseConfigured() &&
          Boolean(emailForBilling) &&
          !resolved.canDownload &&
          (resolved.planId === "free" || !billingSubscriptionHit),
        reason: entitlementReason,
        billingPeriodStartIso,
        billingPeriodEndIso,
        diagnosticMode: process.env.BILLING_DIAGNOSTIC_LOGS === "1"
      })
    );
  }

  return resolved;
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
  const remaining = balance - 1;
  const emailForLog = normalizeEmailForFunnelLog(normalizedEmail);
  logMasteringFunnelEvent("mastering_credit_consumed", {
    source_component: "credit_ledger",
    normalized_email: emailForLog,
    credit_balance: remaining,
    has_credit_balance: remaining > 0,
    job_id: typeof metadata?.jobId === "string" ? metadata.jobId : undefined,
    file_id: typeof metadata?.fileId === "string" ? metadata.fileId : undefined
  });
  if (remaining > 0) {
    logMasteringFunnelEvent("mastering_user_has_unused_credits", {
      source_component: "credit_ledger",
      normalized_email: emailForLog,
      credit_balance: remaining,
      has_credit_balance: true
    });
  }
  return true;
}
