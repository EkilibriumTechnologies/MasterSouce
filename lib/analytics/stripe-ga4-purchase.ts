import type Stripe from "stripe";
import { GA4_CLIENT_ID_METADATA_KEY, sanitizeGa4ClientId } from "@/lib/analytics/ga4-client-id";
import { GA4_ECOMMERCE_CATALOG, type Ga4EcommerceCatalogId } from "@/lib/analytics/ga4-ecommerce-catalog";
import {
  sendGa4CustomEvent,
  sendGa4PurchaseEvent,
  type Ga4PurchaseType,
  type SendGa4PurchaseEventParams
} from "@/lib/analytics/ga4-server";

export type Ga4PurchaseSender = (params: SendGa4PurchaseEventParams) => Promise<void>;

export type StripeGa4PurchaseOptions = {
  stripe?: Stripe;
  sendPurchase?: Ga4PurchaseSender;
  sendCustomEvent?: typeof sendGa4CustomEvent;
};

const ZERO_DECIMAL_CURRENCIES = new Set([
  "bif",
  "clp",
  "djf",
  "gnf",
  "jpy",
  "kmf",
  "krw",
  "mga",
  "pyg",
  "rwf",
  "ugx",
  "vnd",
  "vuv",
  "xaf",
  "xof",
  "xpf"
]);

function stripeMinorUnitsToMajor(amountMinor: number, currency: string): number {
  const code = currency.trim().toLowerCase();
  if (ZERO_DECIMAL_CURRENCIES.has(code)) return amountMinor;
  return Math.round(amountMinor) / 100;
}

function readMetadataClientId(metadata: Stripe.Metadata | null | undefined): string | null {
  if (!metadata) return null;
  return sanitizeGa4ClientId(metadata[GA4_CLIENT_ID_METADATA_KEY]);
}

function stripeCustomerId(customer: Stripe.Checkout.Session["customer"] | Stripe.Invoice["customer"]): string | null {
  if (typeof customer === "string" && customer.startsWith("cus_")) return customer;
  if (customer && typeof customer === "object" && "deleted" in customer && customer.deleted) return null;
  if (customer && typeof customer === "object" && "id" in customer && typeof customer.id === "string") return customer.id;
  return null;
}

/** Stripe API 2026-03-25.dahlia stores the subscription on `invoice.parent.subscription_details`. */
export function getInvoiceSubscriptionId(invoice: Stripe.Invoice): string | null {
  const parentSub = invoice.parent?.subscription_details?.subscription;
  if (typeof parentSub === "string" && parentSub.length > 0) return parentSub;
  if (parentSub && typeof parentSub === "object" && "id" in parentSub && typeof parentSub.id === "string") {
    return parentSub.id;
  }
  const legacy = (invoice as Stripe.Invoice & { subscription?: string | Stripe.Subscription | null }).subscription;
  if (typeof legacy === "string" && legacy.length > 0) return legacy;
  if (legacy && typeof legacy === "object" && "id" in legacy && typeof legacy.id === "string") return legacy.id;
  return null;
}

export function resolveGa4ClientIdFromCheckoutSession(session: Stripe.Checkout.Session): string | null {
  return readMetadataClientId(session.metadata);
}

export function resolveGa4ClientIdFromInvoice(invoice: Stripe.Invoice): string | null {
  const fromInvoice = readMetadataClientId(invoice.metadata);
  if (fromInvoice) return fromInvoice;
  return readMetadataClientId(invoice.parent?.subscription_details?.metadata ?? null);
}

export async function resolveGa4ClientIdForPaidInvoice(
  invoice: Stripe.Invoice,
  stripe?: Stripe
): Promise<string | null> {
  const immediate = resolveGa4ClientIdFromInvoice(invoice);
  if (immediate) return immediate;
  if (!stripe) return null;

  try {
    const subId = getInvoiceSubscriptionId(invoice);
    if (subId) {
      const sub = await stripe.subscriptions.retrieve(subId);
      const fromSub = readMetadataClientId(sub.metadata);
      if (fromSub) return fromSub;
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.warn("[GA4_CLIENT_ID]", { source: "subscription_retrieve", available: false, message });
  }

  try {
    const customerId = stripeCustomerId(invoice.customer);
    if (customerId) {
      const customer = await stripe.customers.retrieve(customerId);
      if (customer && !("deleted" in customer && customer.deleted)) {
        const fromCustomer = readMetadataClientId(customer.metadata);
        if (fromCustomer) return fromCustomer;
      }
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.warn("[GA4_CLIENT_ID]", { source: "customer_retrieve", available: false, message });
  }

  return null;
}

function catalogIdFromPlanId(planId: string | null | undefined): Ga4EcommerceCatalogId | null {
  if (planId === "creator_monthly" || planId === "pro_studio_monthly") return planId;
  return null;
}

export function purchaseTypeFromInvoice(invoice: Stripe.Invoice): Ga4PurchaseType {
  return invoice.billing_reason === "subscription_create" ? "initial_subscription" : "renewal";
}

function firstInvoicePriceId(invoice: Stripe.Invoice): string | undefined {
  const line = invoice.lines?.data?.[0] as
    | {
        pricing?: { price_details?: { price?: string } | null } | null;
        price?: string | { id?: string } | null;
      }
    | undefined;
  const fromPricing = line?.pricing?.price_details?.price;
  if (typeof fromPricing === "string" && fromPricing.startsWith("price_")) return fromPricing;
  const price = line?.price;
  if (typeof price === "string" && price.startsWith("price_")) return price;
  if (price && typeof price === "object" && typeof price.id === "string") return price.id;
  return undefined;
}

export async function persistGa4ClientIdFromCheckoutSession(
  stripe: Stripe,
  session: Stripe.Checkout.Session
): Promise<void> {
  const clientId = resolveGa4ClientIdFromCheckoutSession(session);
  const customerId = stripeCustomerId(session.customer);
  if (!clientId || !customerId) {
    console.log("[GA4_CLIENT_ID]", {
      source: "checkout_session_completed",
      persisted: false,
      hasClientId: Boolean(clientId),
      hasCustomerId: Boolean(customerId)
    });
    return;
  }
  try {
    await stripe.customers.update(customerId, {
      metadata: { [GA4_CLIENT_ID_METADATA_KEY]: clientId }
    });
    console.log("[GA4_CLIENT_ID]", { source: "customer_metadata", persisted: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.warn("[GA4_CLIENT_ID]", { source: "customer_metadata", persisted: false, message });
  }
}

/**
 * Checkout completion: persist analytics attribution, emit non-revenue `subscription_started`,
 * and send a `purchase` only for one-time credit-pack payments.
 * Subscription revenue is owned by `invoice.paid`.
 */
export async function handleGa4CheckoutSessionCompleted(
  session: Stripe.Checkout.Session,
  options: StripeGa4PurchaseOptions = {}
): Promise<void> {
  const sendPurchase = options.sendPurchase ?? sendGa4PurchaseEvent;
  const sendCustom = options.sendCustomEvent ?? sendGa4CustomEvent;
  const livemode = session.livemode === true;
  const clientId = resolveGa4ClientIdFromCheckoutSession(session);

  if (options.stripe) {
    await persistGa4ClientIdFromCheckoutSession(options.stripe, session);
  }

  if (session.mode === "subscription") {
    if (!clientId) {
      console.warn("[GA4_EVENT] skipped", { name: "subscription_started", reason: "missing_ga_client_id", sessionId: session.id });
      return;
    }
    try {
      await sendCustom({
        clientId,
        livemode,
        name: "subscription_started",
        params: {
          plan_id: typeof session.metadata?.plan_id === "string" ? session.metadata.plan_id : "subscription"
        }
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.warn("[GA4_EVENT] failed", { name: "subscription_started", message });
    }
    return;
  }

  if (session.mode !== "payment") return;
  if (session.payment_status !== "paid") return;
  if (session.metadata?.product_type !== "credit_pack") return;

  const totalMinor = session.amount_total;
  if (typeof totalMinor !== "number" || !Number.isFinite(totalMinor) || totalMinor <= 0) {
    console.warn("[GA4_PURCHASE] skipped", { reason: "zero_or_missing_amount", sessionId: session.id });
    return;
  }
  if (!clientId) {
    console.warn("[GA4_PURCHASE] skipped", { reason: "missing_ga_client_id", sessionId: session.id, purchaseType: "credit_pack" });
    return;
  }

  const currency = typeof session.currency === "string" ? session.currency : "usd";
  const value = stripeMinorUnitsToMajor(totalMinor, currency);
  const catalog = GA4_ECOMMERCE_CATALOG.credit_pack;
  const piRaw = session.payment_intent;
  const pi =
    typeof piRaw === "string"
      ? piRaw
      : piRaw && typeof piRaw === "object" && "id" in piRaw && typeof piRaw.id === "string"
        ? piRaw.id
        : null;
  const transactionId = pi ?? session.id;

  try {
    await sendPurchase({
      clientId,
      transactionId,
      value,
      currency,
      livemode,
      purchaseType: "credit_pack",
      items: [
        {
          itemId: catalog.itemId,
          itemName: catalog.itemName,
          price: value,
          quantity: 1
        }
      ]
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.warn("[GA4_PURCHASE] failed", { scope: "credit_pack", message, transactionId });
  }
}

/** @deprecated Use handleGa4CheckoutSessionCompleted. Kept as a named alias for call-site clarity. */
export const trackGa4PurchaseFromCheckoutSession = handleGa4CheckoutSessionCompleted;

/**
 * Subscription purchases (initial + renewals): `invoice.paid` is the monetary authority.
 * `transaction_id` is always `invoice.id` so webhook retries and checkout completion cannot double-count.
 */
export async function trackGa4PurchaseFromPaidSubscriptionInvoice(
  invoice: Stripe.Invoice,
  options: StripeGa4PurchaseOptions = {}
): Promise<void> {
  const sendPurchase = options.sendPurchase ?? sendGa4PurchaseEvent;
  const livemode = invoice.livemode === true;
  const subId = getInvoiceSubscriptionId(invoice);
  if (!subId) {
    return;
  }

  const paidMinor = invoice.amount_paid;
  if (typeof paidMinor !== "number" || !Number.isFinite(paidMinor) || paidMinor <= 0) {
    console.warn("[GA4_PURCHASE] skipped", { reason: "zero_or_missing_amount", invoiceId: invoice.id });
    return;
  }

  const clientId = await resolveGa4ClientIdForPaidInvoice(invoice, options.stripe);
  if (!clientId) {
    console.warn("[GA4_PURCHASE] skipped", {
      reason: "missing_ga_client_id",
      invoiceId: invoice.id,
      purchaseType: purchaseTypeFromInvoice(invoice),
      note: "Historical subscribers without a stored GA4 client_id are not attributed. Billing is unchanged."
    });
    return;
  }

  const currency = typeof invoice.currency === "string" ? invoice.currency : "usd";
  const value = stripeMinorUnitsToMajor(paidMinor, currency);
  const purchaseType = purchaseTypeFromInvoice(invoice);
  const planId =
    typeof invoice.parent?.subscription_details?.metadata?.plan_id === "string"
      ? invoice.parent.subscription_details.metadata.plan_id
      : typeof invoice.metadata?.plan_id === "string"
        ? invoice.metadata.plan_id
        : null;
  const catalogId = catalogIdFromPlanId(planId);
  const catalog = catalogId ? GA4_ECOMMERCE_CATALOG[catalogId] : null;
  const itemId = catalog?.itemId ?? (planId && planId.length > 0 ? planId : "subscription");
  const itemName = catalog?.itemName ?? (planId ? `MasterSauce Subscription (${planId})` : "MasterSauce Subscription");

  try {
    await sendPurchase({
      clientId,
      transactionId: invoice.id,
      value,
      currency,
      livemode,
      purchaseType,
      stripePriceId: firstInvoicePriceId(invoice),
      items: [
        {
          itemId,
          itemName,
          price: value,
          quantity: 1
        }
      ]
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.warn("[GA4_PURCHASE] failed", { scope: "invoice_paid", message, invoiceId: invoice.id });
  }
}
