export type PlanId = "free" | "creator_monthly" | "pro_studio_monthly";
export type PlanQuality = "16bit" | "24bit" | "32bit_float";

export type PlanDefinition = {
  id: PlanId;
  name: string;
  monthlyPriceUsd: number;
  /** Final mastered file entitlements included in the active period. */
  monthlyMastersLimit: number;
  quality: PlanQuality;
  stems: boolean;
  priority: boolean;
  apiAccess: boolean;
  description: string;
  features: string[];
  ctaLabel: string;
  highlighted: boolean;
  badgeLabel?: string;
  canUseCustomerPortal: boolean;
};

export type EntitlementSnapshot = {
  planId: PlanId;
  /** Mastering runs are not metered; always true unless future anti-abuse blocks apply. */
  canMaster: boolean;
  /** User may download at least one new final master this period (subject to per-download checks). */
  canDownload: boolean;
  mastersUsedThisPeriod: number | null;
  monthlyMastersLimit: number | null;
  remainingMonthlyMasters: number | null;
  creditPackBalance: number | null;
  remainingMasters: number | null;
  billingPeriodStartIso: string | null;
  billingPeriodEndIso: string | null;
  quality: PlanQuality;
  stripeCustomerId: string | null;
  stripeSubscriptionId: string | null;
  customerPortalEligible: boolean;
};
