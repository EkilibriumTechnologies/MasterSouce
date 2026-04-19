import type Stripe from "stripe";
import type { PlanId } from "@/lib/subscriptions/types";
import { getStripePriceIdForPlan } from "@/lib/stripe/server";
import { STRIPE_SUBSCRIPTION_ENTITLED_STATUSES } from "./constants";

const VALID_METADATA_PLAN_IDS = new Set<string>(["free", "creator_monthly", "pro_studio_monthly"]);

function configuredPriceIds(): { creator: string | null; pro: string | null; envCreatorMissing: boolean; envProMissing: boolean } {
  let creator: string | null = null;
  let pro: string | null = null;
  let envCreatorMissing = false;
  let envProMissing = false;
  try {
    creator = getStripePriceIdForPlan("creator_monthly");
  } catch {
    envCreatorMissing = true;
  }
  try {
    pro = getStripePriceIdForPlan("pro_studio_monthly");
  } catch {
    envProMissing = true;
  }
  return { creator, pro, envCreatorMissing, envProMissing };
}

/**
 * Defensive logs after plan resolution: active paid-looking line items that still map to `free`,
 * invalid metadata, or metadata that conflicts with the resolved line-item price.
 */
export function logStripeSubscriptionPlanAnomalies(
  subscription: Stripe.Subscription,
  resolvedPlanId: PlanId,
  stripePriceId: string | null
): void {
  const status = subscription.status;
  const entitled = STRIPE_SUBSCRIPTION_ENTITLED_STATUSES.has(status);
  const metaRaw = subscription.metadata?.plan_id;
  const meta = typeof metaRaw === "string" ? metaRaw.trim() : "";
  const { creator, pro, envCreatorMissing, envProMissing } = configuredPriceIds();

  const priceMatchesConfiguredPaid =
    Boolean(stripePriceId) &&
    ((creator !== null && stripePriceId === creator) || (pro !== null && stripePriceId === pro));

  if (entitled && resolvedPlanId === "free" && priceMatchesConfiguredPaid) {
    console.error(
      JSON.stringify({
        scope: "stripe_reconcile",
        event: "anomaly_active_subscription_env_price_resolved_free",
        subscriptionId: subscription.id,
        status,
        stripePriceId,
        metadataPlanId: meta || null,
        message:
          "Subscription is active/trialing and stripe_price_id matches STRIPE_PRICE_* env, but plan_id resolved to free — check resolver order and metadata.plan_id overrides."
      })
    );
  } else if (entitled && resolvedPlanId === "free" && stripePriceId) {
    console.error(
      JSON.stringify({
        scope: "stripe_reconcile",
        event: "anomaly_active_subscription_unmapped_stripe_price",
        subscriptionId: subscription.id,
        status,
        stripePriceId,
        metadataPlanId: meta || null,
        envCreatorMissing,
        envProMissing,
        hint: "Stripe line item uses a price id not equal to STRIPE_PRICE_CREATOR_MONTHLY / STRIPE_PRICE_PRO_STUDIO_MONTHLY (common: live vs test price, or new Stripe price not yet wired in env)."
      })
    );
  } else if (entitled && resolvedPlanId === "free" && !stripePriceId) {
    console.warn(
      JSON.stringify({
        scope: "stripe_reconcile",
        event: "anomaly_active_subscription_missing_first_price_id",
        subscriptionId: subscription.id,
        status,
        metadataPlanId: meta || null,
        itemsCount: subscription.items?.data?.length ?? 0,
        hint: "Active subscription has no first line-item price id after expand — inspect Stripe subscription items."
      })
    );
  }

  if (meta && !VALID_METADATA_PLAN_IDS.has(meta)) {
    console.warn(
      JSON.stringify({
        scope: "stripe_reconcile",
        event: "invalid_subscription_metadata_plan_id",
        subscriptionId: subscription.id,
        metadataPlanId: meta,
        resolvedPlanId,
        stripePriceId,
        hint: "subscription.metadata.plan_id must be exactly free | creator_monthly | pro_studio_monthly or omitted."
      })
    );
  }

  if (meta === "free" && priceMatchesConfiguredPaid) {
    console.warn(
      JSON.stringify({
        scope: "stripe_reconcile",
        event: "metadata_plan_free_conflicts_paid_line_item",
        subscriptionId: subscription.id,
        status,
        stripePriceId,
        message: "metadata.plan_id is free but the subscription line item matches a configured paid price id."
      })
    );
  }
}
