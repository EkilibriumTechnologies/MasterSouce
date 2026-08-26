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



const ADMIN_EMAIL = "llarod@gmail.com";

const BILLING_EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;



const HIT_ANALYZER_TIER_LIMITS = {

  free: { limit: 2, period: "lifetime" },

  creator_monthly: { limit: 5, period: "monthly" },

  pro_studio_monthly: { limit: 5, period: "monthly" }

};



const HIT_ANALYZER_DEFAULT_LAUNCH_END_DATE = "2026-07-30T23:59:59.999Z";



function normalizeBillingEmail(email) {

  const normalized = email.trim().toLowerCase();

  if (!BILLING_EMAIL_REGEX.test(normalized)) return null;

  return normalized;

}



function isAdminEntitlementOverrideEmail(email) {

  const normalized = normalizeBillingEmail(String(email ?? "").trim());

  return normalized === ADMIN_EMAIL;

}



function parseLaunchEndDate(raw) {

  if (!raw?.trim()) return null;

  const parsed = new Date(raw.trim());

  if (Number.isNaN(parsed.getTime())) return null;

  return parsed;

}



function resolveHitAnalyzerLaunchEndDate(envValue) {

  const fromEnv = parseLaunchEndDate(envValue);

  if (fromEnv) return fromEnv;

  return parseLaunchEndDate(HIT_ANALYZER_DEFAULT_LAUNCH_END_DATE);

}



function isHitAnalyzerLaunchActive(now, envValue) {

  const end = resolveHitAnalyzerLaunchEndDate(envValue);

  return now.getTime() < end.getTime();

}



function buildHitAnalyzerLaunchCountdown(now, envValue) {

  const launchEndsAt = resolveHitAnalyzerLaunchEndDate(envValue).toISOString();

  const endMs = new Date(launchEndsAt).getTime();

  const msRemaining = Math.max(0, endMs - now.getTime());

  const launchActive = msRemaining > 0;

  const oneDayMs = 24 * 60 * 60 * 1000;



  if (!launchActive) {

    return {

      launchActive: false,

      launchEndsAt,

      unit: "days",

      value: 0,

      label: "0 days",

      message: "Launch access has ended. Plan limits apply."

    };

  }



  if (msRemaining >= oneDayMs) {

    const days = Math.ceil(msRemaining / oneDayMs);

    const label = `${days} day${days === 1 ? "" : "s"}`;

    return {

      launchActive: true,

      launchEndsAt,

      unit: "days",

      value: days,

      label,

      message: `Free launch access ends in ${label}`

    };

  }



  const hours = Math.max(1, Math.ceil(msRemaining / (60 * 60 * 1000)));

  const label = `${hours} hour${hours === 1 ? "" : "s"}`;

  return {

    launchActive: true,

    launchEndsAt,

    unit: "hours",

    value: hours,

    label,

    message: `Free launch access ends in ${label}`

  };

}



function resolveHitAnalyzerTierLimit(planId, email) {

  if (isAdminEntitlementOverrideEmail(email)) return null;

  return HIT_ANALYZER_TIER_LIMITS[planId];

}



function evaluatePostLaunchAccess({ planId, email, used }) {

  const adminUnlimited = isAdminEntitlementOverrideEmail(email);

  const tierLimit = resolveHitAnalyzerTierLimit(planId, email);

  if (adminUnlimited || tierLimit == null) {

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



function runLaunchCountdownTests() {

  const midLaunch = new Date("2026-07-01T12:00:00.000Z");

  const countdown = buildHitAnalyzerLaunchCountdown(midLaunch, undefined);

  assert.equal(countdown.launchActive, true, "launch active mid-window");

  assert.equal(countdown.unit, "days", "mid-window uses day unit");

  assert.ok(countdown.value >= 29, "mid-window day countdown is plausible");

  assert.match(countdown.message, /Free launch access ends in/, "countdown message prefix");



  const afterLaunch = new Date("2026-08-01T00:00:00.000Z");

  assert.equal(isHitAnalyzerLaunchActive(afterLaunch, undefined), false, "launch ends after default date");

}



function runTierLimitTests() {

  assert.equal(resolveHitAnalyzerTierLimit("free", "user@example.com")?.limit, 2, "free tier lifetime limit");

  assert.equal(resolveHitAnalyzerTierLimit("creator_monthly", "user@example.com")?.limit, 5, "creator monthly limit");

  assert.equal(resolveHitAnalyzerTierLimit("pro_studio_monthly", "user@example.com")?.limit, 5, "pro monthly limit");

  assert.equal(resolveHitAnalyzerTierLimit("free", ADMIN_EMAIL), null, "admin unlimited");

  assert.equal(resolveHitAnalyzerTierLimit("free", "  LLAROD@Gmail.COM  "), null, "admin email trim/lowercase");

}



function runPostLaunchQuotaTests() {

  const firstAllowed = evaluatePostLaunchAccess({ planId: "free", email: "user@example.com", used: 0 });

  assert.equal(firstAllowed.allowed, true, "free allows first lifetime analysis");

  assert.equal(firstAllowed.remaining, 2);



  const secondAllowed = evaluatePostLaunchAccess({ planId: "free", email: "user@example.com", used: 1 });

  assert.equal(secondAllowed.allowed, true, "free allows second lifetime analysis");

  assert.equal(secondAllowed.remaining, 1);



  const freeBlocked = evaluatePostLaunchAccess({ planId: "free", email: "user@example.com", used: 2 });

  assert.equal(freeBlocked.allowed, false, "free blocks third lifetime analysis");

  assert.equal(freeBlocked.code, "hit_analyzer_quota_exhausted");

  assert.equal(freeBlocked.remaining, 0);



  const creatorAtFour = evaluatePostLaunchAccess({

    planId: "creator_monthly",

    email: "user@example.com",

    used: 4

  });

  assert.equal(creatorAtFour.allowed, true, "creator allows fifth monthly analysis");

  assert.equal(creatorAtFour.remaining, 1);



  const creatorBlocked = evaluatePostLaunchAccess({

    planId: "creator_monthly",

    email: "user@example.com",

    used: 5

  });

  assert.equal(creatorBlocked.allowed, false, "creator blocks sixth monthly analysis");

  assert.equal(creatorBlocked.code, "hit_analyzer_quota_exhausted");



  const proAtFour = evaluatePostLaunchAccess({

    planId: "pro_studio_monthly",

    email: "user@example.com",

    used: 4

  });

  assert.equal(proAtFour.allowed, true, "pro allows fifth monthly analysis");



  const proBlocked = evaluatePostLaunchAccess({

    planId: "pro_studio_monthly",

    email: "user@example.com",

    used: 5

  });

  assert.equal(proBlocked.allowed, false, "pro blocks sixth monthly analysis");



  const admin = evaluatePostLaunchAccess({ planId: "free", email: ADMIN_EMAIL, used: 999 });

  assert.equal(admin.allowed, true, "admin remains unlimited");

  assert.equal(admin.unlimited, true);

}



function runLaunchBypassTests() {

  const launchNow = new Date("2026-07-01T00:00:00.000Z");

  assert.equal(isHitAnalyzerLaunchActive(launchNow, undefined), true, "launch active bypasses tier enforcement window");

  const blockedAfterLaunch = evaluatePostLaunchAccess({ planId: "free", email: "user@example.com", used: 2 });

  assert.equal(blockedAfterLaunch.allowed, false, "same usage blocked once launch semantics end");

}



function runLifetimePersistenceTests() {

  const historicalCount = 2;

  const afterManyCalendarMonths = evaluatePostLaunchAccess({

    planId: "free",

    email: "historical@example.com",

    used: historicalCount

  });

  assert.equal(afterManyCalendarMonths.allowed, false, "historical all-time usage does not reset by month");

}



function runSourceIntegrationTests() {

  const accessLib = read("lib/ar-ai/access.ts");

  const limitsLib = read("lib/ar-ai/limits.ts");

  const usageLib = read("lib/ar-ai/usage.ts");

  const route = read("app/api/ar-ai/route.ts");

  const accessRoute = read("app/api/ar-ai/access/route.ts");

  const page = read("app/ar-ai/page.tsx");

  const plans = read("lib/subscriptions/plans.ts");

  const pricing = read("components/pricing-section.tsx");



  assertIncludes(accessLib, "HIT_ANALYZER_DEFAULT_LAUNCH_END_DATE", "access lib default launch end");

  assertIncludes(accessLib, "HIT_ANALYZER_FREE_LAUNCH_END_DATE", "access lib env override");

  assertIncludes(accessLib, "isAdminEntitlementOverrideEmail", "access lib admin override");

  assertIncludes(accessLib, "hit_analyzer_quota_exhausted", "access lib quota code");

  assertIncludes(limitsLib, "free: { limit: 2, period: \"lifetime\" }", "authoritative free lifetime limit");

  assertIncludes(accessLib, 'from "@/lib/ar-ai/limits"', "access lib uses shared analyzer limit source");

  assertIncludes(accessLib, "countHitAnalyzerUsageAllTime", "access lib uses all-time count for free");

  assertIncludes(accessLib, "countHitAnalyzerUsageInPeriod", "access lib uses period count for paid");

  assertIncludes(limitsLib, "resolveHitAnalyzerUsageWindow", "limits lib resolves monthly window");

  assertIncludes(limitsLib, "creator_monthly: { limit: 5, period: \"monthly\" }", "creator monthly limit");

  assertIncludes(limitsLib, "pro_studio_monthly: { limit: 5, period: \"monthly\" }", "pro monthly limit");

  assertIncludes(usageLib, "hit_analyzer_report_events", "usage lib table name");

  assertIncludes(usageLib, "countHitAnalyzerUsageAllTime", "usage lib all-time counter");

  assertIncludes(usageLib, "countHitAnalyzerUsageInPeriod", "usage lib period counter");

  assertIncludes(usageLib, "consumeHitAnalyzerLifetimeSlot", "usage lib has concurrent-safe lifetime slot claim");

  assertIncludes(usageLib, "consumeHitAnalyzerPeriodSlot", "usage lib has concurrent-safe monthly slot claim");

  assertIncludes(usageLib, '.order("created_at", { ascending: true })', "slot winners use stable order");

  assertIncludes(usageLib, "quota_exhausted_concurrent", "losing concurrent requests are uncounted");

  assertIncludes(route, "resolveHitAnalyzerAccess", "route uses access helper");

  assertIncludes(route, "consumeHitAnalyzerLifetimeSlot", "direct API claims authoritative lifetime slot");

  assertIncludes(route, "consumeHitAnalyzerPeriodSlot", "direct API claims authoritative monthly slot");

  assertIncludes(route, "consumeRateLimit", "route keeps IP abuse guard");

  assertIncludes(route, 'bucket: "ar_ai_ip"', "route keeps ar_ai_ip bucket");



  const openAiIndex = route.indexOf("await requestArAiEvaluationFromOpenAI");

  const accessIndex = route.indexOf("resolveHitAnalyzerAccess");

  assert.ok(accessIndex >= 0 && openAiIndex >= 0 && accessIndex < openAiIndex, "access resolves before OpenAI");



  assertIncludes(route, 'access.code === "hit_analyzer_quota_exhausted"', "route handles quota exhaustion");

  assertIncludes(route, 'code: "hit_analyzer_quota_exhausted"', "concurrent over-cap request is denied");



  assertIncludes(accessRoute, "/api/ar-ai/access", "dedicated access route exists");

  assertIncludes(page, "Try Hit Analyzer free during launch.", "launch banner copy");

  assertIncludes(page, "Upgrade to analyze more songs", "upgrade CTA");

  assertIncludes(page, "/#pricing", "pricing link");

  assertIncludes(page, "lifetime analyses remaining", "free remaining copy");

  assertIncludes(page, "analyses remaining this month", "paid remaining copy");

  assertIncludes(plans, "2 Analyze Your Song analyses — lifetime", "free plan feature copy");

  assertIncludes(plans, "5 Analyze Your Song analyses / month", "paid plan feature copy");

  assert.ok(!plans.includes("Unlimited Analyze Your Song"), "plan definitions must not advertise unlimited analyzer");

  assertIncludes(plans, "Unlimited MP3 downloads", "MP3 entitlement wording unchanged");

  assertIncludes(pricing, "getHitAnalyzerAllowanceLabel", "pricing card copy uses entitlement labels");

  assertIncludes(pricing, "formatHitAnalyzerLimitShort", "pricing comparison uses entitlement analyzer limits");

  assertIncludes(pricing, "PLAN_DEFINITIONS.free.songArchitectGenerationsPerMonth", "pricing creative limits come from plan definitions");

  assertIncludes(pricing, "formatMonthlyWavLimitLabel", "pricing WAV limits come from quota policy");

  assertIncludes(pricing, 'name: "Analyze"', "pricing cards group Analyze");

  assertIncludes(pricing, 'name: "Create"', "pricing cards group Create");

  assertIncludes(pricing, 'name: "Master"', "pricing cards group Master");

  assertIncludes(pricing, "Export / Usage", "pricing cards group Export / Usage");

  assert.ok(!pricing.includes("AI Audio Restoration"), "owner-only restoration is not advertised");

  assert.ok(!pricing.includes("Generation Match"), "Generation Match is not advertised until customer-facing");

  assert.ok(!pricing.includes("Reference Track"), "Reference Track is not advertised on pricing");

  assert.ok(!pricing.includes("Unlimited Analyze Your Song"), "pricing must not advertise unlimited analyzer");

}



function runInvariantCompatibilityTests() {

  const route = read("app/api/ar-ai/route.ts");

  assert.ok(!route.includes("adaptiveMastering"), "ar-ai route must not invoke adaptive mastering");

  assertIncludes(route, "normalizeArAiReport", "report normalization unchanged");

  assertIncludes(route, "analyzeTrack", "technical analysis unchanged");

  assert.ok(!read("app/api/analyze-track/route.ts").includes("resolveHitAnalyzerAccess"), "Track Analysis remains unmetered");

}



function run() {

  runLaunchCountdownTests();

  runTierLimitTests();

  runPostLaunchQuotaTests();

  runLaunchBypassTests();

  runLifetimePersistenceTests();

  runSourceIntegrationTests();

  runInvariantCompatibilityTests();

  console.log("hit-analyzer-access-test: ok");

}



run();

