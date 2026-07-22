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

function run() {
  const songGenerate = read("app/api/song-architect/generate/route.ts");
  assertBefore(
    songGenerate,
    "if (!hasTrustedEmailAccess(request, trustedAccess.normalizedEmail))",
    "openAiResult = await requestSongArchitectFromOpenAI(inputPayload);",
    "song-architect generate: trusted email access gate before model usage"
  );
  assertBefore(
    songGenerate,
    "if (!hasTrustedEmailAccess(request, trustedAccess.normalizedEmail))",
    "await recordSongArchitectGenerationEvent({",
    "song-architect generate: trusted email access gate before usage credit insert"
  );

  const captureEmail = read("app/api/capture-email/route.ts");
  assertBefore(
    captureEmail,
    "if (!emailValidation.allowed || !emailValidation.normalizedEmail)",
    "await upsertMasterJobUnlock({",
    "capture-email: blocked/disposable/suspicious check before unlock persistence"
  );

  const adaptiveExport = read("app/api/adaptive/export-access/route.ts");
  assertBefore(
    adaptiveExport,
    "if (!emailValidation.allowed || !emailValidation.normalizedEmail)",
    "await upsertMasterJobUnlock({",
    "adaptive export: blocked/disposable/suspicious check before unlock persistence"
  );

  const downloadRoute = read("app/api/download/route.ts");
  assertBefore(
    downloadRoute,
    "if (isSupabaseConfigured() && masteredUnlock && !masteredUnlock.emailVerifiedAt)",
    "const recorded = await recordMasteredDownloadAttempt({",
    "download: unconfirmed email access gate before download event accounting"
  );
  assertBefore(
    downloadRoute,
    "if (isSupabaseConfigured() && masteredUnlock && !masteredUnlock.emailVerifiedAt)",
    "const entitlements = await getEntitlementsForUser(user, {",
    "download: unconfirmed email access gate before entitlement consumption checks"
  );

  const masteringPipeline = read("lib/audio/mastering-pipeline.ts");
  assertBefore(
    masteringPipeline,
    "await validateExportedWav(masteredPath, { codec: outputCodec, sampleRate: exportSampleRate });",
    "// 30s preview snippets for fast before/after checks.",
    "mastering-pipeline: export-only WAV validation before preview generation"
  );

  const adaptivePipeline = read("lib/audio/adaptive-mastering-pipeline.ts");
  assertBefore(
    adaptivePipeline,
    "await validateExportedWav(adaptiveMasteredPath, { codec: outputCodec });",
    "let adaptiveAnalysis: TrackAnalysis | null = null;",
    "adaptive-mastering-pipeline: export-only WAV validation after initial render"
  );

  const masterRoute = read("app/api/master/route.ts");
  assertBefore(
    masterRoute,
    "getEntitlementsForUser(user, billingResolution.billingContext)",
    "result = await runMasteringPipeline({",
    "master route: entitlements with billing context before WAV encode"
  );

  const masterAiRoute = read("app/api/master-ai/route.ts");
  assertBefore(
    masterAiRoute,
    "getEntitlementsForUser(user, billingResolution.billingContext)",
    "await runAdaptiveMasteringPipeline({",
    "master-ai route: entitlements with billing context before adaptive WAV encode"
  );

  console.log("anti-abuse invariants passed");
}

run();
