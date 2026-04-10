import { NextRequest, NextResponse } from "next/server";
import Stripe from "stripe";
import { appendCreditPackLedgerEntry, hasProcessedStripeEvent, persistStripeBillingEvent } from "@/lib/billing/store";
import { reconcileStripeSubscription } from "@/lib/billing/stripe-reconcile";
import { getStripeClient, getStripeWebhookSecret } from "@/lib/stripe/server";

function serializeStripeEvent(event: Stripe.Event): Record<string, unknown> {
  return JSON.parse(JSON.stringify(event)) as Record<string, unknown>;
}

async function retrieveAndReconcileSubscription(stripe: Stripe, subscriptionId: string): Promise<void> {
  const sub = await stripe.subscriptions.retrieve(subscriptionId, { expand: ["items.data.price"] });
  await reconcileStripeSubscription(stripe, sub);
}

export async function POST(request: NextRequest) {
  const signature = request.headers.get("stripe-signature");
  if (!signature) {
    console.warn("[billing-webhook] missing stripe-signature header");
    return NextResponse.json({ error: "Missing Stripe signature." }, { status: 400 });
  }

  let event: Stripe.Event;
  try {
    const rawBody = await request.text();
    const stripe = getStripeClient();
    event = stripe.webhooks.constructEvent(rawBody, signature, getStripeWebhookSecret());
  } catch (error) {
    const detail = error instanceof Error ? error.message : "verify_failed";
    console.warn("[billing-webhook] signature verification failed", { detail });
    return NextResponse.json({ error: "Invalid signature." }, { status: 400 });
  }

  console.log("[billing-webhook] received", { id: event.id, type: event.type, livemode: event.livemode });

  if (await hasProcessedStripeEvent(event.id)) {
    console.log("[billing-webhook] deduped", { id: event.id, type: event.type });
    return NextResponse.json({ ok: true, replay: true });
  }

  const stripe = getStripeClient();

  try {
    if (event.type === "checkout.session.completed") {
      const session = event.data.object as Stripe.Checkout.Session;
      if (session.mode === "subscription") {
        const subId = typeof session.subscription === "string" ? session.subscription : session.subscription?.id;
        if (subId) {
          await retrieveAndReconcileSubscription(stripe, subId);
          console.log("[billing-webhook] checkout subscription reconciled", { sessionId: session.id, subId });
        } else {
          console.warn("[billing-webhook] subscription checkout missing subscription id", { sessionId: session.id });
        }
      } else if (session.mode === "payment") {
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
          console.log("[billing-webhook] credit pack ledger", { email, sessionId: session.id });
        }
      }
    }

    if (
      event.type === "customer.subscription.created" ||
      event.type === "customer.subscription.updated" ||
      event.type === "customer.subscription.deleted"
    ) {
      await reconcileStripeSubscription(stripe, event.data.object as Stripe.Subscription);
      console.log("[billing-webhook] subscription event reconciled", {
        type: event.type,
        subscriptionId: (event.data.object as Stripe.Subscription).id
      });
    }

    if (event.type === "invoice.paid" || event.type === "invoice.payment_failed") {
      const invoice = event.data.object as Stripe.Invoice & {
        subscription?: string | Stripe.Subscription | null;
      };
      const subId = typeof invoice.subscription === "string" ? invoice.subscription : invoice.subscription?.id;
      if (subId) {
        await retrieveAndReconcileSubscription(stripe, subId);
        console.log("[billing-webhook] invoice subscription reconciled", { type: event.type, subId });
      }
    }

    await persistStripeBillingEvent(event.id, event.type, serializeStripeEvent(event));
    return NextResponse.json({ ok: true });
  } catch (error) {
    const detail = error instanceof Error ? error.message : "Unknown Stripe webhook error.";
    console.error("[billing-webhook] handler error", { id: event.id, type: event.type, detail });
    return NextResponse.json({ error: detail }, { status: 500 });
  }
}
