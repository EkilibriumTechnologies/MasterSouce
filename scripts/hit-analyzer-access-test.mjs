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
  free: 1,
  creator_monthly: 10,
  pro_studio_monthly: 50
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
      message: "Launch access has ended. Monthly plan limits apply."
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
  const unlimited = isAdminEntitlementOverrideEmail(email);
  const limit = resolveHitAnalyzerTierLimit(planId, email);
  if (unlimited) return { allowed: true, unlimited: true };
  const remaining = Math.max((limit ?? 0) - used, 0);
  if (remaining <= 0) {
    return {
      allowed: false,
      code: "hit_analyzer_quota_exhausted",
      upgradeRequired: true,
      limit,
      remaining: 0
    };
  }
  return { allowed: true, unlimited: false, limit, remaining };
}

function runLaunchCountdownTests() {
  const midLaunch = new Date("2026-07-01T12:00:00.000Z");
  const countdown = buildHitAnalyzerLaunchCountdown(midLaunch, undefined);
  assert.equal(countdown.launchActive, true, "launch active mid-window");
  assert.equal(countdown.unit, "days", "mid-window uses day unit");
  assert.ok(countdown.value >= 29, "mid-window day countdown is plausible");
  assert.match(countdown.message, /Free launch access ends in/, "countdown message prefix");

  const finalDay = new Date("2026-07-30T12:00:00.000Z");
  const hoursCountdown = buildHitAnalyzerLaunchCountdown(finalDay, undefined);
  assert.equal(hoursCountdown.unit, "hours", "final day uses hour unit");
  assert.ok(hoursCountdown.value >= 1, "final day has at least 1 hour");

  const afterLaunch = new Date("2026-08-01T00:00:00.000Z");
  assert.equal(isHitAnalyzerLaunchActive(afterLaunch, undefined), false, "launch ends after default date");
}

function runTierLimitTests() {
  assert.equal(resolveHitAnalyzerTierLimit("free", "user@example.com"), 1, "free tier limit");
  assert.equal(resolveHitAnalyzerTierLimit("creator_monthly", "user@example.com"), 10, "creator tier limit");
  assert.equal(resolveHitAnalyzerTierLimit("pro_studio_monthly", "user@example.com"), 50, "pro tier limit");
  assert.equal(resolveHitAnalyzerTierLimit("free", ADMIN_EMAIL), null, "admin unlimited");
  assert.equal(resolveHitAnalyzerTierLimit("free", "  LLAROD@Gmail.COM  "), null, "admin email trim/lowercase");
}

function runPostLaunchQuotaTests() {
  const freeBlocked = evaluatePostLaunchAccess({ planId: "free", email: "user@example.com", used: 1 });
  assert.equal(freeBlocked.allowed, false, "free blocked at 1 used");
  assert.equal(freeBlocked.code, "hit_analyzer_quota_exhausted");
  assert.equal(freeBlocked.remaining, 0);

  const creatorAllowed = evaluatePostLaunchAccess({ planId: "creator_monthly", email: "user@example.com", used: 9 });
  assert.equal(creatorAllowed.allowed, true, "creator allows 10th report");
  assert.equal(creatorAllowed.remaining, 1);

  const creatorBlocked = evaluatePostLaunchAccess({ planId: "creator_monthly", email: "user@example.com", used: 10 });
  assert.equal(creatorBlocked.allowed, false, "creator blocked at 10");

  const proAllowed = evaluatePostLaunchAccess({ planId: "pro_studio_monthly", email: "user@example.com", used: 49 });
  assert.equal(proAllowed.allowed, true, "pro allows 50th report");

  const admin = evaluatePostLaunchAccess({ planId: "free", email: ADMIN_EMAIL, used: 999 });
  assert.equal(admin.allowed, true, "admin remains unlimited");
  assert.equal(admin.unlimited, true);
}

function runLaunchBypassTests() {
  const launchNow = new Date("2026-07-01T00:00:00.000Z");
  assert.equal(isHitAnalyzerLaunchActive(launchNow, undefined), true, "launch active bypasses tier enforcement window");
  const blockedAfterLaunch = evaluatePostLaunchAccess({ planId: "free", email: "user@example.com", used: 1 });
  assert.equal(blockedAfterLaunch.allowed, false, "same usage blocked once launch semantics end");
}

function runSourceIntegrationTests() {
  const accessLib = read("lib/ar-ai/access.ts");
  const usageLib = read("lib/ar-ai/usage.ts");
  const route = read("app/api/ar-ai/route.ts");
  const accessRoute = read("app/api/ar-ai/access/route.ts");
  const page = read("app/ar-ai/page.tsx");

  assertIncludes(accessLib, "HIT_ANALYZER_DEFAULT_LAUNCH_END_DATE", "access lib default launch end");
  assertIncludes(accessLib, "HIT_ANALYZER_FREE_LAUNCH_END_DATE", "access lib env override");
  assertIncludes(accessLib, "isAdminEntitlementOverrideEmail", "access lib admin override");
  assertIncludes(accessLib, "hit_analyzer_quota_exhausted", "access lib quota code");
  assertIncludes(usageLib, "hit_analyzer_report_events", "usage lib table name");
  assertIncludes(route, "resolveHitAnalyzerAccess", "route uses access helper");
  assertIncludes(route, "consumeRateLimit", "route keeps IP abuse guard");
  assertIncludes(route, 'bucket: "ar_ai_ip"', "route keeps ar_ai_ip bucket");

  const openAiIndex = route.indexOf("await requestArAiEvaluationFromOpenAI");
  const accessIndex = route.indexOf("resolveHitAnalyzerAccess");
  assert.ok(accessIndex >= 0 && openAiIndex >= 0 && accessIndex < openAiIndex, "access resolves before OpenAI");

  assertIncludes(route, 'access.code === "hit_analyzer_quota_exhausted"', "route handles quota exhaustion");

  assertIncludes(accessRoute, "/api/ar-ai/access", "dedicated access route exists");
  assertIncludes(page, "Try Hit Analyzer free during launch.", "launch banner copy");
  assertIncludes(page, "Upgrade to analyze more songs", "upgrade CTA");
  assertIncludes(page, "/#pricing", "pricing link");
}

function runInvariantCompatibilityTests() {
  const route = read("app/api/ar-ai/route.ts");
  assert.ok(!route.includes("adaptiveMastering"), "ar-ai route must not invoke adaptive mastering");
  assertIncludes(route, "normalizeArAiReport", "report normalization unchanged");
  assertIncludes(route, "analyzeTrack", "technical analysis unchanged");
}

function run() {
  runLaunchCountdownTests();
  runTierLimitTests();
  runPostLaunchQuotaTests();
  runLaunchBypassTests();
  runSourceIntegrationTests();
  runInvariantCompatibilityTests();
  console.log("hit-analyzer-access-test: ok");
}

run();
