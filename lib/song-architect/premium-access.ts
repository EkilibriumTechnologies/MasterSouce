import type { PlanId } from "@/lib/subscriptions/types";

/** Creator and Pro Studio plans unlock Song Architect premium output. */
export function isSongArchitectPremiumPlan(planId: PlanId): boolean {
  return planId === "creator_monthly" || planId === "pro_studio_monthly";
}
