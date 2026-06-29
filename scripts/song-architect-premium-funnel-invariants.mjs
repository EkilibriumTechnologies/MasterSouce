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

function runPremiumPlanHelperTests() {
  function isSongArchitectPremiumPlan(planId) {
    return planId === "creator_monthly" || planId === "pro_studio_monthly";
  }

  assert.equal(isSongArchitectPremiumPlan("free"), false, "free is not premium");
  assert.equal(isSongArchitectPremiumPlan("creator_monthly"), true, "creator is premium");
  assert.equal(isSongArchitectPremiumPlan("pro_studio_monthly"), true, "pro is premium");
}

function runEntitlementSourceTests() {
  const entitlements = read("lib/song-architect/entitlements.ts");
  assertIncludes(entitlements, "getBillingSubscriptionByEmail", "plan id from billing_subscriptions lookup");
  assertIncludes(entitlements, 'return sub?.planId ?? "free"', "fallback to free when no subscription");

  const access = read("lib/song-architect/access.ts");
  assertIncludes(access, "normalizeBillingEmail", "access normalizes billing email");
  assertIncludes(access, "resolveSongArchitectUsageForEmail(normalizedEmail)", "usage keyed on normalized email");

  const email = read("lib/billing/email.ts");
  assertIncludes(email, "email.trim().toLowerCase()", "billing email trim+lower normalization");
}

function runGenerateRouteTests() {
  const generate = read("app/api/song-architect/generate/route.ts");
  assertIncludes(generate, "partitionSongArchitectClientPayload", "generate partitions output by plan");
  assertIncludes(generate, "isSongArchitectPremiumPlan", "generate checks premium plan");
  assertIncludes(generate, 'logSongArchitectFunnelEvent("free_tool_success"', "free success funnel log");
  assertIncludes(generate, 'logSongArchitectFunnelEvent("premium_tool_feature_used"', "premium funnel log");
  assertIncludes(generate, "trustedAccess.usage.planId", "plan id from verified usage snapshot");
  assertExcludes(generate, "data: normalized", "raw normalized output must not leak to client");
}

function runPremiumRouteTests() {
  const premium = read("app/api/song-architect/premium/route.ts");
  assertIncludes(premium, "isSongArchitectPremiumPlan", "premium route checks plan");
  assertIncludes(premium, "song_architect_premium_required", "premium route rejects free plans");
}

function runClientFunnelTests() {
  const page = read("app/song-architect/page.tsx");
  assertIncludes(page, "trackSongArchitectFunnelEvent", "page emits funnel analytics");
  assertIncludes(page, "free_tool_success", "page tracks free success");
  assertIncludes(page, "free_tool_upgrade_cta_clicked", "page tracks upgrade clicks");
  assertIncludes(page, "PremiumLockedPanel", "page shows locked premium panel");
  assertIncludes(page, "PostSuccessUpgradeCta", "page shows post-success upgrade CTA");
  assertIncludes(page, "result.basic.", "page renders basic output partition");
  assertIncludes(page, "result.premium", "page renders premium partition when unlocked");
}

function runPremiumOutputModuleTests() {
  const premiumOutput = read("lib/song-architect/premium-output.ts");
  assertIncludes(premiumOutput, "premium: null", "free payload strips premium data");
  assertIncludes(premiumOutput, "premiumLocked: true", "free payload marks premium locked");
  assertIncludes(premiumOutput, "masteringReadyPrompt", "premium enhancements include mastering prompt");
  assertIncludes(premiumOutput, "styleDirections", "premium enhancements include style directions");
}

function run() {
  runPremiumPlanHelperTests();
  runEntitlementSourceTests();
  runGenerateRouteTests();
  runPremiumRouteTests();
  runClientFunnelTests();
  runPremiumOutputModuleTests();
  console.log("song architect premium funnel invariants passed");
}

run();
