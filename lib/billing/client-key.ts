/** Session key for the billing email used for Adaptive / entitlement checks (browser only). */
export const MASTERSOUCE_BILLING_EMAIL_KEY = "mastersouce_billing_email";

/** Snapshot so post–Stripe return can restore Adaptive job + unlock export without re-running the pipeline. */
export const MASTERSOUCE_PENDING_ADAPTIVE_EXPORT_KEY = "mastersouce_pending_adaptive_export";

/**
 * Last Stripe Checkout Session id from an adaptive success redirect (`session_id` query).
 * Convenience only; entitlements remain authoritative on the server.
 */
export const MASTERSOUCE_ADAPTIVE_CHECKOUT_SESSION_KEY = "mastersouce_adaptive_checkout_session";
