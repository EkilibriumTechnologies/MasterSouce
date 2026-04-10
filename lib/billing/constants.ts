/** Feature flag written from Stripe subscription lifecycle. */
export const ADAPTIVE_ENTITLEMENT = "adaptive_access";

/**
 * Stripe subscription statuses that grant Adaptive (paid) access.
 * Only active billing periods with these statuses unlock adaptive_access.
 */
export const STRIPE_SUBSCRIPTION_ENTITLED_STATUSES = new Set<string>(["active", "trialing"]);

/**
 * Statuses that must NOT grant Adaptive (terminal failure, collection issues, or not yet payable).
 * Note: past_due is excluded so users are not treated as entitled while payment is unresolved.
 */
export const STRIPE_SUBSCRIPTION_BLOCKED_STATUSES = new Set<string>([
  "canceled",
  "incomplete_expired",
  "unpaid",
  "past_due",
  "incomplete",
  "paused"
]);
