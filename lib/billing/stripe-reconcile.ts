import type Stripe from "stripe";
import type { PlanId } from "@/lib/subscriptions/types";
import { getStripePriceIdForPlan } from "@/lib/stripe/server";
import { STRIPE_SUBSCRIPTION_ENTITLED_STATUSES } from "./constants";
import { normalizeBillingEmail } from "./email";
import { upsertAdaptiveEntitlement, upsertBillingCustomer, upsertBillingSubscription, type BillingSubscriptionUpsert } from "./store";

function unixToIsoOrNull(unix: number | undefined | null): string | null {
  if (unix == null || typeof unix !== "number") return null;
  return new Date(unix * 1000).toISOString();
}

export function resolvePlanIdFromStripeSubscription(subscription: Stripe.Subscription): PlanId {
  const meta = subscription.metadata?.plan_id;
  if (meta === "creator_monthly" || meta === "pro_studio_monthly") return meta;
  const first = subscription.items.data[0];
  if (first?.price?.id) {
    try {
      const priceId = first.price.id;
      if (priceId === getStripePriceIdForPlan("creator_monthly")) return "creator_monthly";
      if (priceId === getStripePriceIdForPlan("pro_studio_monthly")) return "pro_studio_monthly";
    } catch {
      // Price env vars may be unset in some environments; fall through to default.
    }
  }
  console.warn("[billing] resolvePlanId fallback to creator_monthly", {
    subscriptionId: subscription.id,
    priceId: first?.price?.id ?? null
  });
  return "creator_monthly";
}

/**
 * Upsert billing_customers, billing_subscriptions, and adaptive_access entitlement from a Stripe Subscription object.
 * Safe to call repeatedly (webhooks, manual sync).
 */
export async function reconcileStripeSubscription(stripe: Stripe, subscription: Stripe.Subscription): Promise<void> {
  const customerId = typeof subscription.customer === "string" ? subscription.customer : subscription.customer.id;
  const customer = await stripe.customers.retrieve(customerId);
  if (!customer || ("deleted" in customer && customer.deleted)) {
    console.warn("[billing] subscription customer missing", { subscriptionId: subscription.id, customerId });
    return;
  }
  const rawEmail = typeof customer.email === "string" ? customer.email : "";
  const normalized = normalizeBillingEmail(rawEmail);
  if (!normalized) {
    console.warn("[billing] subscription customer has no billable email", { subscriptionId: subscription.id, customerId });
    return;
  }

  const displayEmail = rawEmail.trim() || normalized;
  const billingCustomerId = await upsertBillingCustomer({
    email: displayEmail,
    normalizedEmail: normalized,
    stripeCustomerId: customerId
  });

  const firstItem = subscription.items.data[0];
  const subWithPeriod = subscription as Stripe.Subscription & {
    current_period_start?: number;
    current_period_end?: number;
  };
  const periodStartUnix =
    typeof subWithPeriod.current_period_start === "number"
      ? subWithPeriod.current_period_start
      : firstItem?.current_period_start;
  const periodEndUnix =
    typeof subWithPeriod.current_period_end === "number" ? subWithPeriod.current_period_end : firstItem?.current_period_end;

  const currentPeriodStart = unixToIsoOrNull(periodStartUnix) ?? new Date().toISOString();
  const currentPeriodEnd = unixToIsoOrNull(periodEndUnix) ?? currentPeriodStart;

  const planId = resolvePlanIdFromStripeSubscription(subscription);
  const stripePriceId = firstItem?.price?.id ?? null;

  const canceledAt = unixToIsoOrNull(subscription.canceled_at);
  const trialStart = unixToIsoOrNull(subscription.trial_start);
  const trialEnd = unixToIsoOrNull(subscription.trial_end);

  const raw = JSON.parse(JSON.stringify(subscription)) as Record<string, unknown>;

  const row: BillingSubscriptionUpsert = {
    normalizedEmail: normalized,
    stripeCustomerId: customerId,
    stripeSubscriptionId: subscription.id,
    billingCustomerId,
    planId,
    status: subscription.status,
    currentPeriodStart,
    currentPeriodEnd,
    cancelAtPeriodEnd: Boolean(subscription.cancel_at_period_end),
    stripePriceId,
    canceledAt,
    trialStart,
    trialEnd,
    raw
  };

  await upsertBillingSubscription(row);

  const entitled = STRIPE_SUBSCRIPTION_ENTITLED_STATUSES.has(subscription.status);
  await upsertAdaptiveEntitlement({
    normalizedEmail: normalized,
    billingCustomerId,
    isActive: entitled,
    sourceRef: subscription.id,
    expiresAt: entitled ? currentPeriodEnd : null,
    metadata: { status: subscription.status, planId }
  });

  console.log("[billing] subscription reconciled", {
    subscriptionId: subscription.id,
    email: normalized,
    status: subscription.status,
    entitled,
    planId
  });
}
