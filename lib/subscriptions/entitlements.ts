import { PLAN_DEFINITIONS } from "@/lib/subscriptions/plans";
import { EntitlementSnapshot, PlanId } from "@/lib/subscriptions/types";
import { isSupabaseConfigured } from "@/lib/supabase/admin";
import { getCurrentMonthKeyUtc } from "@/lib/usage/month-key";
import { getLocalBillableDownloadCount } from "@/lib/usage/local-download-usage";
import { countBillableDownloadsForMonth } from "@/lib/usage/supabase-download-usage";
import { UserProfile } from "@/lib/users/user-profile";

export const FREE_DOWNLOADS_PER_MONTH = 4;

// MVP placeholder:
// - no auth persistence
// - no Stripe sync
// - free plan only for now
// Keep this service boundary so Stripe + Supabase-backed billing can be wired in later.

export type EntitlementBillingContext = {
  /** Lowercased email for Supabase download events; omit when unknown. */
  normalizedEmail?: string | null;
};

export async function getEntitlementsForUser(
  user: UserProfile,
  billing?: EntitlementBillingContext
): Promise<EntitlementSnapshot> {
  const activePlanId: PlanId = "free";
  const plan = PLAN_DEFINITIONS[activePlanId];
  const monthlyCap = Math.min(plan.includedDownloadsPerMonth, FREE_DOWNLOADS_PER_MONTH);
  const monthKey = getCurrentMonthKeyUtc();

  const emailForBilling = billing?.normalizedEmail ?? user.email?.trim().toLowerCase() ?? null;

  let usedThisMonth: number | null;
  let remaining: number | null;

  if (isSupabaseConfigured()) {
    if (emailForBilling) {
      const used = await countBillableDownloadsForMonth(emailForBilling, monthKey);
      usedThisMonth = used;
      remaining = Math.max(monthlyCap - used, 0);
    } else {
      usedThisMonth = null;
      remaining = null;
    }
  } else {
    const used = getLocalBillableDownloadCount(user.sessionId);
    usedThisMonth = used;
    remaining = Math.max(monthlyCap - used, 0);
  }

  const canDownload = remaining === null ? true : remaining > 0;

  return {
    planId: activePlanId,
    canMaster: true,
    canDownload,
    downloadsUsedThisMonth: usedThisMonth,
    remainingFreeDownloads: remaining,
    stripeCustomerId: null,
    stripeSubscriptionId: null,
    customerPortalEligible: false
  };
}
