import { NextRequest, NextResponse } from "next/server";
import Stripe from "stripe";
import { trackGa4PurchaseFromCheckoutSession, trackGa4PurchaseFromPaidSubscriptionInvoice } from "@/lib/analytics/stripe-ga4-purchase";
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

  console.log(
    JSON.stringify({
      scope: "billing_webhook",
      event: "received",
      stripeEventId: event.id,
      stripeEventType: event.type,
      livemode: event.livemode
    })
  );

  if (await hasProcessedStripeEvent(event.id)) {
    console.log(
      JSON.stringify({
        scope: "billing_webhook",
        event: "deduped",
        stripeEventId: event.id,
        stripeEventType: event.type
      })
    );
    return NextResponse.json({ ok: true, replay: true });
  }

  const stripe = getStripeClient();

  try {
    if (event.type === "checkout.session.completed") {
      const session = event.data.object as Stripe.Checkout.Session;
      if (session.mode === "subscription") {
        const subId = typeof session.subscription === "string" ? session.subscription : session.subscription?.id;
        const sessionEmail =
          session.customer_details?.email?.trim().toLowerCase() ??
          (session.customer_email ? session.customer_email.trim().toLowerCase() : null);
        console.log(
          JSON.stringify({
            scope: "billing_webhook",
            event: "checkout_session_completed_subscription",
            stripeEventId: event.id,
            sessionId: session.id,
            subscriptionId: subId ?? null,
            customerId:
              typeof session.customer === "string" ? session.customer : session.customer && "id" in session.customer
                ? session.customer.id
                : null,
            sessionEmailPresent: Boolean(sessionEmail)
          })
        );
        if (subId) {
          await retrieveAndReconcileSubscription(stripe, subId);
          console.log(
            JSON.stringify({
              scope: "billing_webhook",
              event: "checkout_subscription_reconciled",
              stripeEventId: event.id,
              sessionId: session.id,
              subscriptionId: subId,
              sessionEmailNormalized: sessionEmail,
              metadataPlanId: typeof session.metadata?.plan_id === "string" ? session.metadata.plan_id : null,
              dbWrite: "retrieveAndReconcileSubscription_invoked_see_stripe_reconcile_logs"
            })
          );
        } else {
          console.warn(
            JSON.stringify({
              scope: "billing_webhook",
              event: "checkout_subscription_missing_sub_id",
              stripeEventId: event.id,
              sessionId: session.id
            })
          );
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
      try {
        await trackGa4PurchaseFromCheckoutSession(session);
      } catch (ga4Err) {
        const message = ga4Err instanceof Error ? ga4Err.message : String(ga4Err);
        console.warn("[GA4_PURCHASE] failed", { scope: "checkout_session_completed", message });
      }
    }

    if (
      event.type === "customer.subscription.created" ||
      event.type === "customer.subscription.updated" ||
      event.type === "customer.subscription.deleted"
    ) {
      const subObj = event.data.object as Stripe.Subscription;
      const customerId =
        typeof subObj.customer === "string" ? subObj.customer : subObj.customer && "id" in subObj.customer ? subObj.customer.id : null;
      console.log(
        JSON.stringify({
          scope: "billing_webhook",
          event: "subscription_lifecycle",
          stripeEventId: event.id,
          stripeEventType: event.type,
          subscriptionId: subObj.id,
          subscriptionStatus: subObj.status,
          customerId,
          note: "Re-fetching subscription with expanded prices — webhook payload price fields are often string ids only."
        })
      );
      /** Always retrieve: `event.data.object` frequently omits expanded `items.data.price`, which breaks plan_id mapping. */
      await retrieveAndReconcileSubscription(stripe, subObj.id);
      console.log(
        JSON.stringify({
          scope: "billing_webhook",
          event: "subscription_lifecycle_reconciled",
          stripeEventId: event.id,
          stripeEventType: event.type,
          subscriptionId: subObj.id,
          dbWrite: "reconcileStripeSubscription_completed_or_noop"
        })
      );
    }

    if (
      event.type === "invoice.paid" ||
      event.type === "invoice.payment_succeeded" ||
      event.type === "invoice.payment_failed"
    ) {
      const invoice = event.data.object as Stripe.Invoice & {
        subscription?: string | Stripe.Subscription | null;
      };
      const subId = typeof invoice.subscription === "string" ? invoice.subscription : invoice.subscription?.id;
      console.log(
        JSON.stringify({
          scope: "billing_webhook",
          event: "invoice_subscription_touch",
          stripeEventId: event.id,
          stripeEventType: event.type,
          subscriptionId: subId ?? null
        })
      );
      if (subId) {
        await retrieveAndReconcileSubscription(stripe, subId);
        console.log(
          JSON.stringify({
            scope: "billing_webhook",
            event: "invoice_subscription_reconciled",
            stripeEventId: event.id,
            stripeEventType: event.type,
            subscriptionId: subId
          })
        );
      }
      if (event.type === "invoice.paid" || event.type === "invoice.payment_succeeded") {
        try {
          await trackGa4PurchaseFromPaidSubscriptionInvoice(invoice);
        } catch (ga4Err) {
          const message = ga4Err instanceof Error ? ga4Err.message : String(ga4Err);
          console.warn("[GA4_PURCHASE] failed", { scope: "invoice_paid_or_payment_succeeded", message });
        }
      }
    }

    await persistStripeBillingEvent(event.id, event.type, serializeStripeEvent(event));
    return NextResponse.json({ ok: true });
  } catch (error) {
    const detail = error instanceof Error ? error.message : "Unknown Stripe webhook error.";
    console.error(
      JSON.stringify({
        scope: "billing_webhook",
        event: "handler_error",
        stripeEventId: event.id,
        stripeEventType: event.type,
        livemode: event.livemode,
        detail,
        stack: error instanceof Error ? error.stack : null
      })
    );
    return NextResponse.json({ error: detail }, { status: 500 });
  }
}
