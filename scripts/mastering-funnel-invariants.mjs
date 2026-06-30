/**
 * Mastering funnel analytics invariants.
 *
 * Funnel conversion queries (GA4 Exploration or BigQuery export):
 *
 * 1. Upload → preview:  count(mastering_preview_succeeded) / count(mastering_upload_succeeded)
 * 2. Preview → download click: count(mastering_download_clicked) / count(mastering_preview_succeeded)
 * 3. Download gate → checkout: count(mastering_checkout_started) / count(mastering_export_gate_viewed)
 * 4. Checkout started → completed:
 *    count(mastering_credit_pack_purchase_completed + mastering_subscription_detected)
 *    / count(mastering_checkout_started)
 *    (server logs) OR GA4 `purchase` events / mastering_checkout_started (client)
 * 5. Credit purchase → consume:
 *    count(mastering_credit_consumed) / count(mastering_credit_pack_purchase_completed)
 * 6. Unused credits: count(mastering_user_has_unused_credits) grouped by credit_balance
 *
 * Server funnel logs: filter CloudWatch/Vercel logs for `[mastering] funnel_event`.
 */
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

function assertExcludes(content, needle, context) {
  assert.ok(!content.includes(needle), `${context}: must not include "${needle}"`);
}

const CLIENT_EVENTS = [
  "mastering_upload_started",
  "mastering_upload_succeeded",
  "mastering_upload_failed",
  "mastering_preview_started",
  "mastering_preview_succeeded",
  "mastering_preview_failed",
  "mastering_ab_viewed",
  "mastering_preview_played",
  "mastering_download_clicked",
  "mastering_export_gate_viewed",
  "mastering_credit_pack_cta_viewed",
  "mastering_credit_pack_cta_clicked",
  "mastering_subscription_cta_viewed",
  "mastering_subscription_cta_clicked",
  "mastering_checkout_started"
];

const SERVER_EVENTS = [
  "mastering_preview_api_started",
  "mastering_preview_api_succeeded",
  "mastering_preview_api_failed",
  "mastering_download_allowed",
  "mastering_download_blocked",
  "mastering_checkout_session_created",
  "mastering_credit_pack_purchase_completed",
  "mastering_credit_consumed",
  "mastering_subscription_detected",
  "mastering_user_has_unused_credits"
];

const FORBIDDEN_LOG_SNIPPETS = [
  "payment_intent:",
  "client_secret:",
  "stripePayload:",
  "audio_url:",
  "downloadUrl:",
  "filePath:"
];

function runAnalyticsModuleTests() {
  const analytics = read("lib/analytics/mastering-funnel.ts");
  for (const event of [...CLIENT_EVENTS, ...SERVER_EVENTS]) {
    assertIncludes(analytics, `"${event}"`, "mastering-funnel event union");
  }
  assertIncludes(analytics, "normalizeBillingEmail", "email uses trim+lower via normalizeBillingEmail");
  assertIncludes(analytics, "FORBIDDEN_LOG_KEYS", "sanitizer blocks sensitive keys");
  assertIncludes(analytics, "MASTERING_SOURCE_FLOW", "source_flow convention");
}

function runClientInstrumentationTests() {
  const upload = read("components/upload-form.tsx");
  assertIncludes(upload, "trackMasteringFunnelEvent", "upload form emits funnel events");
  assertIncludes(upload, "mastering_upload_started", "upload started event");
  assertIncludes(upload, "mastering_preview_started", "preview started event");
  assertIncludes(upload, "mastering_download_clicked", "download click event");

  const audioCompare = read("components/audio-compare.tsx");
  assertIncludes(audioCompare, "mastering_ab_viewed", "ab viewed event");
  assertIncludes(audioCompare, "mastering_preview_played", "preview played event");

  const emailGate = read("components/email-capture-form.tsx");
  assertIncludes(emailGate, "mastering_export_gate_viewed", "email export gate viewed");

  const adaptiveGate = read("components/adaptive-export-gate.tsx");
  assertIncludes(adaptiveGate, "mastering_checkout_started", "adaptive checkout started");

  const pricing = read("components/pricing-section.tsx");
  assertIncludes(pricing, "mastering_credit_pack_cta_clicked", "credit pack click");
  assertIncludes(pricing, "mastering_subscription_cta_clicked", "subscription click");
}

function runServerInstrumentationTests() {
  const master = read("app/api/master/route.ts");
  assertIncludes(master, "logMasteringFunnelEvent", "master route logs funnel");
  assertIncludes(master, "mastering_preview_api_started", "master preview started log");

  const download = read("app/api/download/route.ts");
  assertIncludes(download, "mastering_download_blocked", "download blocked log");
  assertIncludes(download, "mastering_download_allowed", "download allowed log");

  const checkout = read("app/api/billing/checkout/route.ts");
  assertIncludes(checkout, "mastering_checkout_session_created", "checkout session log");
  assertIncludes(checkout, "getStripePriceIdForPlan", "checkout price resolution unchanged");

  const webhook = read("app/api/billing/webhook/route.ts");
  assertIncludes(webhook, "mastering_credit_pack_purchase_completed", "credit pack purchase log");
  assertIncludes(webhook, "mastering_subscription_detected", "subscription detected log");

  const entitlements = read("lib/subscriptions/entitlements.ts");
  assertIncludes(entitlements, "mastering_credit_consumed", "credit consume log only around ledger");
  assertIncludes(entitlements, 'reason: "credit_pack_consume"', "credit consume reason unchanged");
  assertIncludes(entitlements, "delta: -1", "credit delta unchanged");
}

function runBillingUnchangedTests() {
  const plans = read("lib/subscriptions/plans.ts");
  assertIncludes(plans, "monthlyPriceUsd: 9", "creator price unchanged");
  assertIncludes(plans, "monthlyPriceUsd: 24", "pro studio price unchanged");
  assertIncludes(plans, "monthlyMastersLimit: 1", "free wav quota unchanged");

  const stripe = read("lib/stripe/server.ts");
  assertIncludes(stripe, "getStripePriceIdForPlan", "stripe price helpers intact");
  assertIncludes(stripe, "getStripeCreditPackPriceId", "credit pack price helper intact");

  const webhook = read("app/api/billing/webhook/route.ts");
  assertIncludes(webhook, "delta: 5", "credit pack purchase delta unchanged");
  assertIncludes(webhook, 'reason: "credit_pack_purchase"', "credit pack purchase reason unchanged");
}

function runNoSensitiveLoggingTests() {
  const analytics = read("lib/analytics/mastering-funnel.ts");
  for (const snippet of FORBIDDEN_LOG_SNIPPETS) {
    assertExcludes(analytics, snippet, "analytics module must not log sensitive fields");
  }
  const download = read("app/api/download/route.ts");
  assertIncludes(download, "logMasteringDownloadBlocked", "download uses safe funnel helpers");
  assertIncludes(download, "gate_reason", "download blocked includes gate_reason");
}

function run() {
  runAnalyticsModuleTests();
  runClientInstrumentationTests();
  runServerInstrumentationTests();
  runBillingUnchangedTests();
  runNoSensitiveLoggingTests();
  console.log("mastering funnel invariants passed");
}

run();
