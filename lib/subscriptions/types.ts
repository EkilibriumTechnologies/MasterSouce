export type PlanId = "free" | "creator_monthly" | "creator_yearly";

export type PlanDefinition = {
  id: PlanId;
  label: string;
  monthlyPriceUsd: number;
  includedMastersPerMonth: number;
  canUseCustomerPortal: boolean;
};

export type EntitlementSnapshot = {
  planId: PlanId;
  canProcess: boolean;
  canDownload: boolean;
  remainingFreeMasters: number;
  stripeCustomerId: string | null;
  stripeSubscriptionId: string | null;
  customerPortalEligible: boolean;
};
