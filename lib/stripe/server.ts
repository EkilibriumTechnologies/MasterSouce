import Stripe from "stripe";

let stripe: Stripe | null = null;
let loggedBillingPriceConfiguration = false;

function logStripeBillingPriceConfigurationOnce(): void {
  if (loggedBillingPriceConfiguration) return;
  const allowLog = process.env.NODE_ENV === "production" || process.env.BILLING_LOG_STRIPE_PRICE_CONFIG === "1";
  if (!allowLog) {
    loggedBillingPriceConfiguration = true;
    return;
  }
  loggedBillingPriceConfiguration = true;
  const key = process.env.STRIPE_SECRET_KEY?.trim() ?? "";
  const livemode = key.startsWith("sk_live");
  const summarize = (envKey: string) => {
    const v = process.env[envKey]?.trim();
    return v
      ? { configured: true as const, length: v.length, suffix: v.length > 10 ? v.slice(-10) : v }
      : { configured: false as const };
  };
  console.log(
    JSON.stringify({
      scope: "stripe_env",
      event: "billing_price_ids_configured",
      nodeEnv: process.env.NODE_ENV ?? null,
      stripeKeyMode: livemode ? "sk_live" : key.startsWith("sk_test") ? "sk_test" : "unknown_prefix",
      STRIPE_PRICE_CREATOR_MONTHLY: summarize("STRIPE_PRICE_CREATOR_MONTHLY"),
      STRIPE_PRICE_PRO_STUDIO_MONTHLY: summarize("STRIPE_PRICE_PRO_STUDIO_MONTHLY"),
      STRIPE_PRICE_CREDIT_PACK: summarize("STRIPE_PRICE_CREDIT_PACK"),
      planMapping: {
        creator_monthly: "STRIPE_PRICE_CREATOR_MONTHLY",
        pro_studio_monthly: "STRIPE_PRICE_PRO_STUDIO_MONTHLY",
        credit_pack: "STRIPE_PRICE_CREDIT_PACK"
      },
      note: "Price ids are not secrets; only suffix/length logged. Set BILLING_LOG_STRIPE_PRICE_CONFIG=1 in non-production to print this block."
    })
  );
}

export function getStripeSecretKey(): string {
  const key = process.env.STRIPE_SECRET_KEY?.trim();
  if (!key) {
    throw new Error("Missing STRIPE_SECRET_KEY.");
  }
  return key;
}

export function getStripeWebhookSecret(): string {
  const secret = process.env.STRIPE_WEBHOOK_SECRET?.trim();
  if (!secret) {
    throw new Error("Missing STRIPE_WEBHOOK_SECRET.");
  }
  return secret;
}

export function getStripeClient(): Stripe {
  if (!stripe) {
    stripe = new Stripe(getStripeSecretKey(), {
      apiVersion: "2026-03-25.dahlia"
    });
    logStripeBillingPriceConfigurationOnce();
  }
  return stripe;
}

export function getStripePriceIdForPlan(planId: "creator_monthly" | "pro_studio_monthly"): string {
  const envKey = planId === "creator_monthly" ? "STRIPE_PRICE_CREATOR_MONTHLY" : "STRIPE_PRICE_PRO_STUDIO_MONTHLY";
  const priceId = process.env[envKey]?.trim();
  if (!priceId) {
    throw new Error(`Missing ${envKey}.`);
  }
  return priceId;
}

export function getStripeCreditPackPriceId(): string {
  const priceId = process.env.STRIPE_PRICE_CREDIT_PACK?.trim();
  if (!priceId) {
    throw new Error("Missing STRIPE_PRICE_CREDIT_PACK.");
  }
  return priceId;
}
