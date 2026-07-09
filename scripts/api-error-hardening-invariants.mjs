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

function assertBefore(content, firstNeedle, laterNeedle, context) {
  const first = content.indexOf(firstNeedle);
  const later = content.indexOf(laterNeedle);
  assert.notEqual(first, -1, `${context}: missing "${firstNeedle}"`);
  assert.notEqual(later, -1, `${context}: missing "${laterNeedle}"`);
  assert.ok(first < later, `${context}: expected "${firstNeedle}" before "${laterNeedle}"`);
}

const TARGET_ROUTES = [
  "app/api/master/route.ts",
  "app/api/master-ai/route.ts",
  "app/api/analyze-track/route.ts",
  "app/api/adaptive/export-access/route.ts",
  "app/api/download/route.ts"
];

function runSharedHardeningTests() {
  const helper = read("lib/api/error-responses.ts");
  assertIncludes(helper, "API_ERROR_CODES", "shared helper defines stable API error codes");
  assertIncludes(helper, "apiErrorResponse", "shared helper defines coded response helper");
  assertIncludes(helper, "sanitizeLogDetails", "shared helper defines log redaction");
  assertIncludes(helper, "summarizeErrorForLog", "shared helper hashes exception diagnostics");
  assertIncludes(helper, "maskEmail", "shared helper masks email addresses");
  assertIncludes(helper, "FILE_PATH_RE", "shared helper redacts filesystem paths");
  assertIncludes(helper, "BILLING_ID_RE", "shared helper redacts billing identifiers");
  assertIncludes(helper, "TEMP_FILE_ID_KEY_RE", "shared helper redacts temp file IDs");
  assertIncludes(helper, "stack: error.stack", "shared helper captures stack only for redacted internal log summary");
  assertExcludes(helper, "diagnostics:", "shared error responses never include diagnostics objects");

  const funnel = read("lib/analytics/mastering-funnel.ts");
  assertIncludes(funnel, "maskEmail(normalized)", "server funnel logs mask normalized email");
  assertIncludes(funnel, 'out.file_id = "<redacted-temp-id>"', "server funnel logs redact temp file IDs");

  const abuseGuard = read("lib/security/abuse-guard.ts");
  assertIncludes(abuseGuard, "sanitizeAbuseGuardMeta", "abuse guard logs sanitize metadata");
  assertIncludes(abuseGuard, 'sanitized[key] = "<redacted-temp-id>"', "abuse guard logs redact fileId");
}

function runRouteResponseLeakTests() {
  for (const relPath of TARGET_ROUTES) {
    const route = read(relPath);
    if (relPath !== "app/api/adaptive/export-access/route.ts") {
      assertIncludes(route, "apiErrorResponse", `${relPath} uses coded API error responses`);
    }
    assertIncludes(route, "API_ERROR_CODES", `${relPath} uses stable error codes`);
    assertIncludes(route, "logApiError", `${relPath} uses redacted internal error logging`);
    assertExcludes(route, "Detail: ${detail}", `${relPath} does not concatenate raw details into responses`);
    assertExcludes(route, "Unable to download file. ${detail}", `${relPath} does not leak download exception text`);
    assertExcludes(route, "candidatesTried", `${relPath} does not return ffmpeg candidate paths`);
    assertExcludes(route, "errorStack", `${relPath} does not return stack details`);
    assertExcludes(route, "diagnostics:", `${relPath} does not return diagnostics payloads`);
    assertExcludes(route, "requestBody: error.debug?.requestBody", `${relPath} does not log adaptive request bodies`);
    assertExcludes(route, "openAiErrorPayload: error.debug?.openAiErrorPayload", `${relPath} does not log OpenAI error payloads`);
  }

  const master = read("app/api/master/route.ts");
  assertIncludes(master, "API_ERROR_CODES.ffmpegUnavailable", "master route returns stable ffmpeg unavailable code");
  assertIncludes(master, "API_ERROR_CODES.masteringFailed", "master route returns stable mastering failure code");
  assertExcludes(master, "error: error.message", "master route does not return raw ffmpeg message");
  assertExcludes(master, "stderrHintFromMessage", "master route does not return stderr snippets");
  assertExcludes(master, "inputFilePath", "master route does not log upload file paths");
  assertExcludes(master, "tempRoot", "master route does not log temp root");

  const masterAi = read("app/api/master-ai/route.ts");
  assertIncludes(masterAi, "API_ERROR_CODES.adaptiveAiUnavailable", "master-ai route returns adaptive AI code");
  assertIncludes(masterAi, "API_ERROR_CODES.adaptiveMasteringFailed", "master-ai route returns generic adaptive failure code");
  assertIncludes(masterAi, "requestBodyPresent", "master-ai debug logs only request body presence");
  assertIncludes(masterAi, "openAiErrorPayloadPresent", "master-ai debug logs only OpenAI payload presence");
  assertExcludes(masterAi, "detail: error.code", "master-ai route does not expose raw detail field");

  const analyze = read("app/api/analyze-track/route.ts");
  assertIncludes(analyze, "API_ERROR_CODES.trackAnalysisFailed", "analyze-track returns stable analysis code");
  assertExcludes(analyze, "`Track analysis failed. Detail:", "analyze-track does not expose raw analysis error text");

  const adaptiveExport = read("app/api/adaptive/export-access/route.ts");
  assertIncludes(adaptiveExport, "API_ERROR_CODES.adaptiveExportReconcileFailed", "adaptive export logs reconcile code");
  assertIncludes(adaptiveExport, "API_ERROR_CODES.adaptiveExportUnlockFailed", "adaptive export returns unlock failure code");
  assertIncludes(adaptiveExport, "API_ERROR_CODES.adaptiveExportLeadFailed", "adaptive export returns lead failure code");
  assertIncludes(adaptiveExport, "sanitizeLogDetails({", "adaptive export redacts temp token logs");

  const download = read("app/api/download/route.ts");
  assertIncludes(download, "API_ERROR_CODES.downloadVerificationFailed", "download route returns verification code");
  assertIncludes(download, "API_ERROR_CODES.downloadEntitlementCheckFailed", "download route returns entitlement check code");
  assertIncludes(download, "API_ERROR_CODES.downloadRecordFailed", "download route returns download accounting code");
  assertIncludes(download, "API_ERROR_CODES.downloadFailed", "download route returns catch-all download code");
  assertIncludes(download, "JSON.stringify(sanitizeLogDetails({", "download quota denial log is sanitized");
}

function runUnchangedBehaviorInvariants() {
  const master = read("app/api/master/route.ts");
  assertIncludes(master, "runMasteringPipeline({", "standard master route still runs standard pipeline");
  assertIncludes(master, "inputPath: uploadRecord.filePath", "standard master route still processes saved upload");
  assertIncludes(master, "resolveEncodeOutputQuality(", "standard master route still resolves billing quality before DSP");
  assertBefore(
    master,
    "resolveEncodeOutputQuality(",
    "result = await runMasteringPipeline({",
    "standard master route keeps billing quality resolution before DSP"
  );

  const masterAi = read("app/api/master-ai/route.ts");
  assertIncludes(masterAi, "resolveAdaptiveSourceAudio", "master-ai route still uses adaptive source resolver");
  assertIncludes(masterAi, "inputPath: sourceAudio.record.filePath", "adaptive pipeline still uses resolved source audio");
  assertIncludes(masterAi, "runAdaptiveMasteringPipeline({", "master-ai route still runs adaptive pipeline");
  assertBefore(
    masterAi,
    "resolveEncodeOutputQuality(",
    "await runAdaptiveMasteringPipeline({",
    "master-ai route keeps billing quality resolution before adaptive DSP"
  );

  const adaptiveExport = read("app/api/adaptive/export-access/route.ts");
  assertIncludes(adaptiveExport, "resolveAdaptiveEntitlementForEmail", "adaptive export still resolves entitlement");
  assertIncludes(adaptiveExport, "reconcileCheckoutSessionForAdaptiveRecheck", "adaptive export still supports recheck reconciliation");
  assertIncludes(adaptiveExport, "upsertMasterJobUnlock", "adaptive export still persists unlock");
  assertIncludes(adaptiveExport, "markJobDownloadUnlocked", "adaptive export still supports local unlock fallback");
  assertIncludes(adaptiveExport, "buildAdaptiveDownloadUrl(masteredFileId)", "adaptive export download URL behavior is unchanged");
  assertExcludes(adaptiveExport, "createCheckout", "adaptive export still does not create checkout sessions");

  const download = read("app/api/download/route.ts");
  assertIncludes(download, "noMastersRemainingPayload", "download route keeps quota exhaustion payload");
  assertIncludes(download, "shouldEnforceWavDownloadQuota", "download route keeps WAV quota gate");
  assertIncludes(download, "tryConsumeLocalBillableDownload", "download route keeps local quota fallback");
  assertIncludes(download, "hasRecentBillableDownloadForJobFile", "download route keeps idempotent Supabase quota check");
  assertIncludes(download, "recordMasteredDownloadAttempt", "download route keeps download accounting");
  assertIncludes(download, "ensureMasteredMp3ForJob", "download route keeps lazy MP3 master export");
  assertIncludes(download, "const skipStandardQuota = isAdaptiveMasterJob", "adaptive final exports still skip standard quota");
}

runSharedHardeningTests();
runRouteResponseLeakTests();
runUnchangedBehaviorInvariants();
console.log("api error hardening invariants passed");
