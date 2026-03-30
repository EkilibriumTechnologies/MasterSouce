export type PlanId = "free" | "creator_monthly" | "creator_yearly";

export type PlanDefinition = {
  id: PlanId;
  name: string;
  monthlyPriceUsd: number;
  /** Final mastered file downloads per calendar month included in the plan. */
  includedDownloadsPerMonth: number;
  description: string;
  features: string[];
  ctaLabel: string;
  highlighted: boolean;
  canUseCustomerPortal: boolean;
};

export type EntitlementSnapshot = {
  planId: PlanId;
  /** Mastering runs are not metered; always true unless future anti-abuse blocks apply. */
  canMaster: boolean;
  /** User may download at least one new final master this period (subject to per-download checks). */
  canDownload: boolean;
  /**
   * Per-email Supabase usage for the current month, or null when billing email is not available
   * (no reliable lookup was performed — do not display placeholder numbers).
   */
  downloadsUsedThisMonth: number | null;
  remainingFreeDownloads: number | null;
  stripeCustomerId: string | null;
  stripeSubscriptionId: string | null;
  customerPortalEligible: boolean;
};
