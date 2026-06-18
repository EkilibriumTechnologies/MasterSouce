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
assertIncludes(checkoutRoute, "allow_promotion_codes: true", "checkout route");

const pricingSection = read("components/pricing-section.tsx");
assertIncludes(pricingSection, "Father&apos;s Day Weekend — 50% Off", "pricing section badge");
assertIncludes(pricingSection, "FATHERS_DAY_PROMO_CODE", "pricing section promo code");
assertIncludes(pricingSection, "promo_pricing_view", "pricing analytics");
assertIncludes(pricingSection, "formatFathersDayPromoPriceUsd", "promo price helper");

const popup = read("components/promo/fathers-day-popup.tsx");
assertIncludes(popup, "promo_popup_view", "popup view analytics");
assertIncludes(popup, "promo_popup_cta_click", "popup cta analytics");
assertIncludes(popup, "recordFathersDayPopupDismissed", "popup once-per-day storage");

const banner = read("components/promo/promo-banner.tsx");
assertIncludes(banner, "promo_banner_click", "banner analytics");

const uploadForm = read("components/upload-form.tsx");
assertIncludes(uploadForm, "setMastersourceWorkflowBusy", "workflow guard during mastering/export");

const promoLib = read("lib/promo/fathers-day-2026.ts");
assertIncludes(promoLib, "FATHERS_DAY_PROMO_CODE = \"Fatherday26\"", "promo code constant");
assert.equal(promoLib.includes("STRIPE_"), false, "promo lib must not hardcode Stripe coupon ids");

console.log("fathers-day-promo-test: ok");
