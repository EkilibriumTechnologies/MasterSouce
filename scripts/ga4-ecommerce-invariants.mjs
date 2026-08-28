/**
 * GA4 ecommerce purchase tracking invariants for MasterSauce.
 *
 * Covers Measurement Protocol client_id rules, invoice.paid purchase authority,
 * credit-pack purchases, begin_checkout non-blocking behavior, and test-mode isolation.
 */
import { readFileSync, existsSync } from "node:fs";
import assert from "node:assert/strict";
import path from "node:path";

import { isValidGa4ClientId, sanitizeGa4ClientId } from "@/lib/analytics/ga4-client-id";
import { GA4_ECOMMERCE_CATALOG } from "@/lib/analytics/ga4-ecommerce-catalog";
import {
  buildGa4PurchaseMpBody,
  debugValidateGa4PurchasePayload,
  sendGa4PurchaseEvent
} from "@/lib/analytics/ga4-server";
import {
  handleGa4CheckoutSessionCompleted,
  purchaseTypeFromInvoice,
  resolveGa4ClientIdFromCheckoutSession,
  resolveGa4ClientIdFromInvoice,
  trackGa4PurchaseFromPaidSubscriptionInvoice
} from "@/lib/analytics/stripe-ga4-purchase";
import { resolveBeginCheckoutCatalogId, trackGa4BeginCheckout } from "@/lib/analytics/gtag";

const ROOT = process.cwd();
const VALID_CLIENT_ID = "1234567890.1699999999";

function read(relPath) {
  return readFileSync(path.join(ROOT, relPath), "utf8");
}

function assertIncludes(content, needle, context) {
  assert.ok(content.includes(needle), `${context}: missing "${needle}"`);
}

function assertExcludes(content, needle, context) {
  assert.ok(!content.includes(needle), `${context}: must not include "${needle}"`);
}

function loadGa4EnvFromDotEnvLocal() {
  const envPath = path.join(ROOT, ".env.local");
  if (!existsSync(envPath)) return;
  const allowed = new Set(["NEXT_PUBLIC_GA_MEASUREMENT_ID", "GA4_MEASUREMENT_API_SECRET"]);
  const text = readFileSync(envPath, "utf8");
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const eq = line.indexOf("=");
    if (eq <= 0) continue;
    const key = line.slice(0, eq).trim();
    const value = line.slice(eq + 1).trim();
    if (!allowed.has(key) || !key || process.env[key]) continue;
    process.env[key] = value;
  }
}

function collectPurchases() {
  const purchases = [];
  const sendPurchase = async (params) => {
    purchases.push(params);
  };
  return { purchases, sendPurchase };
}

function subscriptionInvoice({
  id,
  planId,
  amountPaid,
  billingReason,
  clientId = VALID_CLIENT_ID,
  livemode = true
}) {
  return {
    id,
    object: "invoice",
    livemode,
    amount_paid: amountPaid,
    currency: "usd",
    billing_reason: billingReason,
    customer: "cus_test_customer",
    metadata: {},
    parent: {
      type: "subscription_details",
      quote_details: null,
      subscription_details: {
        subscription: `sub_${planId}`,
        metadata: {
          ga_client_id: clientId,
          plan_id: planId,
          product_type: "subscription"
        }
      }
    },
    lines: { data: [], object: "list", has_more: false, url: "" }
  };
}

function creditPackSession({
  clientId = VALID_CLIENT_ID,
  livemode = true,
  paymentIntent = "pi_credit_pack_1"
} = {}) {
  return {
    id: "cs_test_credit_pack",
    object: "checkout.session",
    mode: "payment",
    payment_status: "paid",
    livemode,
    amount_total: 400,
    currency: "usd",
    payment_intent: paymentIntent,
    customer: "cus_test_customer",
    metadata: {
      product_type: "credit_pack",
      ga_client_id: clientId
    }
  };
}

function subscriptionCheckoutSession({
  planId = "creator_monthly",
  clientId = VALID_CLIENT_ID,
  livemode = true
} = {}) {
  return {
    id: "cs_test_subscription",
    object: "checkout.session",
    mode: "subscription",
    payment_status: "paid",
    livemode,
    amount_total: planId === "pro_studio_monthly" ? 2400 : 900,
    currency: "usd",
    customer: "cus_test_customer",
    metadata: {
      product_type: "subscription",
      plan_id: planId,
      ga_client_id: clientId
    }
  };
}

function runSourceInvariants() {
  const purchase = read("lib/analytics/stripe-ga4-purchase.ts");
  assertExcludes(purchase, "stripe_checkout_", "purchase helper must not synthesize stripe_checkout_ client ids");
  assertExcludes(purchase, "stripe_invoice_", "purchase helper must not synthesize stripe_invoice_ client ids");
  assert.ok(
    !purchase.includes('c.startsWith("cus_") return c') && !purchase.includes('startsWith("cus_") return c'),
    "purchase helper must not use Stripe customer ids as GA4 client_id"
  );
  assertIncludes(purchase, "invoice.id", "subscription purchase transaction_id is invoice.id");
  assertIncludes(purchase, "subscription_started", "checkout completion may emit non-revenue subscription_started");
  assertIncludes(purchase, "missing_ga_client_id", "missing client_id is logged, not invented");

  const webhook = read("app/api/billing/webhook/route.ts");
  assertIncludes(webhook, "handleGa4CheckoutSessionCompleted", "webhook uses checkout GA4 handler");
  assertIncludes(webhook, 'event.type === "invoice.paid"', "purchase path is invoice.paid only");
  assertExcludes(
    webhook,
    "invoice.paid || event.type === \"invoice.payment_succeeded\"",
    "payment_succeeded must not also send GA4 purchase"
  );

  const ga4Server = read("lib/analytics/ga4-server.ts");
  assertIncludes(ga4Server, "GA4_MEASUREMENT_API_SECRET", "server sender reads Measurement Protocol secret");
  assertIncludes(ga4Server, "NEXT_PUBLIC_GA_MEASUREMENT_ID", "server sender reads measurement id from env");
  assertIncludes(ga4Server, "api_secret=REDACTED", "API secret is redacted from error logs");
  assertExcludes(ga4Server, "console.log(apiSecret", "API secret must never be logged");

  const checkout = read("app/api/billing/checkout/route.ts");
  assertIncludes(checkout, "sanitizeGa4ClientId", "checkout sanitizes browser-provided client_id");
  assertIncludes(checkout, "ga_client_id", "checkout persists client_id on Stripe metadata");

  const pricing = read("components/pricing-section.tsx");
  assertIncludes(pricing, "trackGa4BeginCheckout", "pricing fires begin_checkout");
  assertIncludes(pricing, "begin_checkout must never block Stripe Checkout", "pricing begin_checkout is non-blocking");

  const adaptive = read("components/adaptive-export-gate.tsx");
  assertIncludes(adaptive, "trackGa4BeginCheckout", "adaptive gate fires begin_checkout");

  const envExample = read(".env.example");
  assertIncludes(envExample, "GA4_MEASUREMENT_API_SECRET", ".env.example documents Measurement Protocol secret");
  assertIncludes(envExample, "Railway", ".env.example documents Railway as runtime config");

  const plans = read("lib/subscriptions/plans.ts");
  assertIncludes(plans, "monthlyPriceUsd: 9", "creator catalog price source");
  assertIncludes(plans, "monthlyPriceUsd: 24", "pro catalog price source");
  const catalog = read("lib/analytics/ga4-ecommerce-catalog.ts");
  assertIncludes(catalog, "price: 9", "begin_checkout Creator catalog matches $9");
  assertIncludes(catalog, "price: 24", "begin_checkout Pro Studio catalog matches $24");
  assertIncludes(catalog, "price: CREDIT_PACK_CATALOG_PRICE_USD", "begin_checkout credit pack uses $4 catalog");
}

async function runClientIdTests() {
  assert.equal(isValidGa4ClientId(VALID_CLIENT_ID), true, "real gtag client_id is accepted");
  assert.equal(sanitizeGa4ClientId(VALID_CLIENT_ID), VALID_CLIENT_ID, "real gtag client_id is unchanged");
  assert.equal(sanitizeGa4ClientId("cus_abc123"), null, "cus_... is rejected");
  assert.equal(isValidGa4ClientId("cus_abc123"), false, "cus_... is not a valid GA client_id");
  assert.equal(sanitizeGa4ClientId("stripe_checkout_cs_test"), null, "stripe_checkout_... is rejected");
  assert.equal(isValidGa4ClientId("stripe_checkout_cs_test"), false, "stripe_checkout_... is not valid");
  assert.equal(resolveGa4ClientIdFromCheckoutSession(subscriptionCheckoutSession({ clientId: "cus_abc" })), null);
  assert.equal(
    resolveGa4ClientIdFromInvoice(subscriptionInvoice({ id: "in_x", planId: "creator_monthly", amountPaid: 900, billingReason: "subscription_create", clientId: "cus_abc" })),
    null
  );
}

async function runPurchasePathTests() {
  const creator = collectPurchases();
  await trackGa4PurchaseFromPaidSubscriptionInvoice(
    subscriptionInvoice({
      id: "in_creator_initial",
      planId: "creator_monthly",
      amountPaid: 900,
      billingReason: "subscription_create"
    }),
    { sendPurchase: creator.sendPurchase }
  );
  assert.equal(creator.purchases.length, 1, "1. Creator initial invoice sends one purchase");
  assert.equal(creator.purchases[0].transactionId, "in_creator_initial");
  assert.equal(creator.purchases[0].value, 9);
  assert.equal(creator.purchases[0].currency, "usd");
  assert.equal(creator.purchases[0].purchaseType, "initial_subscription");
  assert.equal(creator.purchases[0].items[0].itemId, "creator_monthly");
  assert.equal(creator.purchases[0].items[0].itemName, GA4_ECOMMERCE_CATALOG.creator_monthly.itemName);
  assert.equal(creator.purchases[0].clientId, VALID_CLIENT_ID);

  const pro = collectPurchases();
  await trackGa4PurchaseFromPaidSubscriptionInvoice(
    subscriptionInvoice({
      id: "in_pro_initial",
      planId: "pro_studio_monthly",
      amountPaid: 2400,
      billingReason: "subscription_create"
    }),
    { sendPurchase: pro.sendPurchase }
  );
  assert.equal(pro.purchases.length, 1, "2. Pro Studio initial invoice sends one purchase");
  assert.equal(pro.purchases[0].transactionId, "in_pro_initial");
  assert.equal(pro.purchases[0].value, 24);
  assert.equal(pro.purchases[0].items[0].itemId, "pro_studio_monthly");
  assert.equal(pro.purchases[0].purchaseType, "initial_subscription");

  const creatorRenewal = collectPurchases();
  await trackGa4PurchaseFromPaidSubscriptionInvoice(
    subscriptionInvoice({
      id: "in_creator_renewal",
      planId: "creator_monthly",
      amountPaid: 900,
      billingReason: "subscription_cycle"
    }),
    { sendPurchase: creatorRenewal.sendPurchase }
  );
  assert.equal(creatorRenewal.purchases.length, 1, "3. Creator renewal sends one purchase");
  assert.equal(creatorRenewal.purchases[0].transactionId, "in_creator_renewal");
  assert.equal(creatorRenewal.purchases[0].purchaseType, "renewal");
  assert.equal(creatorRenewal.purchases[0].clientId, VALID_CLIENT_ID);

  const proRenewal = collectPurchases();
  await trackGa4PurchaseFromPaidSubscriptionInvoice(
    subscriptionInvoice({
      id: "in_pro_renewal",
      planId: "pro_studio_monthly",
      amountPaid: 2400,
      billingReason: "subscription_cycle"
    }),
    { sendPurchase: proRenewal.sendPurchase }
  );
  assert.equal(proRenewal.purchases.length, 1, "4. Pro renewal sends one purchase");
  assert.equal(proRenewal.purchases[0].transactionId, "in_pro_renewal");
  assert.equal(proRenewal.purchases[0].purchaseType, "renewal");
  assert.notEqual(proRenewal.purchases[0].transactionId, "in_pro_initial");

  const credit = collectPurchases();
  await handleGa4CheckoutSessionCompleted(creditPackSession(), {
    sendPurchase: credit.sendPurchase,
    sendCustomEvent: async () => {}
  });
  assert.equal(credit.purchases.length, 1, "5. Credit-pack purchase sends one purchase");
  assert.equal(credit.purchases[0].transactionId, "pi_credit_pack_1");
  assert.equal(credit.purchases[0].value, 4);
  assert.equal(credit.purchases[0].purchaseType, "credit_pack");
  assert.equal(credit.purchases[0].items[0].itemId, "credit_pack");
}

async function runDedupAndSafetyTests() {
  const both = collectPurchases();
  const session = subscriptionCheckoutSession();
  const invoice = subscriptionInvoice({
    id: "in_creator_initial",
    planId: "creator_monthly",
    amountPaid: 900,
    billingReason: "subscription_create"
  });
  await handleGa4CheckoutSessionCompleted(session, {
    sendPurchase: both.sendPurchase,
    sendCustomEvent: async () => {}
  });
  await trackGa4PurchaseFromPaidSubscriptionInvoice(invoice, { sendPurchase: both.sendPurchase });
  assert.equal(both.purchases.length, 1, "11. checkout.session.completed + invoice.paid does not double-count");
  assert.equal(both.purchases[0].transactionId, "in_creator_initial");

  const retry = collectPurchases();
  await trackGa4PurchaseFromPaidSubscriptionInvoice(invoice, { sendPurchase: retry.sendPurchase });
  await trackGa4PurchaseFromPaidSubscriptionInvoice(invoice, { sendPurchase: retry.sendPurchase });
  assert.equal(retry.purchases.length, 2, "retry may re-deliver but transaction_id stays stable");
  assert.equal(retry.purchases[0].transactionId, retry.purchases[1].transactionId, "12. retry preserves transaction_id");
  assert.equal(retry.purchases[0].transactionId, "in_creator_initial");

  const missingClient = collectPurchases();
  await trackGa4PurchaseFromPaidSubscriptionInvoice(
    subscriptionInvoice({
      id: "in_legacy",
      planId: "creator_monthly",
      amountPaid: 900,
      billingReason: "subscription_cycle",
      clientId: ""
    }),
    { sendPurchase: missingClient.sendPurchase }
  );
  assert.equal(missingClient.purchases.length, 0, "9. missing GA client_id does not send purchase");

  await trackGa4PurchaseFromPaidSubscriptionInvoice(
    subscriptionInvoice({
      id: "in_sender_throws",
      planId: "creator_monthly",
      amountPaid: 900,
      billingReason: "subscription_create"
    }),
    {
      sendPurchase: async () => {
        throw new Error("measurement protocol down");
      }
    }
  );

  const testMode = collectPurchases();
  await trackGa4PurchaseFromPaidSubscriptionInvoice(
    subscriptionInvoice({
      id: "in_test",
      planId: "creator_monthly",
      amountPaid: 900,
      billingReason: "subscription_create",
      livemode: false
    }),
    { sendPurchase: testMode.sendPurchase }
  );
  await handleGa4CheckoutSessionCompleted(creditPackSession({ livemode: false }), {
    sendPurchase: testMode.sendPurchase,
    sendCustomEvent: async () => {}
  });
  assert.equal(testMode.purchases.length, 2, "test-mode objects still reach the sender with livemode false");
  assert.ok(testMode.purchases.every((p) => p.livemode === false));

  const origFetch = globalThis.fetch;
  let fetchCalls = 0;
  globalThis.fetch = async () => {
    fetchCalls += 1;
    return new Response("", { status: 204 });
  };
  const prevSecret = process.env.GA4_MEASUREMENT_API_SECRET;
  const prevMid = process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID;
  try {
    process.env.GA4_MEASUREMENT_API_SECRET = "unit-test-secret";
    process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID = "G-8QY8VTBLHP";
    await sendGa4PurchaseEvent({
      clientId: VALID_CLIENT_ID,
      transactionId: "in_test_mode",
      value: 9,
      currency: "usd",
      livemode: false,
      items: [{ itemId: "creator_monthly", itemName: "Creator", price: 9, quantity: 1 }]
    });
    assert.equal(fetchCalls, 0, "13. Stripe test-mode objects cannot create production GA revenue");

    delete process.env.GA4_MEASUREMENT_API_SECRET;
    await sendGa4PurchaseEvent({
      clientId: VALID_CLIENT_ID,
      transactionId: "in_no_secret",
      value: 9,
      currency: "usd",
      livemode: true,
      items: [{ itemId: "creator_monthly", itemName: "Creator", price: 9, quantity: 1 }]
    });
    assert.equal(fetchCalls, 0, "10. missing Measurement Protocol secret does not send and does not throw");
  } finally {
    globalThis.fetch = origFetch;
    if (prevSecret === undefined) delete process.env.GA4_MEASUREMENT_API_SECRET;
    else process.env.GA4_MEASUREMENT_API_SECRET = prevSecret;
    if (prevMid === undefined) delete process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID;
    else process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID = prevMid;
  }

  assert.equal(purchaseTypeFromInvoice({ billing_reason: "subscription_create" }), "initial_subscription");
  assert.equal(purchaseTypeFromInvoice({ billing_reason: "subscription_cycle" }), "renewal");
}

async function runBeginCheckoutTests() {
  assert.equal(resolveBeginCheckoutCatalogId({ kind: "subscription", planId: "creator_monthly" }), "creator_monthly");
  assert.equal(resolveBeginCheckoutCatalogId({ kind: "subscription", planId: "pro_studio_monthly" }), "pro_studio_monthly");
  assert.equal(resolveBeginCheckoutCatalogId({ kind: "credit_pack" }), "credit_pack");

  const prev = globalThis.window;
  process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID = process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID || "G-8QY8VTBLHP";
  globalThis.window = {
    gtag: () => {
      throw new Error("gtag exploded");
    }
  };
  try {
    trackGa4BeginCheckout("creator_monthly");
    trackGa4BeginCheckout("pro_studio_monthly");
    trackGa4BeginCheckout("credit_pack");
  } catch (err) {
    assert.fail(`14. begin_checkout must not throw: ${err instanceof Error ? err.message : String(err)}`);
  } finally {
    if (prev === undefined) delete globalThis.window;
    else globalThis.window = prev;
  }
}

async function runPayloadShapeTests() {
  const body = buildGa4PurchaseMpBody({
    clientId: VALID_CLIENT_ID,
    transactionId: "in_creator_initial",
    value: 9,
    currency: "usd",
    livemode: true,
    purchaseType: "initial_subscription",
    items: [{ itemId: "creator_monthly", itemName: "Creator", price: 9, quantity: 1 }]
  });
  assert.ok(body, "purchase payload builds");
  assert.equal(body.client_id, VALID_CLIENT_ID);
  assert.equal(body.events[0].name, "purchase");
  assert.equal(body.events[0].params.currency, "USD");
  assert.equal(body.events[0].params.value, 9);
  assert.equal(buildGa4PurchaseMpBody({
    clientId: "cus_abc",
    transactionId: "in_x",
    value: 9,
    currency: "usd",
    livemode: true,
    items: [{ itemName: "Creator", price: 9, quantity: 1 }]
  }), null, "synthetic cus_ client_id cannot build a purchase payload");
}

async function runMeasurementProtocolDebugValidation() {
  loadGa4EnvFromDotEnvLocal();
  const cases = [
    {
      label: "Creator purchase",
      params: {
        clientId: VALID_CLIENT_ID,
        transactionId: "in_debug_creator",
        value: 9,
        currency: "usd",
        livemode: true,
        purchaseType: "initial_subscription",
        items: [{ itemId: "creator_monthly", itemName: "Creator", price: 9, quantity: 1 }]
      }
    },
    {
      label: "Pro Studio purchase",
      params: {
        clientId: VALID_CLIENT_ID,
        transactionId: "in_debug_pro",
        value: 24,
        currency: "usd",
        livemode: true,
        purchaseType: "initial_subscription",
        items: [{ itemId: "pro_studio_monthly", itemName: "Pro Studio", price: 24, quantity: 1 }]
      }
    },
    {
      label: "Renewal purchase",
      params: {
        clientId: VALID_CLIENT_ID,
        transactionId: "in_debug_renewal",
        value: 9,
        currency: "usd",
        livemode: true,
        purchaseType: "renewal",
        items: [{ itemId: "creator_monthly", itemName: "Creator", price: 9, quantity: 1 }]
      }
    },
    {
      label: "Credit-pack purchase",
      params: {
        clientId: VALID_CLIENT_ID,
        transactionId: "pi_debug_credit",
        value: 4,
        currency: "usd",
        livemode: true,
        purchaseType: "credit_pack",
        items: [{ itemId: "credit_pack", itemName: "MasterSauce Credit Pack", price: 4, quantity: 1 }]
      }
    }
  ];

  const hasSecret = Boolean((process.env.GA4_MEASUREMENT_API_SECRET ?? "").trim());
  const hasMeasurementId = Boolean((process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID ?? "").trim());
  console.log("[ga4-mp-debug] env", { hasMeasurementId, hasApiSecret: hasSecret });

  if (!hasSecret || !hasMeasurementId) {
    console.log("[ga4-mp-debug] skipped live debug endpoint (Measurement Protocol secret or measurement id not available in this environment)");
    return { skipped: true };
  }

  const results = [];
  for (const testCase of cases) {
    const result = await debugValidateGa4PurchasePayload(testCase.params);
    console.log("[ga4-mp-debug]", testCase.label, {
      skipped: result.skipped,
      skipReason: result.skipReason ?? null,
      status: result.status ?? null,
      validationMessages: result.validationMessages
    });
    results.push({ label: testCase.label, ...result });
  }
  return { skipped: false, results };
}

async function run() {
  runSourceInvariants();
  await runClientIdTests();
  await runPurchasePathTests();
  await runDedupAndSafetyTests();
  await runBeginCheckoutTests();
  await runPayloadShapeTests();
  const debug = await runMeasurementProtocolDebugValidation();
  console.log("ga4 ecommerce invariants passed");
  if (debug.skipped) {
    console.log("ga4 mp debug validation: skipped");
  }
}

await run();
