import { PLAN_DEFINITIONS } from "@/lib/subscriptions/plans";
import { EntitlementSnapshot, PlanId } from "@/lib/subscriptions/types";
import { isSupabaseConfigured } from "@/lib/supabase/admin";
import {
  countCompletedMasterizationsForMonth,
  FREE_COMPLETED_MASTERS_PER_MONTH,
  getCurrentMonthKeyUtc
} from "@/lib/usage/supabase-mastering-usage";
import { getMonthlyUsage } from "@/lib/usage/quota";
import { UserProfile } from "@/lib/users/user-profile";

// MVP placeholder:
// - no auth persistence
// - no Stripe sync
// - free plan only for now
// Keep this service boundary so Stripe + Firebase can be wired in later.
export async function getEntitlementsForUser(user: UserProfile): Promise<EntitlementSnapshot> {
  const activePlanId: PlanId = "free";
  const plan = PLAN_DEFINITIONS[activePlanId];
  const monthlyCap = Math.min(plan.includedMastersPerMonth, FREE_COMPLETED_MASTERS_PER_MONTH);
  let usedThisMonth: number;
  if (isSupabaseConfigured()) {
    const monthKey = getCurrentMonthKeyUtc();
    usedThisMonth = await countCompletedMasterizationsForMonth(user.email, user.sessionId, monthKey);
  } else {
    usedThisMonth = getMonthlyUsage(user.id);
  }
  const remaining = Math.max(monthlyCap - usedThisMonth, 0);

  return {
    planId: activePlanId,
    canProcess: remaining > 0,
    canDownload: true,
    remainingFreeMasters: remaining,
    stripeCustomerId: null,
    stripeSubscriptionId: null,
    customerPortalEligible: false
  };
}
