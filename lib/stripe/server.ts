import Stripe from "stripe";

let stripe: Stripe | null = null;

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
