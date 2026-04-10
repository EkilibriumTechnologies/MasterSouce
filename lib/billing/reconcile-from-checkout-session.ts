import { getStripeClient } from "@/lib/stripe/server";
import { normalizeBillingEmail } from "./email";
import { reconcileStripeSubscription } from "./stripe-reconcile";

export type ReconcileFromCheckoutSessionResult = {
  /** True when a subscription checkout was found and reconciled into billing tables. */
  reconciledSubscription: boolean;
  normalizedSessionEmail: string | null;
  emailRaw: string | null;
};

function sessionEmailsFromStripeSession(session: {
  customer_details?: { email?: string | null } | null;
  customer_email?: string | null;
}): { emailRaw: string | null; normalizedSessionEmail: string | null } {
  const raw =
    session.customer_details?.email?.trim() ||
    (typeof session.customer_email === "string" ? session.customer_email.trim() : "") ||
    "";
  const emailRaw = raw.length > 0 ? raw : null;
  const normalizedSessionEmail = emailRaw ? normalizeBillingEmail(emailRaw) : null;
  return { emailRaw, normalizedSessionEmail };
}

/**
 * Loads a Checkout Session, returns billing emails from the session, and reconciles
 * subscription state into Supabase when mode is subscription (idempotent).
 * Used by POST /api/billing/sync (no email guard).
 */
export async function reconcileFromCheckoutSession(checkoutSessionId: string): Promise<ReconcileFromCheckoutSessionResult> {
  if (!checkoutSessionId.startsWith("cs_")) {
    return { reconciledSubscription: false, normalizedSessionEmail: null, emailRaw: null };
  }

  const stripe = getStripeClient();
  const session = await stripe.checkout.sessions.retrieve(checkoutSessionId, { expand: ["subscription"] });
  const { emailRaw, normalizedSessionEmail } = sessionEmailsFromStripeSession(session);

  if (session.mode !== "subscription" || !session.subscription) {
    return { reconciledSubscription: false, normalizedSessionEmail, emailRaw };
  }

  const subId = typeof session.subscription === "string" ? session.subscription : session.subscription.id;
  const sub = await stripe.subscriptions.retrieve(subId, { expand: ["items.data.price"] });
  await reconcileStripeSubscription(stripe, sub);

  return { reconciledSubscription: true, normalizedSessionEmail, emailRaw };
}

export type AdaptiveRecheckSyncResult = {
  reconciled: boolean;
  syncSkippedReason?: "invalid_id" | "email_mismatch" | "not_subscription";
};

/**
 * Reconciles a Checkout Session only when its billing email matches the supplied normalized key.
 * Safe for Adaptive export re-check (avoids syncing arbitrary session IDs unrelated to the typed email).
 */
export async function reconcileCheckoutSessionForAdaptiveRecheck(
  checkoutSessionId: string,
  normalizedBillingEmail: string
): Promise<AdaptiveRecheckSyncResult> {
  if (!checkoutSessionId.startsWith("cs_")) {
    return { reconciled: false, syncSkippedReason: "invalid_id" };
  }

  const stripe = getStripeClient();
  const session = await stripe.checkout.sessions.retrieve(checkoutSessionId, { expand: ["subscription"] });
  const { normalizedSessionEmail } = sessionEmailsFromStripeSession(session);

  if (!normalizedSessionEmail || normalizedSessionEmail !== normalizedBillingEmail) {
    return { reconciled: false, syncSkippedReason: "email_mismatch" };
  }

  if (session.mode !== "subscription" || !session.subscription) {
    return { reconciled: false, syncSkippedReason: "not_subscription" };
  }

  const subId = typeof session.subscription === "string" ? session.subscription : session.subscription.id;
  const sub = await stripe.subscriptions.retrieve(subId, { expand: ["items.data.price"] });
  await reconcileStripeSubscription(stripe, sub);

  return { reconciled: true };
}
