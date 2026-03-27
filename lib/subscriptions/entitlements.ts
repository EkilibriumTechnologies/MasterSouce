import { PLAN_DEFINITIONS } from "@/lib/subscriptions/plans";
import { EntitlementSnapshot, PlanId } from "@/lib/subscriptions/types";
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
  const usedThisMonth = getMonthlyUsage(user.id);
  const remaining = Math.max(plan.includedMastersPerMonth - usedThisMonth, 0);

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
