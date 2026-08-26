/**
 * Analyze Your Song monthly quota tests (Creator / Pro Studio).
 *
 * node --experimental-transform-types --import ./scripts/lib/register-ts-alias.mjs scripts/hit-analyzer-monthly-quota-test.mjs
 */
import { readFileSync } from "node:fs";
import assert from "node:assert/strict";
import path from "node:path";

import {
  consumeHitAnalyzerPeriodSlot,
  countHitAnalyzerUsageInPeriod,
  resetHitAnalyzerLocalUsageForTests,
  seedHitAnalyzerLocalUsageForTests
} from "@/lib/ar-ai/usage";
import {
  HIT_ANALYZER_TIER_LIMITS,
  formatHitAnalyzerLimitShort,
  getHitAnalyzerAllowanceLabel
} from "@/lib/ar-ai/limits";
import { resolveHitAnalyzerUsageWindow } from "@/lib/ar-ai/limits";
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

function evaluateMonthlyAccess({ planId, email, used }) {
  const tierLimit = resolveHitAnalyzerTierLimit(planId, email);
  if (tierLimit == null) {
    return { allowed: true, unlimited: true, limit: null, remaining: null };
  }
  const remaining = Math.max(tierLimit.limit - used, 0);
  if (remaining <= 0) {
    return {
      allowed: false,
      code: "hit_analyzer_quota_exhausted",
      upgradeRequired: true,
      limit: tierLimit.limit,
      remaining: 0
    };
  }
  return { allowed: true, unlimited: false, limit: tierLimit.limit, remaining };
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

function runEntitlementDefinitionTests() {
  assert.equal(HIT_ANALYZER_TIER_LIMITS.creator_monthly.limit, 5, "creator Analyze Your Song is 5 monthly");
  assert.equal(HIT_ANALYZER_TIER_LIMITS.pro_studio_monthly.limit, 5, "pro Analyze Your Song is 5 monthly");
  assert.equal(HIT_ANALYZER_TIER_LIMITS.creator_monthly.period, "monthly");
  assert.equal(HIT_ANALYZER_TIER_LIMITS.pro_studio_monthly.period, "monthly");
  assert.equal(getHitAnalyzerAllowanceLabel("creator_monthly"), "5 Analyze Your Song analyses / month");
  assert.equal(getHitAnalyzerAllowanceLabel("pro_studio_monthly"), "5 Analyze Your Song analyses / month");
  assert.equal(formatHitAnalyzerLimitShort("creator_monthly"), "5 / month");
  assert.equal(formatHitAnalyzerLimitShort("pro_studio_monthly"), "5 / month");
  assert.equal(resolveHitAnalyzerTierLimit("creator_monthly", ADMIN_EMAIL), null, "admin bypass remains unlimited");
}

function runPostLaunchQuotaTests() {
  for (const planId of ["creator_monthly", "pro_studio_monthly"]) {
    const allowedAtZero = evaluateMonthlyAccess({ planId, email: "user@example.com", used: 0 });
    assert.equal(allowedAtZero.allowed, true, `${planId} allows first monthly analysis`);
    assert.equal(allowedAtZero.remaining, 5);

    const allowedAtFour = evaluateMonthlyAccess({ planId, email: "user@example.com", used: 4 });
    assert.equal(allowedAtFour.allowed, true, `${planId} allows fifth monthly analysis`);
    assert.equal(allowedAtFour.remaining, 1);

    const blockedAtFive = evaluateMonthlyAccess({ planId, email: "user@example.com", used: 5 });
    assert.equal(blockedAtFive.allowed, false, `${planId} blocks sixth monthly analysis`);
    assert.equal(blockedAtFive.code, "hit_analyzer_quota_exhausted");
    assert.equal(blockedAtFive.remaining, 0);
  }
}

function runBillingPeriodWindowTests() {
  const tierLimit = HIT_ANALYZER_TIER_LIMITS.creator_monthly;
  const subscriptionWindow = resolveHitAnalyzerUsageWindow(
    tierLimit,
    "2026-08-10T00:00:00.000Z",
    "2026-09-10T00:00:00.000Z"
  );
  assert.ok(subscriptionWindow, "paid tiers resolve a usage window");
  assert.equal(subscriptionWindow.periodStart.toISOString(), "2026-08-10T00:00:00.000Z");
  assert.equal(subscriptionWindow.periodEnd.toISOString(), "2026-09-10T00:00:00.000Z");

  const calendarFallback = resolveHitAnalyzerUsageWindow(tierLimit, null, null);
  assert.ok(calendarFallback, "missing subscription period falls back to calendar month");
  assert.equal(calendarFallback.periodStart.getUTCDate(), 1, "calendar fallback starts on day 1 UTC");
}

async function runLocalMonthlySlotTests() {
  await withLocalUsageLedger(async () => {
    resetHitAnalyzerLocalUsageForTests();
    const email = "monthly-quota@example.com";
    const limit = HIT_ANALYZER_TIER_LIMITS.creator_monthly.limit;
    const currentPeriodStart = new Date("2026-08-01T00:00:00.000Z");
    const currentPeriodEnd = new Date("2026-09-01T00:00:00.000Z");
    const previousPeriodStart = new Date("2026-07-01T00:00:00.000Z");
    const previousPeriodEnd = new Date("2026-08-01T00:00:00.000Z");

    seedHitAnalyzerLocalUsageForTests(email, [
      { createdAt: new Date("2026-07-15T00:00:00.000Z") },
      { createdAt: new Date("2026-07-20T00:00:00.000Z") },
      { createdAt: new Date("2026-07-25T00:00:00.000Z") },
      { createdAt: new Date("2026-07-28T00:00:00.000Z") },
      { createdAt: new Date("2026-07-29T00:00:00.000Z") }
    ]);
    const previousPeriodUsed = await countHitAnalyzerUsageInPeriod(
      email,
      previousPeriodStart,
      previousPeriodEnd
    );
    assert.equal(previousPeriodUsed, 5, "previous-period usage is tracked historically");
    const currentBefore = await countHitAnalyzerUsageInPeriod(email, currentPeriodStart, currentPeriodEnd);
    assert.equal(currentBefore, 0, "previous-period usage does not consume current-period quota");

    for (let i = 0; i < 5; i += 1) {
      const consumed = await consumeHitAnalyzerPeriodSlot({
        normalizedEmail: email,
        planId: "creator_monthly",
        limit,
        periodStart: currentPeriodStart,
        periodEnd: currentPeriodEnd
      });
      assert.equal(consumed, true, `creator monthly analysis #${i + 1} allowed`);
    }
    const currentUsed = await countHitAnalyzerUsageInPeriod(email, currentPeriodStart, currentPeriodEnd);
    assert.equal(currentUsed, 5, "current-period usage counts successful monthly events");

    const blocked = await consumeHitAnalyzerPeriodSlot({
      normalizedEmail: email,
      planId: "creator_monthly",
      limit,
      periodStart: currentPeriodStart,
      periodEnd: currentPeriodEnd
    });
    assert.equal(blocked, false, "creator monthly analysis #6 blocked");
    assert.equal(
      await countHitAnalyzerUsageInPeriod(email, currentPeriodStart, currentPeriodEnd),
      5,
      "blocked monthly request does not consume a slot"
    );
  });
}

function runSourceIntegrationTests() {
  const accessLib = read("lib/ar-ai/access.ts");
  const limitsLib = read("lib/ar-ai/limits.ts");
  const usageLib = read("lib/ar-ai/usage.ts");
  const route = read("app/api/ar-ai/route.ts");
  const plans = read("lib/subscriptions/plans.ts");
  const pricing = read("components/pricing-section.tsx");

  assertIncludes(accessLib, "countHitAnalyzerUsageInPeriod", "access lib uses period counter");
  assertIncludes(accessLib, "billingPeriodStartIso", "access lib reads subscription period start");
  assertIncludes(limitsLib, "resolveHitAnalyzerUsageWindow", "limits lib resolves monthly window");
  assertIncludes(usageLib, "consumeHitAnalyzerPeriodSlot", "usage lib has monthly slot claim");
  assertIncludes(usageLib, ".gte(\"created_at\"", "monthly count filters by period start");
  assertIncludes(route, "consumeHitAnalyzerPeriodSlot", "direct API claims monthly slot");
  assertIncludes(plans, "5 Analyze Your Song analyses / month", "paid plan definitions are monthly");
  assert.ok(!plans.includes("Unlimited Analyze Your Song"), "plan definitions must not advertise unlimited analyzer");
  assertIncludes(pricing, "getHitAnalyzerAllowanceLabel", "pricing uses entitlement labels for monthly analyzer");
  assert.ok(!pricing.includes("Unlimited Analyze Your Song"), "pricing must not advertise unlimited analyzer");
}

async function run() {
  runEntitlementDefinitionTests();
  runPostLaunchQuotaTests();
  runBillingPeriodWindowTests();
  await runLocalMonthlySlotTests();
  runSourceIntegrationTests();
  console.log("hit-analyzer-monthly-quota-test: ok");
}

await run();
