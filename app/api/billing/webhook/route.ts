import { NextRequest, NextResponse } from "next/server";
import Stripe from "stripe";
import {
  appendCreditPackLedgerEntry,
  hasProcessedStripeEvent,
  markBillingSubscriptionCanceled,
  recordProcessedStripeEvent,
  upsertBillingCustomer,
  upsertBillingSubscription
} from "@/lib/subscriptions/billing-store";
import { getStripeClient, getStripePriceIdForPlan, getStripeWebhookSecret } from "@/lib/stripe/server";

function resolvePlanIdFromSubscription(item: Stripe.SubscriptionItem): "creator_monthly" | "pro_studio_monthly" | null {
  const priceId = item.price.id;
  if (priceId === getStripePriceIdForPlan("creator_monthly")) return "creator_monthly";
  if (priceId === getStripePriceIdForPlan("pro_studio_monthly")) return "pro_studio_monthly";
  return null;
}

async function upsertSubscriptionFromStripeObject(subscription: Stripe.Subscription): Promise<void> {
  const firstItem = subscription.items.data[0];
  if (!firstItem) return;
  const periodStartUnix =
    typeof (subscription as Stripe.Subscription & { current_period_start?: number }).current_period_start === "number"
      ? (subscription as Stripe.Subscription & { current_period_start?: number }).current_period_start
      : firstItem.current_period_start;
  const periodEndUnix =
    typeof (subscription as Stripe.Subscription & { current_period_end?: number }).current_period_end === "number"
      ? (subscription as Stripe.Subscription & { current_period_end?: number }).current_period_end
      : firstItem.current_period_end;
  if (typeof periodStartUnix !== "number" || typeof periodEndUnix !== "number") return;
  const planId = resolvePlanIdFromSubscription(firstItem);
  if (!planId) return;
  const stripe = getStripeClient();
  const customerId = typeof subscription.customer === "string" ? subscription.customer : subscription.customer.id;
  const customer = await stripe.customers.retrieve(customerId);
  const email =
    customer && !("deleted" in customer) && typeof customer.email === "string" ? customer.email.trim().toLowerCase() : null;
  if (!email) return;
  await upsertBillingCustomer({ normalizedEmail: email, stripeCustomerId: customerId });
  await upsertBillingSubscription({
    normalizedEmail: email,
    stripeCustomerId: customerId,
    stripeSubscriptionId: subscription.id,
    planId,
    status: subscription.status,
    currentPeriodStart: new Date(periodStartUnix * 1000).toISOString(),
    currentPeriodEnd: new Date(periodEndUnix * 1000).toISOString(),
    cancelAtPeriodEnd: Boolean(subscription.cancel_at_period_end)
  });
}

export async function POST(request: NextRequest) {
  const signature = request.headers.get("stripe-signature");
  if (!signature) {
    return NextResponse.json({ error: "Missing Stripe signature." }, { status: 400 });
  }
  try {
    const rawBody = await request.text();
    const stripe = getStripeClient();
    const event = stripe.webhooks.constructEvent(rawBody, signature, getStripeWebhookSecret());

    if (await hasProcessedStripeEvent(event.id)) {
      return NextResponse.json({ ok: true, replay: true });
    }

    if (event.type === "checkout.session.completed") {
      const session = event.data.object as Stripe.Checkout.Session;
      const email =
        session.customer_details?.email?.trim().toLowerCase() ??
        (session.customer_email ? session.customer_email.trim().toLowerCase() : null);
      if (email && session.metadata?.product_type === "credit_pack") {
        await appendCreditPackLedgerEntry({
          normalizedEmail: email,
          delta: 5,
          reason: "credit_pack_purchase",
          stripeCheckoutSessionId: session.id,
          stripePaymentIntentId:
            typeof session.payment_intent === "string" ? session.payment_intent : session.payment_intent?.id ?? null,
          metadata: {
            source: "stripe_webhook",
            eventId: event.id
          }
        });
      }
    }

    if (event.type === "customer.subscription.created" || event.type === "customer.subscription.updated") {
      await upsertSubscriptionFromStripeObject(event.data.object as Stripe.Subscription);
    }

    if (event.type === "customer.subscription.deleted") {
      const subscription = event.data.object as Stripe.Subscription;
      await markBillingSubscriptionCanceled(subscription.id);
    }

    await recordProcessedStripeEvent(event.id, event.type);
    return NextResponse.json({ ok: true });
  } catch (error) {
    const detail = error instanceof Error ? error.message : "Unknown Stripe webhook error.";
    return NextResponse.json({ error: detail }, { status: 400 });
  }
}
