import { readFileSync } from "node:fs";
import assert from "node:assert/strict";
import path from "node:path";

const ROOT = process.cwd();

function read(relPath) {
  return readFileSync(path.join(ROOT, relPath), "utf8");
}

function assertBefore(content, firstNeedle, laterNeedle, context) {
  const first = content.indexOf(firstNeedle);
  const later = content.indexOf(laterNeedle);
  assert.notEqual(first, -1, `${context}: missing "${firstNeedle}"`);
  assert.notEqual(later, -1, `${context}: missing "${laterNeedle}"`);
  assert.ok(first < later, `${context}: expected "${firstNeedle}" before "${laterNeedle}"`);
}

function assertIncludes(content, needle, context) {
  assert.ok(content.includes(needle), `${context}: missing "${needle}"`);
}

function assertExcludes(content, needle, context) {
  assert.ok(!content.includes(needle), `${context}: must not include "${needle}"`);
}

function runCodecMappingTests() {
  const plans = read("lib/subscriptions/plans.ts");
  assert.match(plans, /free:[\s\S]*?quality:\s*"16bit"/, "free plan maps to 16bit");
  assert.match(plans, /creator_monthly:[\s\S]*?quality:\s*"24bit"/, "creator plan maps to 24bit");
  assert.match(plans, /pro_studio_monthly:[\s\S]*?quality:\s*"32bit_float"/, "pro plan maps to 32bit_float");

  const codec = read("lib/audio/wav-export-codec.ts");
  assertIncludes(codec, 'if (quality === "32bit_float") return "pcm_f32le";', "32bit_float maps to pcm_f32le");
  assertIncludes(codec, 'return is24BitWavExportEnabled() ? "pcm_s24le" : "pcm_s16le";', "24bit maps to pcm_s24le when enabled");
  assertIncludes(codec, 'return "pcm_s16le";', "free/default maps to pcm_s16le");
}

function runRouteInvariantTests() {
  const masterRoute = read("app/api/master/route.ts");
  assertIncludes(masterRoute, "resolveEntitlementBillingContext", "master route resolves billing context");
  assertIncludes(
    masterRoute,
    "getEntitlementsForUser(user, billingResolution.billingContext)",
    "master route passes billing context to entitlements"
  );
  assertIncludes(masterRoute, "logWavExportEntitlementResolution", "master route logs encode-time entitlement");
  assertBefore(
    masterRoute,
    "resolveEntitlementBillingContext",
    "result = await runMasteringPipeline({",
    "master route: billing context before pipeline"
  );
  assertBefore(
    masterRoute,
    "outputQuality: entitlements.quality",
    "result = await runMasteringPipeline({",
    "master route: outputQuality from entitlements before pipeline"
  );

  const masterAiRoute = read("app/api/master-ai/route.ts");
  assertIncludes(masterAiRoute, "resolveEntitlementBillingContext", "master-ai route resolves billing context");
  assertIncludes(
    masterAiRoute,
    "getEntitlementsForUser(user, billingResolution.billingContext)",
    "master-ai route passes billing context to entitlements"
  );
  assertIncludes(masterAiRoute, 'endpoint: "/api/master-ai"', "master-ai route logs encode-time entitlement");
  assertBefore(
    masterAiRoute,
    "resolveEntitlementBillingContext",
    "await runAdaptiveMasteringPipeline({",
    "master-ai route: billing context before adaptive pipeline"
  );
  assertBefore(
    masterAiRoute,
    "outputQuality: entitlements.quality",
    "await runAdaptiveMasteringPipeline({",
    "master-ai route: outputQuality from entitlements before adaptive pipeline"
  );

  const downloadRoute = read("app/api/download/route.ts");
  assertExcludes(downloadRoute, "resolveCodecForQuality", "download route must not re-encode or change codec");
  assertExcludes(downloadRoute, "runMasteringPipeline", "download route must not run mastering pipeline");
  assertExcludes(downloadRoute, "runAdaptiveMasteringPipeline", "download route must not run adaptive pipeline");
  assertIncludes(downloadRoute, "createReadStream(record.filePath)", "download route streams stored file as-is");

  const resolver = read("lib/subscriptions/resolve-entitlement-billing-context.ts");
  assertIncludes(resolver, "readVerifiedEmailState", "resolver uses verified email cookie");
  assertIncludes(resolver, "MASTERSOUCE_BILLING_EMAIL_HEADER", "resolver reads billing email header");
  assertExcludes(resolver, "PLAN_DEFINITIONS", "resolver must not map client plan directly");
  assertExcludes(resolver, 'get("planId")', "resolver must not read client planId");
}

function runClientHintTests() {
  const uploadForm = read("components/upload-form.tsx");
  assertIncludes(uploadForm, "masteringBillingHeaders", "upload form sends billing email header helper");
  assertIncludes(uploadForm, 'fetch("/api/master"', "upload form calls master route");
  assertIncludes(uploadForm, 'fetch("/api/master-ai"', "upload form calls master-ai route");
  assertIncludes(uploadForm, "MASTERSOUCE_BILLING_EMAIL_HEADER", "upload form imports billing header key");

  const captureEmail = read("app/api/capture-email/route.ts");
  assertIncludes(captureEmail, "attachTrustedEmailAccessState", "capture-email sets trusted email cookie");
}

function run() {
  runCodecMappingTests();
  runRouteInvariantTests();
  runClientHintTests();
  console.log("wav export entitlement invariants passed");
}

run();
