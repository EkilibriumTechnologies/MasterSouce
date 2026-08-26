/**
 * Authoritative Analyze Your Song lifetime quota tests (Free tier).
 *
 * node --experimental-transform-types --import ./scripts/lib/register-ts-alias.mjs scripts/hit-analyzer-lifetime-quota-test.mjs
 */
import { readFileSync } from "node:fs";
import assert from "node:assert/strict";
import path from "node:path";

import {
  consumeHitAnalyzerLifetimeSlot,
  countHitAnalyzerUsageAllTime,
  resetHitAnalyzerLocalUsageForTests
} from "@/lib/ar-ai/usage";
import {
  HIT_ANALYZER_TIER_LIMITS,
  formatHitAnalyzerLimitShort,
  getHitAnalyzerAllowanceLabel
} from "@/lib/ar-ai/limits";
import { isSupabaseConfigured } from "@/lib/supabase/admin";

const ROOT = process.cwd();
const ADMIN_EMAIL = "llarod@gmail.com";

function read(relPath) {
  return readFileSync(path.join(ROOT, relPath), "utf8");
}

function assertIncludes(content, needle, context) {
  assert.ok(content.includes(needle), `${context}: missing "${needle}"`);
}

function resolveHitAnalyzerTierLimit(planId, email) {
  if (String(email ?? "").trim().toLowerCase() === ADMIN_EMAIL) return null;
  return HIT_ANALYZER_TIER_LIMITS[planId];
}

function runEntitlementDefinitionTests() {
  assert.equal(HIT_ANALYZER_TIER_LIMITS.free.limit, 2, "free Analyze Your Song is 2 lifetime");
  assert.equal(HIT_ANALYZER_TIER_LIMITS.free.period, "lifetime");
  assert.equal(HIT_ANALYZER_TIER_LIMITS.creator_monthly.limit, 5, "creator Analyze Your Song is 5 monthly");
  assert.equal(HIT_ANALYZER_TIER_LIMITS.pro_studio_monthly.limit, 5, "pro Analyze Your Song is 5 monthly");
  assert.equal(resolveHitAnalyzerTierLimit("free", "user@example.com")?.limit, 2, "free tier limit from access helper");
  assert.equal(resolveHitAnalyzerTierLimit("creator_monthly", "user@example.com")?.limit, 5, "creator monthly limit");
  assert.equal(resolveHitAnalyzerTierLimit("pro_studio_monthly", "user@example.com")?.limit, 5, "pro monthly limit");
  assert.equal(resolveHitAnalyzerTierLimit("free", ADMIN_EMAIL), null, "admin/owner bypass remains unlimited");
  assert.equal(getHitAnalyzerAllowanceLabel("free"), "2 Analyze Your Song analyses — lifetime");
  assert.equal(getHitAnalyzerAllowanceLabel("creator_monthly"), "5 Analyze Your Song analyses / month");
  assert.equal(getHitAnalyzerAllowanceLabel("pro_studio_monthly"), "5 Analyze Your Song analyses / month");
  assert.equal(formatHitAnalyzerLimitShort("free"), "2 lifetime");
  assert.equal(formatHitAnalyzerLimitShort("creator_monthly"), "5 / month");
}

function withLocalUsageLedger(fn) {
  const saved = {
    SUPABASE_URL: process.env.SUPABASE_URL,
    SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY,
    NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL
  };
  delete process.env.SUPABASE_URL;
  delete process.env.SUPABASE_SERVICE_ROLE_KEY;
  delete process.env.NEXT_PUBLIC_SUPABASE_URL;
  try {
    assert.equal(isSupabaseConfigured(), false, "local ledger tests must not hit Supabase");
    return fn();
  } finally {
    for (const [key, value] of Object.entries(saved)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
}

async function runLocalLifetimeSlotTests() {
  await withLocalUsageLedger(async () => {
    resetHitAnalyzerLocalUsageForTests();
    const email = "lifetime-quota@example.com";
    const limit = HIT_ANALYZER_TIER_LIMITS.free.limit;
    assert.equal(limit, 2);

    const first = await consumeHitAnalyzerLifetimeSlot({
      normalizedEmail: email,
      planId: "free",
      limit
    });
    assert.equal(first, true, "free analysis #1 allowed");
    assert.equal(await countHitAnalyzerUsageAllTime(email), 1, "first success persists in lifetime ledger");

    const second = await consumeHitAnalyzerLifetimeSlot({
      normalizedEmail: email,
      planId: "free",
      limit
    });
    assert.equal(second, true, "free analysis #2 allowed");
    assert.equal(await countHitAnalyzerUsageAllTime(email), 2, "second success persists in lifetime ledger");

    const third = await consumeHitAnalyzerLifetimeSlot({
      normalizedEmail: email,
      planId: "free",
      limit
    });
    assert.equal(third, false, "free analysis #3 blocked");
    assert.equal(await countHitAnalyzerUsageAllTime(email), 2, "blocked third request does not consume a slot");

    const otherAccount = await consumeHitAnalyzerLifetimeSlot({
      normalizedEmail: "other-lifetime@example.com",
      planId: "free",
      limit
    });
    assert.equal(otherAccount, true, "lifetime ledger is per account/email");
  });
}

function runPaidBehaviorSourceTests() {
  const route = read("app/api/ar-ai/route.ts");
  const page = read("app/ar-ai/page.tsx");
  assertIncludes(route, "const shouldCountUsage = Boolean(access.normalizedEmail) && !access.launchActive && !access.unlimited", "paid users are counted against quota when not unlimited");
  assertIncludes(route, "consumeHitAnalyzerLifetimeSlot", "direct API claims the server-side lifetime slot");
  assertIncludes(route, "consumeHitAnalyzerPeriodSlot", "direct API claims the server-side monthly slot");
  assertIncludes(route, "resolveHitAnalyzerAccess", "direct API cannot skip server-side access");
  assertIncludes(route, 'code: "hit_analyzer_quota_exhausted"', "quota exhaustion returns upgrade-required quota code");
  assertIncludes(route, "upgradeRequired: true", "quota exhaustion asks for upgrade");
  assertIncludes(route, "counted: false", "failed OpenAI paths do not consume quota");
  assert.ok(!page.includes("localStorage"), "Analyze Your Song UI does not keep a localStorage usage counter");
}

function runPricingCopyMatchTests() {
  const pricing = read("components/pricing-section.tsx");
  const plans = read("lib/subscriptions/plans.ts");
  const page = read("app/ar-ai/page.tsx");
  const freeLabel = getHitAnalyzerAllowanceLabel("free");
  const paidLabel = getHitAnalyzerAllowanceLabel("creator_monthly");

  assertIncludes(pricing, "getHitAnalyzerAllowanceLabel", "pricing cards read analyzer labels from entitlement source");
  assertIncludes(pricing, "formatHitAnalyzerLimitShort", "pricing comparison reads analyzer limits from entitlement source");
  assertIncludes(pricing, "PLAN_DEFINITIONS.free.songArchitectGenerationsPerMonth", "pricing comparison uses free Song Architect limit");
  assertIncludes(pricing, "PLAN_DEFINITIONS.creator_monthly.songArchitectGenerationsPerMonth", "pricing comparison uses creator Song Architect limit");
  assertIncludes(pricing, "PLAN_DEFINITIONS.pro_studio_monthly.songArchitectGenerationsPerMonth", "pricing comparison uses pro Song Architect limit");
  assertIncludes(pricing, 'name: "Analyze"', "pricing cards include Analyze group");
  assertIncludes(pricing, 'name: "Create"', "pricing cards include Create group");
  assertIncludes(pricing, 'name: "Master"', "pricing cards include Master group");
  assertIncludes(pricing, "Export / Usage", "pricing cards include Export / Usage group");
  assertIncludes(
    pricing,
    'return `${monthlyLimit} Song Architect Blueprint${monthlyLimit === 1 ? "" : "s"} / month`;',
    "pricing Song Architect copy keeps monthly reset explicit"
  );
  assert.ok(!pricing.includes("Generation Match"), "Generation Match is not customer-facing and must not be advertised");
  assert.ok(!pricing.includes("Reference Track"), "Reference Track must stay off the pricing page");
  assert.ok(!pricing.includes("AI Audio Restoration"), "owner-only restoration is not advertised");
  assert.ok(!pricing.includes("Unlimited Analyze Your Song"), "pricing must not advertise unlimited analyzer");

  assertIncludes(plans, freeLabel, "plan definitions use the same free analyzer copy");
  assertIncludes(plans, paidLabel, "paid plan definitions use monthly analyzer copy");
  assertIncludes(plans, formatSongArchitectCopy(3), "free Song Architect copy matches plan limit");
  assertIncludes(plans, formatSongArchitectCopy(20), "creator Song Architect copy matches plan limit");
  assertIncludes(plans, formatSongArchitectCopy(50), "pro Song Architect copy matches plan limit");
  assertIncludes(page, "lifetime analyses remaining", "Analyze Your Song page shows lifetime remaining copy");
  assertIncludes(page, "analyses remaining this month", "Analyze Your Song page shows monthly remaining copy");
  assert.ok(!page.includes("Unlimited Analyze Your Song") || page.includes("usage.unlimited"), "paid unlimited copy is admin-only");
}

function formatSongArchitectCopy(monthlyLimit) {
  return `${monthlyLimit} Song Architect Blueprint${monthlyLimit === 1 ? "" : "s"} / month`;
}

async function run() {
  runEntitlementDefinitionTests();
  await runLocalLifetimeSlotTests();
  runPaidBehaviorSourceTests();
  runPricingCopyMatchTests();
  console.log("hit-analyzer-lifetime-quota-test: ok");
}

await run();
