import { PlanDefinition, PlanId } from "@/lib/subscriptions/types";

export const PLAN_DEFINITIONS: Record<PlanId, PlanDefinition> = {
  free: {
    id: "free",
    label: "Free",
    monthlyPriceUsd: 0,
    includedMastersPerMonth: 3,
    canUseCustomerPortal: false
  },
  creator_monthly: {
    id: "creator_monthly",
    label: "Creator Monthly",
    monthlyPriceUsd: 12,
    includedMastersPerMonth: 100,
    canUseCustomerPortal: true
  },
  creator_yearly: {
    id: "creator_yearly",
    label: "Creator Yearly",
    monthlyPriceUsd: 9,
    includedMastersPerMonth: 1200,
    canUseCustomerPortal: true
  }
};
