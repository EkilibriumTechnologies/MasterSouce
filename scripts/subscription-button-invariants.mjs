import { readFileSync } from "node:fs";
import assert from "node:assert/strict";
import path from "node:path";

const ROOT = process.cwd();

function read(relPath) {
  return readFileSync(path.join(ROOT, relPath), "utf8");
}

function assertIncludes(content, needle, context) {
  assert.ok(content.includes(needle), `${context}: missing "${needle}"`);
}

const checkoutRoute = read("app/api/billing/checkout/route.ts");
assertIncludes(checkoutRoute, "planTier: z.enum([\"creator\", \"pro\"])", "checkout route planTier");
assertIncludes(checkoutRoute, "priceId: z.string().min(1)", "checkout route priceId");
assertIncludes(checkoutRoute, "allow_promotion_codes: true", "checkout route promo codes");
assertIncludes(checkoutRoute, "Checkout price does not match selected plan.", "checkout route price validation");

const metadataLib = read("lib/billing/subscription-button-metadata.ts");
assertIncludes(metadataLib, "data-plan-name", "subscription metadata data attributes");
assertIncludes(metadataLib, "data-plan-tier", "subscription metadata data attributes");
assertIncludes(metadataLib, "data-price-id", "subscription metadata data attributes");
assertIncludes(metadataLib, "creator_monthly: \"creator\"", "creator tier mapping");
assertIncludes(metadataLib, "pro_studio_monthly: \"pro\"", "pro tier mapping");

const analyticsLib = read("lib/analytics/subscription-button.ts");
assertIncludes(analyticsLib, "subscription_button_click", "subscription button analytics");

const pricingSection = read("components/pricing-section.tsx");
assertIncludes(pricingSection, "subscriptionButtonDataAttributes", "pricing section data attributes");
assertIncludes(pricingSection, "trackSubscriptionButtonClick", "pricing section analytics");
assertIncludes(pricingSection, "planTier:", "pricing section checkout payload");

const adaptiveGate = read("components/adaptive-export-gate.tsx");
assertIncludes(adaptiveGate, "planTier: checkoutMetadata.planTier", "adaptive gate checkout payload");
assertIncludes(adaptiveGate, "priceId: checkoutMetadata.priceId", "adaptive gate checkout payload");
assertIncludes(adaptiveGate, "trackSubscriptionButtonClick", "adaptive gate analytics");

const nextConfig = read("next.config.mjs");
assertIncludes(nextConfig, "NEXT_PUBLIC_STRIPE_PRICE_CREATOR_MONTHLY", "next config price exposure");

console.log("subscription-button-invariants: ok");
