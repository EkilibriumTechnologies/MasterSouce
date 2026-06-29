import { readFileSync } from "node:fs";
import assert from "node:assert/strict";
import path from "node:path";

const ROOT = process.cwd();

function read(relPath) {
  return readFileSync(path.join(ROOT, relPath), "utf8");
}

const ADMIN_EMAIL = "llarod@gmail.com";
const ADMIN_QUALITY = "32bit_float";
const DEFERRED_ARCHIVE_QUALITY = "32bit_float";
const BILLING_EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function normalizeBillingEmail(email) {
  const normalized = email.trim().toLowerCase();
  if (!BILLING_EMAIL_REGEX.test(normalized)) return null;
  return normalized;
}

function normalizeAdminOverrideEmail(email) {
  if (!email?.trim()) return null;
  return normalizeBillingEmail(email.trim());
}

function isAdminQualityOverrideEmail(email) {
  const normalized = normalizeAdminOverrideEmail(email);
  return normalized === ADMIN_EMAIL;
}

function resolveMasteringOutputQuality(entitlementQuality, emailSource) {
  return emailSource === "none" ? DEFERRED_ARCHIVE_QUALITY : entitlementQuality;
}

function applyAdminQualityOverride(normalizedEmail, outputQuality) {
  const resolvedEmail = normalizeAdminOverrideEmail(normalizedEmail);
  if (!resolvedEmail || resolvedEmail !== ADMIN_EMAIL) return outputQuality;
  return ADMIN_QUALITY;
}

function resolveEncodeOutputQuality(entitlementQuality, emailSource, normalizedEmail) {
  const base = resolveMasteringOutputQuality(entitlementQuality, emailSource);
  return applyAdminQualityOverride(normalizedEmail, base);
}

function resolveDeliveryOutputQuality(entitlementQuality, normalizedEmail) {
  return applyAdminQualityOverride(normalizedEmail, entitlementQuality);
}

function resolveCodecForQuality(quality) {
  if (quality === "32bit_float") return "pcm_f32le";
  if (quality === "24bit") return "pcm_s24le";
  return "pcm_s16le";
}

function runCodecTests() {
  const adminQuality = resolveEncodeOutputQuality("16bit", "verified_cookie", ADMIN_EMAIL);
  assert.equal(adminQuality, "32bit_float", "admin email overrides free tier to float");
  assert.equal(resolveCodecForQuality(adminQuality), "pcm_f32le", "admin email encodes pcm_f32le");

  const adminDelivery = resolveDeliveryOutputQuality("16bit", ADMIN_EMAIL);
  assert.equal(adminDelivery, "32bit_float", "admin delivery overrides plan 16bit to float");

  const creatorQuality = resolveEncodeOutputQuality("24bit", "verified_cookie", "creator@example.com");
  assert.equal(creatorQuality, "24bit", "creator keeps 24bit when not admin");
  assert.equal(resolveCodecForQuality(creatorQuality), "pcm_s24le", "creator encodes pcm_s24le");

  const freeQuality = resolveEncodeOutputQuality("16bit", "verified_cookie", "free@example.com");
  assert.equal(freeQuality, "16bit", "free user keeps 16bit when not admin");
  assert.equal(resolveCodecForQuality(freeQuality), "pcm_s16le", "free user encodes pcm_s16le");

  const proQuality = resolveEncodeOutputQuality("32bit_float", "verified_cookie", "pro@example.com");
  assert.equal(proQuality, "32bit_float", "pro user keeps 32bit when not admin");

  const anonymousQuality = resolveEncodeOutputQuality("16bit", "none", null);
  assert.equal(anonymousQuality, DEFERRED_ARCHIVE_QUALITY, "anonymous still defers to archive float");
  assert.equal(resolveCodecForQuality(anonymousQuality), "pcm_f32le", "anonymous archive is pcm_f32le");
}

function runEmailNormalizationTests() {
  assert.ok(isAdminQualityOverrideEmail("  LLAROD@gmail.com  "), "admin match is case-insensitive and trim-safe");
  assert.ok(isAdminQualityOverrideEmail("llarod@gmail.com"), "admin match accepts normalized lowercase");
  assert.ok(!isAdminQualityOverrideEmail("llarod01@gmail.com"), "old typo email must not match");
  assert.ok(!isAdminQualityOverrideEmail("  free@example.com  "), "non-admin email must not match");

  const spacedAdminEncode = resolveEncodeOutputQuality("16bit", "verified_cookie", "  LLAROD@gmail.com  ");
  assert.equal(spacedAdminEncode, "32bit_float", "encode override normalizes email before compare");

  const wrongClientDepth = resolveEncodeOutputQuality("16bit", "verified_cookie", ADMIN_EMAIL);
  assert.equal(wrongClientDepth, "32bit_float", "server overrides client/plan 16bit for admin email");
}

function runSourceInvariantTests() {
  const override = read("lib/subscriptions/admin-quality-override.ts");
  assertIncludes(override, 'export const ADMIN_QUALITY_OVERRIDE_EMAIL = "llarod@gmail.com";', "hardcoded admin email");
  assertIncludes(override, 'event: "admin_quality_override_attempt"', "structured admin override attempt log");
  assertIncludes(override, "export function isAdminQualityOverrideEmail", "admin email matcher exported");
  assertIncludes(override, 'event: "admin_quality_override_applied"', "structured admin override applied log");
  assertIncludes(override, 'event: "admin_quality_override_skipped"', "structured admin override skipped log");
  assertIncludes(override, "maskNormalizedEmailForLog", "masked email in log");

  const resolver = read("lib/subscriptions/resolve-entitlement-billing-context.ts");
  assertIncludes(resolver, "resolveEncodeOutputQuality", "encode output resolver exported");
  assertIncludes(resolver, "resolveDeliveryOutputQuality", "delivery output resolver exported");

  const masterRoute = read("app/api/master/route.ts");
  assertIncludes(masterRoute, "resolveEncodeOutputQuality", "master route uses encode resolver");
  assertBefore(
    masterRoute,
    "resolveEncodeOutputQuality(",
    "result = await runMasteringPipeline({",
    "master route: encode quality before pipeline"
  );
  assertExcludes(masterRoute, "resolveMasteringOutputQuality(", "master route must not bypass encode resolver");

  const masterAiRoute = read("app/api/master-ai/route.ts");
  assertIncludes(masterAiRoute, "resolveEncodeOutputQuality", "master-ai route uses encode resolver");
  assertBefore(
    masterAiRoute,
    "resolveEncodeOutputQuality(",
    "await runAdaptiveMasteringPipeline({",
    "master-ai route: encode quality before adaptive pipeline"
  );
  assertExcludes(masterAiRoute, "resolveMasteringOutputQuality(", "master-ai route must not bypass encode resolver");

  const finalize = read("lib/audio/wav-export-finalize.ts");
  assertIncludes(finalize, "resolveDeliveryOutputQuality", "finalize uses delivery quality resolver");
  assertIncludes(finalize, "isAdminQualityOverrideEmail", "finalize uses normalized admin email matcher");
  assertIncludes(finalize, "adminForceFloatDelivery", "finalize can upgrade admin QA to float");

  const entitlements = read("lib/subscriptions/entitlements.ts");
  assertExcludes(entitlements, "admin-quality-override", "entitlements must not apply admin encode override");
}

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
  assert.ok(first < later, `${context}: expected "${firstNeedle}" before "${laterNeedle}"`);
}

function run() {
  runCodecTests();
  runEmailNormalizationTests();
  runSourceInvariantTests();
  console.log("admin quality override tests passed");
}

run();
