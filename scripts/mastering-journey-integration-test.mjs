/**
 * Mastering journey contract tests.
 *
 * NOT full HTTP route integration. This script combines:
 * - FFmpeg fixture simulations (flow1 only; fails hard if ffmpeg is unavailable)
 * - In-memory adaptive source resolver mirror (flows 2–4, 6)
 * - Real production quota policy imports (flow5)
 * - Static route/UI source invariant checks (all flows)
 *
 * No network, Stripe, Supabase, OpenAI, or production credentials required.
 */
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import assert from "node:assert/strict";
import {
  MASTERING_JOURNEY_ROUTES,
  assertBefore,
  assertExcludes,
  assertIncludes,
  assertNotIncludes,
  buildSimulatedAdaptiveMasterResponse,
  buildSimulatedAnalyzeTrackResponse,
  buildSimulatedStandardMasterResponse,
  createTempRecordStore,
  isBillableWavExport,
  isUnmeteredMp3Download,
  read,
  requireFfmpeg,
  resolveAdaptiveSourceAudioMirror,
  shouldEnforceWavDownloadQuota,
  simulateMp3MasterExport,
  simulateStandardMasterOutputs,
  validateAcceptedUpload,
  validateAdaptiveMasterResponse,
  validateAnalyzeTrackResponse,
  validateErrorResponseSafe,
  validateStandardMasterResponse,
  generateTestWav,
  probeDurationSec,
  MAX_UPLOAD_FILE_SIZE_BYTES
} from "./lib/mastering-journey-helpers.mjs";

// ---------------------------------------------------------------------------
// Flow 1 — Standard Master happy path
// ---------------------------------------------------------------------------
function flow1_standardMasterHappyPath() {
  const ffmpeg = requireFfmpeg();
  const workDir = mkdtempSync(path.join(tmpdir(), "mastersouce-journey-standard-"));
  try {
    const sourceWav = path.join(workDir, "upload.wav");
    generateTestWav(sourceWav, 10);

    const outputs = simulateStandardMasterOutputs(workDir, sourceWav);
    const duration = probeDurationSec(sourceWav);
    assert.ok(duration > 8, "fixture audio has expected duration");

    const store = createTempRecordStore();
    const jobId = "job_integration_test01";
    const upload = store.add({
      id: "upload_integration01",
      filePath: sourceWav,
      kind: "upload",
      mime: "audio/wav",
      jobId,
      expiresAt: Date.now() + 30 * 60 * 1000
    });
    const mastered = store.add({
      id: "mastered_integration01",
      filePath: outputs.masteredWav,
      kind: "mastered",
      mime: "audio/wav",
      jobId,
      expiresAt: Date.now() + 30 * 60 * 1000
    });
    const originalPreview = store.add({
      id: "preview_orig01",
      filePath: outputs.originalPreview,
      kind: "preview",
      mime: "audio/mpeg",
      jobId,
      expiresAt: Date.now() + 30 * 60 * 1000
    });
    const masteredPreview = store.add({
      id: "preview_master01",
      filePath: outputs.masteredPreview,
      kind: "preview",
      mime: "audio/mpeg",
      jobId,
      expiresAt: Date.now() + 30 * 60 * 1000
    });

    const response = buildSimulatedStandardMasterResponse({
      jobId,
      upload,
      mastered,
      originalPreview,
      masteredPreview,
      analysis: outputs.analysis
    });
    assert.equal(response._internal.uploadFilePath, sourceWav, "standard master processes upload path");
    assert.notEqual(response._internal.masteredFilePath, sourceWav, "mastered output is distinct from upload");
    delete response._internal;
    validateStandardMasterResponse(response);

    const mp3Export = simulateMp3MasterExport(workDir, outputs.masteredWav);
    assert.ok(mp3Export.probe.durationSec > 0, "MP3 master export path remains available");

    const masterRoute = read("app/api/master/route.ts");
    assertIncludes(masterRoute, "runMasteringPipeline({", "standard route runs mastering pipeline");
    assertIncludes(masterRoute, "inputPath: uploadRecord.filePath", "standard route uses upload as DSP input");
    assertIncludes(masterRoute, 'kind: "mastered"', "standard route registers mastered export");
    assertIncludes(read("app/api/download/route.ts"), "ensureMasteredMp3ForJob", "download route lazy MP3 master");
    assertIncludes(masterRoute, 'requiresEmail: true as const', "standard export requires email unlock");
    assertIncludes(masterRoute, "original-preview.mp3", "standard original preview filename");
    assertIncludes(masterRoute, "mastered-preview.mp3", "standard mastered preview filename");

    const analyzeRoute = read("app/api/analyze-track/route.ts");
    assertIncludes(analyzeRoute, "analyzeTrack(uploadRecord.filePath)", "analyze route analyzes upload");
    assertNotIncludes(analyzeRoute, "runMasteringPipeline", "analyze route does not master");

    console.log("flow1_standardMasterHappyPath: ok", { ffmpeg, durationSec: duration });
  } finally {
    rmSync(workDir, { recursive: true, force: true });
  }
}

// ---------------------------------------------------------------------------
// Flow 2 — Adaptive Master happy path (source-audio-first, no standard first)
// ---------------------------------------------------------------------------
function flow2_adaptiveDirectHappyPath() {
  const store = createTempRecordStore();
  const uploadPath = "/tmp/premaster-upload.wav";
  const masteredPath = "/tmp/rendered-master.wav";

  store.add({
    id: "upload_adaptive01",
    filePath: uploadPath,
    kind: "upload",
    mime: "audio/wav",
    jobId: "analysis_adaptive01",
    expiresAt: Date.now() + 30 * 60 * 1000
  });
  store.add({
    id: "mastered_adaptive01",
    filePath: masteredPath,
    kind: "mastered",
    mime: "audio/wav",
    jobId: "job_adaptive01",
    expiresAt: Date.now() + 30 * 60 * 1000
  });

  const inlineResult = resolveAdaptiveSourceAudioMirror(
    {
      inlineAudio: { name: "track.wav", type: "audio/wav", size: 1024 },
      inlineJobId: "adaptive_inline01"
    },
    store
  );
  assert.equal(inlineResult.ok, true, "adaptive accepts inline upload");
  assert.equal(inlineResult.resolvedBy, "inline");
  assert.equal(inlineResult.record.kind, "upload");
  assert.notEqual(inlineResult.record.filePath, masteredPath, "inline path is not mastered output");

  const jobLookup = resolveAdaptiveSourceAudioMirror({ jobId: "analysis_adaptive01" }, store);
  assert.equal(jobLookup.ok, true, "adaptive resolves prior analyze upload by jobId");
  assert.equal(jobLookup.record.filePath, uploadPath);
  assert.equal(jobLookup.resolvedBy, "jobId");

  const adaptiveMaster = store.add({
    id: "mastered_adaptive_out",
    filePath: "/tmp/adaptive-master.wav",
    kind: "mastered",
    mime: "audio/wav",
    jobId: "adaptive_job01",
    expiresAt: Date.now() + 30 * 60 * 1000
  });
  const standardPreview = store.add({
    id: "preview_std_adaptive",
    filePath: "/tmp/std-preview.mp3",
    kind: "preview",
    mime: "audio/mpeg",
    jobId: "adaptive_job01",
    expiresAt: Date.now() + 30 * 60 * 1000
  });
  const adaptivePreview = store.add({
    id: "preview_adaptive",
    filePath: "/tmp/adaptive-preview.mp3",
    kind: "preview",
    mime: "audio/mpeg",
    jobId: "adaptive_job01",
    expiresAt: Date.now() + 30 * 60 * 1000
  });

  const response = buildSimulatedAdaptiveMasterResponse({
    jobId: "adaptive_job01",
    adaptiveMaster,
    standardPreview,
    adaptivePreview,
    sourceUpload: jobLookup.record
  });
  assert.equal(response._internal.sourceKind, "upload", "adaptive DSP input is upload kind");
  assert.notEqual(response._internal.sourceInputPath, masteredPath, "adaptive does not use mastered file as input");
  delete response._internal;
  validateAdaptiveMasterResponse(response);

  const uploadForm = read("components/upload-form.tsx");
  assertNotIncludes(uploadForm, "standard = await runStandardMastering(true)", "adaptive UI skips standard master first");
  assertNotIncludes(
    uploadForm,
    "standardMasterFileId: standard.download.fileId",
    "adaptive UI does not send mastered fileId"
  );
  assertIncludes(uploadForm, "if (!adaptiveSourceRef) formData.append(\"audio\", file)", "adaptive inline audio fallback");

  const masterAiRoute = read("app/api/master-ai/route.ts");
  assertIncludes(masterAiRoute, "inputPath: sourceAudio.record.filePath", "adaptive pipeline uses resolved upload path");
  assertNotIncludes(masterAiRoute, "inputPath: standardRecord.filePath", "adaptive does not use standard master path");

  console.log("flow2_adaptiveDirectHappyPath: ok");
}

// ---------------------------------------------------------------------------
// Flow 3 — Analyze → Standard → Adaptive
// ---------------------------------------------------------------------------
function flow3_analyzeStandardAdaptive() {
  const store = createTempRecordStore();
  const now = Date.now() + 60_000;

  const analyzeUpload = store.add({
    id: "upload_analysis01",
    filePath: "/tmp/analyze-upload.wav",
    kind: "upload",
    mime: "audio/wav",
    jobId: "analysis_chain01",
    expiresAt: now
  });

  const standardJobId = "job_chain01";
  const standardUpload = store.add({
    id: "upload_standard01",
    filePath: "/tmp/standard-upload.wav",
    kind: "upload",
    mime: "audio/wav",
    jobId: standardJobId,
    expiresAt: now + 1000
  });
  const standardMastered = store.add({
    id: "mastered_standard01",
    filePath: "/tmp/standard-mastered.wav",
    kind: "mastered",
    mime: "audio/wav",
    jobId: standardJobId,
    expiresAt: now + 1000
  });

  const analyzeResponse = buildSimulatedAnalyzeTrackResponse({
    fileId: analyzeUpload.id,
    jobId: analyzeUpload.jobId
  });
  validateAnalyzeTrackResponse(analyzeResponse);

  const fromStandardJob = resolveAdaptiveSourceAudioMirror({ jobId: standardJobId }, store);
  assert.equal(fromStandardJob.ok, true, "adaptive resolves upload from standard job");
  assert.equal(fromStandardJob.record.id, standardUpload.id);
  assert.equal(fromStandardJob.record.kind, "upload");
  assert.notEqual(fromStandardJob.record.filePath, standardMastered.filePath, "adaptive ignores rendered standard master");

  const fromMasteredFileId = resolveAdaptiveSourceAudioMirror(
    { fileId: standardMastered.id, jobId: standardJobId },
    store
  );
  assert.equal(fromMasteredFileId.ok, true, "mastered fileId falls through to upload job lookup");
  assert.equal(fromMasteredFileId.record.id, standardUpload.id);
  assert.equal(fromMasteredFileId.resolvedBy, "jobId");

  const uploadForm = read("components/upload-form.tsx");
  assertIncludes(
    uploadForm,
    "const adaptiveSourceRef: Partial<SourceUploadRef> | null = standard ? { jobId: standard.jobId } : sourceUploadRef",
    "adaptive prefers standard job upload lookup after standard master"
  );

  console.log("flow3_analyzeStandardAdaptive: ok");
}

// ---------------------------------------------------------------------------
// Flow 4 — Expired or missing source file
// ---------------------------------------------------------------------------
function flow4_expiredMissingSource() {
  const store = createTempRecordStore();

  const missing = resolveAdaptiveSourceAudioMirror({}, store);
  assert.equal(missing.ok, false);
  assert.equal(missing.status, 400);
  assert.equal(missing.code, "missing_original_upload");
  validateErrorResponseSafe({ error: missing.error, code: missing.code }, "missing source 400");

  const masteredOnly = store.add({
    id: "mastered_only01",
    filePath: "/tmp/only-mastered.wav",
    kind: "mastered",
    mime: "audio/wav",
    jobId: "job_expired01",
    expiresAt: Date.now() + 60_000
  });
  const expiredMastered = resolveAdaptiveSourceAudioMirror({ fileId: masteredOnly.id }, store);
  assert.equal(expiredMastered.ok, false);
  assert.equal(expiredMastered.status, 404);
  assert.equal(expiredMastered.code, "missing_original_upload");
  assert.match(
    expiredMastered.error,
    /mastered files cannot be used for adaptive mastering/i,
    "mastered-only rejection message"
  );
  validateErrorResponseSafe({ error: expiredMastered.error, code: expiredMastered.code }, "mastered-only 404");

  const expiredUpload = store.add({
    id: "upload_expired01",
    filePath: "/tmp/expired-upload.wav",
    kind: "upload",
    mime: "audio/wav",
    jobId: "job_expired02",
    expiresAt: Date.now() + 60_000
  });
  store.expire(expiredUpload.id);
  const expiredLookup = resolveAdaptiveSourceAudioMirror({ jobId: "job_expired02" }, store);
  assert.equal(expiredLookup.ok, false);
  assert.equal(expiredLookup.code, "missing_original_upload");
  validateErrorResponseSafe({ error: expiredLookup.error, code: expiredLookup.code }, "expired upload 404");

  const masterAiRoute = read("app/api/master-ai/route.ts");
  assertIncludes(
    masterAiRoute,
    "NextResponse.json({ error: sourceAudio.error, code: sourceAudio.code }",
    "master-ai returns stable source resolver codes"
  );
  assertExcludes(masterAiRoute, "errorStack", "master-ai does not return stack traces");

  console.log("flow4_expiredMissingSource: ok");
}

// ---------------------------------------------------------------------------
// Flow 5 — Download / export guards
// ---------------------------------------------------------------------------
function flow5_downloadExportGuards() {
  const masteredWav = { kind: "mastered", mime: "audio/wav" };
  const previewMp3 = { kind: "preview", mime: "audio/mpeg" };
  const masteredMp3 = { kind: "mastered_mp3", mime: "audio/mpeg" };

  assert.equal(isBillableWavExport(masteredWav), true, "final WAV is billable");
  assert.equal(isUnmeteredMp3Download(previewMp3), true, "preview MP3 is unmetered");
  assert.equal(isUnmeteredMp3Download(masteredMp3), true, "full MP3 master is unmetered");
  assert.equal(
    shouldEnforceWavDownloadQuota({
      record: masteredWav,
      forceDownload: true,
      isAdaptiveMasterJob: false,
      adminBypass: false
    }),
    true,
    "standard WAV dl=1 enforces quota"
  );
  assert.equal(
    shouldEnforceWavDownloadQuota({
      record: masteredWav,
      forceDownload: true,
      isAdaptiveMasterJob: true,
      adminBypass: false
    }),
    false,
    "adaptive final export skips standard quota"
  );
  assert.equal(
    shouldEnforceWavDownloadQuota({
      record: masteredWav,
      forceDownload: true,
      isAdaptiveMasterJob: false,
      adminBypass: true
    }),
    false,
    "admin bypass skips quota"
  );
  assert.equal(
    shouldEnforceWavDownloadQuota({
      record: previewMp3,
      forceDownload: false,
      isAdaptiveMasterJob: false,
      adminBypass: false
    }),
    false,
    "preview downloads skip quota"
  );

  const downloadRoute = read("app/api/download/route.ts");
  assertIncludes(downloadRoute, "noMastersRemainingPayload", "quota exhaustion payload preserved");
  assertIncludes(downloadRoute, "isMasterAdminBypassGranted", "owner bypass preserved");
  assertIncludes(downloadRoute, "isAdminEntitlementOverrideEmail", "admin email override preserved");
  assertIncludes(downloadRoute, "const skipStandardQuota = isAdaptiveMasterJob", "adaptive quota skip preserved");
  assertIncludes(downloadRoute, "ensureMasteredMp3ForJob", "MP3 export path preserved");

  const adaptiveExport = read("app/api/adaptive/export-access/route.ts");
  assertIncludes(adaptiveExport, "resolveAdaptiveEntitlementForEmail", "adaptive export entitlement gate preserved");
  assertIncludes(adaptiveExport, "buildAdaptiveDownloadUrl", "adaptive export URL builder preserved");
  assertIncludes(adaptiveExport, 'status: "checkout_required"', "adaptive export checkout gate preserved");
  assertExcludes(adaptiveExport, "createCheckout", "adaptive export does not create checkout sessions");

  const captureEmail = read("app/api/capture-email/route.ts");
  assertIncludes(captureEmail, "upsertMasterJobUnlock", "standard export unlock preserved");
  assertIncludes(captureEmail, "mp3DownloadUrl", "standard MP3 download URL preserved");

  console.log("flow5_downloadExportGuards: ok");
}

// ---------------------------------------------------------------------------
// Flow 6 — Invalid input / error paths
// ---------------------------------------------------------------------------
function flow6_invalidInputErrorPaths() {
  const unsupported = validateAcceptedUpload("track.flac", "audio/flac", 1024);
  assert.equal(unsupported.ok, false);
  assert.match(unsupported.error, /Only WAV or MP3/i);

  const oversized = validateAcceptedUpload("track.wav", "audio/wav", MAX_UPLOAD_FILE_SIZE_BYTES + 1);
  assert.equal(oversized.ok, false);
  assert.match(oversized.error, /maximum upload size/i);

  const store = createTempRecordStore();
  const badJob = resolveAdaptiveSourceAudioMirror({ jobId: "job_does_not_exist" }, store);
  assert.equal(badJob.ok, false);
  assert.equal(badJob.code, "missing_original_upload");

  const badFile = resolveAdaptiveSourceAudioMirror({ fileId: "upload_nonexistent" }, store);
  assert.equal(badFile.ok, false);
  assert.equal(badFile.code, "missing_original_upload");

  const invalidInline = resolveAdaptiveSourceAudioMirror(
    {
      inlineAudio: { name: "track.flac", type: "audio/flac", size: 100 },
      inlineJobId: "adaptive_bad01"
    },
    store
  );
  assert.equal(invalidInline.ok, false);
  assert.equal(invalidInline.code, "invalid_inline_audio");
  validateErrorResponseSafe({ error: invalidInline.error, code: invalidInline.code }, "invalid inline audio");

  const masterRoute = read("app/api/master/route.ts");
  assertIncludes(masterRoute, 'error: "Audio file is required."', "master missing audio message");
  assertIncludes(masterRoute, "Only WAV or MP3 are supported for MVP.", "master unsupported format message");
  assertIncludes(masterRoute, "FfmpegBinaryMissingError", "master handles ffmpeg missing");
  assertIncludes(masterRoute, "API_ERROR_CODES.ffmpegUnavailable", "master ffmpeg unavailable code");

  const analyzeRoute = read("app/api/analyze-track/route.ts");
  assertIncludes(analyzeRoute, 'error: "Audio file is required."', "analyze missing audio message");
  assertIncludes(analyzeRoute, "API_ERROR_CODES.trackAnalysisFailed", "analyze stable failure code");

  const masterAiRoute = read("app/api/master-ai/route.ts");
  assertIncludes(masterAiRoute, '"Expected JSON or multipart body."', "master-ai invalid body message");
  assertIncludes(masterAiRoute, '"Invalid adaptive mastering request payload."', "master-ai invalid payload message");

  for (const relPath of MASTERING_JOURNEY_ROUTES) {
    const route = read(relPath);
    assertExcludes(route, "candidatesTried", `${relPath} does not expose ffmpeg candidate paths`);
    assertExcludes(route, "errorStack", `${relPath} does not return error stacks`);
  }

  const masterRouteFfmpeg = read("app/api/master/route.ts");
  assertBefore(
    masterRouteFfmpeg,
    "FfmpegBinaryMissingError",
    "API_ERROR_CODES.ffmpegUnavailable",
    "master maps ffmpeg missing to stable code"
  );
  assertIncludes(
    masterRouteFfmpeg,
    'message: "Mastering is temporarily unavailable. Please try again."',
    "ffmpeg unavailable user message"
  );

  console.log("flow6_invalidInputErrorPaths: ok");
}

// ---------------------------------------------------------------------------
// Cross-route contract invariants (journey wiring)
// ---------------------------------------------------------------------------
function runJourneyContractInvariants() {
  for (const relPath of MASTERING_JOURNEY_ROUTES) {
    const route = read(relPath);
    if (relPath.includes("export-access")) {
      assertIncludes(route, "API_ERROR_CODES", `${relPath} uses stable error codes`);
    } else if (relPath.includes("capture-email")) {
      assertIncludes(route, "upsertMasterJobUnlock", `${relPath} unlocks standard export`);
      assertExcludes(route, "errorStack", `${relPath} does not return error stacks`);
    } else {
      assertIncludes(route, "apiErrorResponse", `${relPath} uses coded API error responses`);
      assertIncludes(route, "API_ERROR_CODES", `${relPath} uses stable error codes`);
    }
  }

  const master = read("app/api/master/route.ts");
  assertBefore(
    master,
    "resolveEncodeOutputQuality(",
    "result = await runMasteringPipeline({",
    "billing quality resolves before standard DSP"
  );

  const masterAi = read("app/api/master-ai/route.ts");
  assertBefore(
    masterAi,
    "resolveEncodeOutputQuality(",
    "await runAdaptiveMasteringPipeline({",
    "billing quality resolves before adaptive DSP"
  );
  assertBefore(
    masterAi,
    "resolveAdaptiveSourceAudio",
    "runAdaptiveMasteringPipeline({",
    "source audio resolves before adaptive DSP"
  );

  console.log("runJourneyContractInvariants: ok");
}

flow1_standardMasterHappyPath();
flow2_adaptiveDirectHappyPath();
flow3_analyzeStandardAdaptive();
flow4_expiredMissingSource();
flow5_downloadExportGuards();
flow6_invalidInputErrorPaths();
runJourneyContractInvariants();

console.log("mastering-journey-integration-test: ok");
