import { getStripeClient } from "@/lib/stripe/server";
import { normalizeBillingEmail } from "./email";

/**
 * Download quota is keyed off `master_job_unlocks.normalized_email`, while Stripe reconciliation
 * keys off `Customer.email`. If they diverge, paid users see no subscription row for the unlock key.
 */
export async function warnIfUnlockEmailDiffersFromStripeCustomerEmail(options: {
  unlockNormalizedEmail: string;
  stripeCustomerId: string | null;
  jobId: string;
  fileId: string;
}): Promise<void> {
  if (!options.stripeCustomerId) return;
  try {
    const stripe = getStripeClient();
    const cust = await stripe.customers.retrieve(options.stripeCustomerId);
    if ("deleted" in cust && cust.deleted) return;
    const raw = typeof cust.email === "string" ? cust.email : "";
    const stripeNorm = normalizeBillingEmail(raw);
    if (!stripeNorm || stripeNorm === options.unlockNormalizedEmail) return;
    console.warn(
      JSON.stringify({
        scope: "download_authorization",
        event: "stripe_customer_email_unlock_email_mismatch",
        jobId: options.jobId,
        fileId: options.fileId,
        unlockNormalizedEmail: options.unlockNormalizedEmail,
        stripeCustomerId: options.stripeCustomerId,
        stripeCustomerNormalizedEmail: stripeNorm,
        hint: "Billing rows are keyed from Stripe Customer.email; downloads use capture-email. Use the same address at checkout and capture, or reconcile by account id."
      })
    );
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    console.warn(
      JSON.stringify({
        scope: "download_authorization",
        event: "stripe_customer_email_compare_failed",
        jobId: options.jobId,
        fileId: options.fileId,
        stripeCustomerId: options.stripeCustomerId,
        detail
      })
    );
  }
}
