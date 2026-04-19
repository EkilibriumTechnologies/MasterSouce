import type Stripe from "stripe";
import type { PlanId } from "@/lib/subscriptions/types";
import { getStripePriceIdForPlan } from "@/lib/stripe/server";
import { STRIPE_SUBSCRIPTION_ENTITLED_STATUSES } from "./constants";
import { normalizeBillingEmail } from "./email";
import { logStripeSubscriptionPlanAnomalies } from "./stripe-plan-anomalies";
import { upsertAdaptiveEntitlement, upsertBillingCustomer, upsertBillingSubscription, type BillingSubscriptionUpsert } from "./store";

function unixToIsoOrNull(unix: number | undefined | null): string | null {
  if (unix == null || typeof unix !== "number") return null;
  return new Date(unix * 1000).toISOString();
}

/** Stripe often sends `items[].price` as a string id on webhook payloads unless expanded. */
export function firstSubscriptionItemPriceId(subscription: Stripe.Subscription): string | null {
  const first = subscription.items?.data?.[0];
  /** Webhooks may send a price id string; expanded retrieves send a Price object. */
  const p = first?.price as string | Stripe.Price | null | undefined;
  if (typeof p === "string" && p.length > 0) return p;
  if (p && typeof p === "object" && "id" in p && typeof p.id === "string") return p.id;
  return null;
}

export function resolvePlanIdFromStripeSubscription(subscription: Stripe.Subscription): PlanId {
  const meta = subscription.metadata?.plan_id;
  if (meta === "free" || meta === "creator_monthly" || meta === "pro_studio_monthly") return meta;
  const priceId = firstSubscriptionItemPriceId(subscription);
  if (priceId) {
    try {
      if (priceId === getStripePriceIdForPlan("creator_monthly")) return "creator_monthly";
      if (priceId === getStripePriceIdForPlan("pro_studio_monthly")) return "pro_studio_monthly";
    } catch {
      // Price env vars may be unset in some environments; fall through to default.
    }
  }
  console.error(
    JSON.stringify({
      scope: "stripe_reconcile",
      event: "resolve_plan_id_fallback_to_free",
      subscriptionId: subscription.id,
      status: subscription.status,
      metadataPlanId: meta ?? null,
      stripePriceId: priceId,
      message: "No valid subscription.metadata.plan_id and line-item price did not match STRIPE_PRICE_* env vars."
    })
  );
  return "free";
}

/**
 * Upsert billing_customers, billing_subscriptions, and adaptive_access entitlement from a Stripe Subscription object.
 * Safe to call repeatedly (webhooks, manual sync).
 */
export async function reconcileStripeSubscription(stripe: Stripe, subscription: Stripe.Subscription): Promise<void> {
  const customerId = typeof subscription.customer === "string" ? subscription.customer : subscription.customer.id;
  const customer = await stripe.customers.retrieve(customerId);
  if (!customer || ("deleted" in customer && customer.deleted)) {
    console.warn(
      JSON.stringify({
        scope: "stripe_reconcile",
        event: "abort_customer_missing",
        subscriptionId: subscription.id,
        customerId,
        metadataPlanId: subscription.metadata?.plan_id ?? null,
        firstPriceId: firstSubscriptionItemPriceId(subscription)
      })
    );
    return;
  }
  const rawEmail = typeof customer.email === "string" ? customer.email : "";
  const normalized = normalizeBillingEmail(rawEmail);
  if (!normalized) {
    console.warn(
      JSON.stringify({
        scope: "stripe_reconcile",
        event: "abort_no_billable_email",
        subscriptionId: subscription.id,
        customerId,
        customerEmailPresent: Boolean(rawEmail),
        metadataPlanId: subscription.metadata?.plan_id ?? null,
        firstPriceId: firstSubscriptionItemPriceId(subscription),
        hint: "Stripe Customer.email empty or invalid — subscription cannot be keyed to billing_subscriptions.normalized_email."
      })
    );
    return;
  }

  const displayEmail = rawEmail.trim() || normalized;
  const billingCustomerId = await upsertBillingCustomer({
    email: displayEmail,
    normalizedEmail: normalized,
    stripeCustomerId: customerId
  });

  const firstItem = subscription.items.data[0];
  const stripePriceId = firstSubscriptionItemPriceId(subscription);
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
  logStripeSubscriptionPlanAnomalies(subscription, planId, stripePriceId);

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

  console.log(
    JSON.stringify({
      scope: "stripe_reconcile",
      event: "subscription_reconciled",
      subscriptionId: subscription.id,
      normalizedEmail: normalized,
      stripeCustomerId: customerId,
      status: subscription.status,
      entitled,
      planId,
      stripePriceId,
      dbWrites: "billing_customers,billing_subscriptions,billing_entitlements_upserted"
    })
  );
}
