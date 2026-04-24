import type Stripe from "stripe";
import { sendGa4PurchaseEvent } from "@/lib/analytics/ga4-server";
import { PLAN_DEFINITIONS } from "@/lib/subscriptions/plans";
import type { PlanId } from "@/lib/subscriptions/types";

/**
 * Prefer `metadata.ga_client_id` from Stripe (set by checkout later) so browser and MP share a client.
 * Fallback: Stripe Customer id (`cus_…`) when Checkout created a Customer before completion.
 * Otherwise a stable synthetic id — does not block the webhook.
 */
export function resolveGa4ClientIdFromCheckoutSession(session: Stripe.Checkout.Session): string {
  const fromMeta = session.metadata?.ga_client_id;
  if (typeof fromMeta === "string" && fromMeta.trim().length > 0) {
    return fromMeta.trim();
  }
  const c = session.customer;
  if (typeof c === "string" && c.startsWith("cus_")) return c;
  if (c && typeof c === "object" && "deleted" in c && !c.deleted && "id" in c && typeof c.id === "string") {
    return c.id;
  }
  return `stripe_checkout_${session.id}`;
}

function resolveGa4ClientIdFromInvoice(invoice: Stripe.Invoice): string {
  const fromMeta = invoice.metadata?.ga_client_id;
  if (typeof fromMeta === "string" && fromMeta.trim().length > 0) {
    return fromMeta.trim();
  }
  const c = invoice.customer;
  if (typeof c === "string" && c.startsWith("cus_")) return c;
  if (c && typeof c === "object" && "id" in c && typeof c.id === "string") return c.id;
  return `stripe_invoice_${invoice.id}`;
}

function subscriptionItemName(planId: string | undefined | null): string {
  if (planId === "creator_monthly" || planId === "pro_studio_monthly") {
    return PLAN_DEFINITIONS[planId as PlanId].name;
  }
  if (typeof planId === "string" && planId.length > 0) {
    return `MasterSauce Subscription (${planId})`;
  }
  return "MasterSauce Subscription";
}

function centsToDecimal(cents: number | null | undefined): number | null {
  if (cents == null || typeof cents !== "number" || !Number.isFinite(cents)) return null;
  return Math.round(cents) / 100;
}

/** Initial subscription + one-time checkout: `checkout.session.completed` when payment succeeded. */
export async function trackGa4PurchaseFromCheckoutSession(session: Stripe.Checkout.Session): Promise<void> {
  if (session.payment_status !== "paid") return;
  const total = centsToDecimal(session.amount_total);
  if (total == null || total <= 0) {
    console.warn("[GA4_PURCHASE] skipped", { reason: "zero_or_missing_amount", sessionId: session.id });
    return;
  }
  const currency = typeof session.currency === "string" ? session.currency : "usd";
  const clientId = resolveGa4ClientIdFromCheckoutSession(session);

  if (session.mode === "subscription") {
    const planId = typeof session.metadata?.plan_id === "string" ? session.metadata.plan_id : null;
    const itemName = subscriptionItemName(planId);
    await sendGa4PurchaseEvent({
      clientId,
      transactionId: session.id,
      value: total,
      currency,
      items: [
        {
          itemId: planId ?? undefined,
          itemName,
          price: total,
          quantity: 1
        }
      ]
    });
    return;
  }

  if (session.mode === "payment") {
    const piRaw = session.payment_intent;
    const pi =
      typeof piRaw === "string"
        ? piRaw
        : piRaw && typeof piRaw === "object" && "id" in piRaw && typeof piRaw.id === "string"
          ? piRaw.id
          : null;
    const transactionId = pi ?? session.id;
    const isCreditPack = session.metadata?.product_type === "credit_pack";
    const itemName = isCreditPack ? "MasterSauce Credit Pack" : "MasterSauce Purchase";
    await sendGa4PurchaseEvent({
      clientId,
      transactionId,
      value: total,
      currency,
      items: [{ itemName, price: total, quantity: 1 }]
    });
  }
}

function firstInvoiceLineDescription(invoice: Stripe.Invoice): string | null {
  const line = invoice.lines?.data?.[0];
  const desc = line?.description;
  if (typeof desc === "string" && desc.trim()) return desc.trim();
  return null;
}

/**
 * Subscription renewals (and non-initial invoice charges): `invoice.paid` / `invoice.payment_succeeded`.
 * Skips `billing_reason === subscription_create` so the initial term stays attributed to Checkout (`cs_…`).
 */
export async function trackGa4PurchaseFromPaidSubscriptionInvoice(invoice: Stripe.Invoice): Promise<void> {
  const inv = invoice as Stripe.Invoice & { subscription?: string | Stripe.Subscription | null };
  const sub = inv.subscription;
  const subId = typeof sub === "string" ? sub : sub && typeof sub === "object" && "id" in sub ? sub.id : null;
  if (!subId) return;

  if (invoice.billing_reason === "subscription_create") return;

  const paid = centsToDecimal(invoice.amount_paid);
  if (paid == null || paid <= 0) return;

  const currency = typeof invoice.currency === "string" ? invoice.currency : "usd";
  const clientId = resolveGa4ClientIdFromInvoice(invoice);
  const lineName = firstInvoiceLineDescription(invoice);
  const itemName = lineName ?? "MasterSauce Subscription";

  await sendGa4PurchaseEvent({
    clientId,
    transactionId: invoice.id,
    value: paid,
    currency,
    items: [{ itemName, price: paid, quantity: 1 }]
  });
}
