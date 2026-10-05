import { readFileSync } from "node:fs";
import assert from "node:assert/strict";
import path from "node:path";

const ROOT = process.cwd();
const read = (relPath) => readFileSync(path.join(ROOT, relPath), "utf8");

function assertIncludes(content, needle, context) {
  assert.ok(content.includes(needle), `${context}: missing "${needle}"`);
}

function assertExcludes(content, needle, context) {
  assert.ok(!content.includes(needle), `${context}: must not include "${needle}"`);
}

function assertBefore(content, firstNeedle, laterNeedle, context) {
  const first = content.indexOf(firstNeedle);
  const later = content.indexOf(laterNeedle);
  assert.notEqual(first, -1, `${context}: missing "${firstNeedle}"`);
  assert.notEqual(later, -1, `${context}: missing "${laterNeedle}"`);
  assert.ok(first < later, `${context}: expected trust gate before entitlement lookup`);
}

function run() {
  const verifiedState = read("lib/security/verified-email-state.ts");
  assertIncludes(
    verifiedState,
    'if (process.env.NODE_ENV === "production") return null;',
    "trusted email cookie fails closed without a production signing secret"
  );
  assertIncludes(
    verifiedState,
    'proof: TrustedEmailProof',
    "trusted email minting requires an explicit proof source"
  );
  assertIncludes(
    verifiedState,
    "ageMs > VERIFIED_EMAIL_MAX_AGE_SEC * 1000",
    "trusted email replay is rejected after server-side expiry"
  );

  const billingSync = read("app/api/billing/sync/route.ts");
  assertIncludes(
    billingSync,
    "result.checkoutVerified && result.normalizedSessionEmail",
    "trusted billing identity requires Stripe-confirmed Checkout completion"
  );
  assertIncludes(
    billingSync,
    'attachTrustedEmailAccessState(res, result.normalizedSessionEmail, "stripe_checkout")',
    "Stripe checkout reconciliation may mint trusted billing identity"
  );
  const emailOnlyBranch = billingSync.slice(billingSync.indexOf("if (parsed.data.email)"));
  assertExcludes(
    emailOnlyBranch,
    "attachTrustedEmailAccessState",
    "typed billing-sync email cannot mint trusted identity"
  );

  const checkoutRoute = read("app/api/billing/checkout/route.ts");
  assertIncludes(
    checkoutRoute,
    "success_url: appendStripeCheckoutSessionPlaceholder(successUrl)",
    "subscriptions and credit packs both return a Stripe session proof"
  );

  const uploadForm = read("components/upload-form.tsx");
  assertIncludes(
    uploadForm,
    "if (!checkoutSuccess) return;",
    "every successful Checkout return enters billing sync"
  );
  assertIncludes(
    uploadForm,
    'fetch("/api/billing/sync"',
    "Checkout return exchanges Stripe session proof for trusted billing identity"
  );

  const songAccess = read("lib/song-architect/access.ts");
  assertIncludes(songAccess, "readVerifiedEmailState", "Song Architect reads signed identity");
  assertIncludes(
    songAccess,
    "billingLookupAllowed: emailContext.identityTrusted",
    "Song Architect paid lookup follows identity trust"
  );
  assertIncludes(
    songAccess,
    "return { rawEmail: fromHeader || fromQuery || fromHint, identityTrusted: false };",
    "Song Architect treats client email hints as untrusted"
  );
  assertExcludes(
    read("app/api/song-architect/access/route.ts"),
    "attachTrustedEmailAccessState",
    "Song Architect access route cannot mint trust from typed email"
  );

  const hitAccess = read("lib/ar-ai/access.ts");
  assertIncludes(hitAccess, "readVerifiedEmailState", "Hit Analyzer reads signed identity");
  assertIncludes(
    hitAccess,
    "billingLookupAllowed: emailContext.identityTrusted",
    "Hit Analyzer paid lookup follows identity trust"
  );
  assertIncludes(
    hitAccess,
    "return { rawEmail: fromHeader || fromQuery || fromHint, identityTrusted: false };",
    "Hit Analyzer treats client email hints as untrusted"
  );
  assertExcludes(
    read("app/api/ar-ai/route.ts"),
    "attachTrustedEmailAccessState",
    "Hit Analyzer cannot mint trust from submitted email"
  );

  const entitlementResolver = read("lib/subscriptions/resolve-entitlement-billing-context.ts");
  assertIncludes(
    entitlementResolver,
    "billingLookupAllowed: false, adminOverrideAllowed: false",
    "mastering headers and form hints cannot grant billing entitlements"
  );

  const entitlements = read("lib/subscriptions/entitlements.ts");
  assertIncludes(
    entitlements,
    "emailForBilling && billingLookupAllowed",
    "subscription lookup requires trusted billing identity"
  );
  assertIncludes(
    entitlements,
    "billingLookupAllowed ? await getCreditPackBalance(emailForBilling) : 0",
    "credit packs require trusted billing identity"
  );

  const captureEmail = read("app/api/capture-email/route.ts");
  assertExcludes(
    captureEmail,
    "attachTrustedEmailAccessState",
    "plain email capture cannot mint trusted identity"
  );
  assertIncludes(
    captureEmail,
    "emailVerifiedAt: emailIdentityTrusted ? new Date().toISOString() : null",
    "plain email capture does not mark identity verified"
  );

  const download = read("app/api/download/route.ts");
  assertExcludes(download, 'get("x-user-id")', "download rate identity rejects client x-user-id");
  assertExcludes(
    download,
    'get("x-authenticated-user-id")',
    "download rate identity rejects unauthenticated auth headers"
  );
  assertIncludes(
    download,
    "Boolean(masteredUnlock?.emailVerifiedAt)",
    "owner download bypass requires trusted unlock identity"
  );
  assertIncludes(
    download,
    "billingLookupAllowed: billingIdentityTrusted",
    "download paid lookup follows trusted unlock identity"
  );

  const adaptiveResolver = read("lib/billing/adaptive-resolve.ts");
  assertBefore(
    adaptiveResolver,
    "if (!billingIdentityTrusted)",
    "if (isAdminEntitlementOverrideEmail(normalized))",
    "Adaptive owner override requires trusted identity"
  );
  assertBefore(
    adaptiveResolver,
    "if (!billingIdentityTrusted)",
    "let ent = await getAdaptiveEntitlementByEmail(normalized);",
    "Adaptive DB entitlement lookup requires trusted identity"
  );
  assertBefore(
    adaptiveResolver,
    "if (!billingIdentityTrusted)",
    "reconcileAdaptiveEntitlementFromStripeByEmail(normalized)",
    "Adaptive Stripe-by-email recovery requires trusted identity"
  );

  const adaptiveAccess = read("app/api/adaptive-access/route.ts");
  assertIncludes(
    adaptiveAccess,
    "billingIdentityTrusted",
    "Adaptive access carries trusted identity state"
  );

  const adaptiveExport = read("app/api/adaptive/export-access/route.ts");
  assertIncludes(
    adaptiveExport,
    "if (syncResult.reconciled)",
    "matching Stripe checkout can elevate Adaptive billing identity"
  );
  assertIncludes(
    adaptiveExport,
    'attachTrustedEmailAccessState(res, emailNorm, "stripe_checkout")',
    "Adaptive checkout proof persists trusted identity"
  );

  console.log("identity trust invariants passed");
}

run();
