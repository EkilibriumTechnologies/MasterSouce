import type Stripe from "stripe";
import { getStripeClient } from "@/lib/stripe/server";
import { STRIPE_SUBSCRIPTION_ENTITLED_STATUSES } from "./constants";
import { getAdaptiveEntitlementByEmail } from "./store";
import { reconcileStripeSubscription } from "./stripe-reconcile";

export type AdaptiveStripeEmailSyncResult = {
  attempted: boolean;
  recovered: boolean;
  skipReason?:
    | "not_configured"
    | "no_customer"
    | "no_entitled_subscription"
    | "reconcile_error";
  stripeCustomerCount: number;
  subscriptionIdsSample: string[];
  chosenSubscriptionId: string | null;
  chosenSubscriptionStatus: string | null;
  errorMessage?: string;
};

function escapeStripeSearchEmail(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/'/g, "\\'");
}

/**
 * Stripe customers.list({ email }) is case-sensitive. If that returns nothing, try Customer Search
 * (helps when Stripe stored a different casing than our normalized key).
 */
async function findCustomersByEmailCaseAware(stripe: Stripe, normalizedEmail: string): Promise<Stripe.Customer[]> {
  const byId = new Map<string, Stripe.Customer>();

  const listed = await stripe.customers.list({ email: normalizedEmail, limit: 25 });
  for (const c of listed.data) {
    byId.set(c.id, c);
  }

  if (byId.size === 0) {
    const q = `email:'${escapeStripeSearchEmail(normalizedEmail)}'`;
    const searched = await stripe.customers.search({ query: q, limit: 25 });
    for (const c of searched.data) {
      byId.set(c.id, c);
    }
  }

  return [...byId.values()];
}

/**
 * When webhooks or checkout-session re-check did not persist `billing_entitlements`, load Stripe customers
 * by email, pick the best active/trialing subscription, and run the same reconcile path as webhooks.
 */
export async function reconcileAdaptiveEntitlementFromStripeByEmail(
  normalizedEmail: string
): Promise<AdaptiveStripeEmailSyncResult> {
  const empty = (partial: Partial<AdaptiveStripeEmailSyncResult>): AdaptiveStripeEmailSyncResult => ({
    attempted: false,
    recovered: false,
    stripeCustomerCount: 0,
    subscriptionIdsSample: [],
    chosenSubscriptionId: null,
    chosenSubscriptionStatus: null,
    ...partial
  });

  let stripe: Stripe;
  try {
    stripe = getStripeClient();
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return empty({ skipReason: "not_configured", errorMessage: msg, attempted: false });
  }

  try {
    const customers = await findCustomersByEmailCaseAware(stripe, normalizedEmail);
    if (customers.length === 0) {
      return empty({
        attempted: true,
        skipReason: "no_customer",
        stripeCustomerCount: 0
      });
    }

    const candidates: Stripe.Subscription[] = [];
    for (const c of customers) {
      const subs = await stripe.subscriptions.list({
        customer: c.id,
        limit: 40,
        expand: ["data.items.data.price"]
      });
      for (const sub of subs.data) {
        if (STRIPE_SUBSCRIPTION_ENTITLED_STATUSES.has(sub.status)) {
          candidates.push(sub);
        }
      }
    }

    if (candidates.length === 0) {
      return empty({
        attempted: true,
        skipReason: "no_entitled_subscription",
        stripeCustomerCount: customers.length
      });
    }

    const periodEnd = (s: Stripe.Subscription) => {
      const ext = s as Stripe.Subscription & { current_period_end?: number };
      const first = s.items?.data?.[0];
      return typeof ext.current_period_end === "number"
        ? ext.current_period_end
        : typeof first?.current_period_end === "number"
          ? first.current_period_end
          : 0;
    };
    candidates.sort((a, b) => periodEnd(b) - periodEnd(a));
    const best = candidates[0];

    await reconcileStripeSubscription(stripe, best);
    const row = await getAdaptiveEntitlementByEmail(normalizedEmail);

    return {
      attempted: true,
      recovered: Boolean(row?.isActive),
      stripeCustomerCount: customers.length,
      subscriptionIdsSample: candidates.slice(0, 5).map((s) => s.id),
      chosenSubscriptionId: best.id,
      chosenSubscriptionStatus: best.status,
      skipReason: row?.isActive ? undefined : "reconcile_error",
      errorMessage: row?.isActive ? undefined : "reconcile_ran_but_billing_entitlements_still_inactive"
    };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return empty({
      attempted: true,
      recovered: false,
      skipReason: "reconcile_error",
      errorMessage: msg
    });
  }
}
