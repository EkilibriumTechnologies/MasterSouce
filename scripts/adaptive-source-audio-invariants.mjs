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

function assertNotIncludes(content, needle, context) {
  assert.equal(content.includes(needle), false, `${context}: unexpected "${needle}"`);
}

function resolveMockAdaptiveSourceAudio({ fileId, jobId }, records) {
  let sawMasteredRecord = false;
  if (fileId) {
    const record = records.find((item) => item.id === fileId) ?? null;
    if (record?.kind === "upload") {
      if (jobId && record.jobId !== jobId) {
        return { ok: false, code: "missing_original_upload" };
      }
      return { ok: true, record, resolvedBy: "fileId" };
    }
    if (record?.kind === "mastered") {
      sawMasteredRecord = true;
    }
  }

  if (jobId) {
    const uploads = records
      .filter((item) => item.kind === "upload" && item.jobId === jobId)
      .sort((a, b) => b.expiresAt - a.expiresAt);
    if (uploads[0]) {
      return { ok: true, record: uploads[0], resolvedBy: "jobId" };
    }
  }

  return {
    ok: false,
    code: "missing_original_upload",
    sawMasteredRecord
  };
}

function runResolverBehaviorTests() {
  const now = Date.now();
  const upload = { id: "upload_12345678", kind: "upload", jobId: "job_a", expiresAt: now + 1000 };
  const olderUpload = { id: "upload_older", kind: "upload", jobId: "job_b", expiresAt: now + 500 };
  const latestUpload = { id: "upload_latest", kind: "upload", jobId: "job_b", expiresAt: now + 1500 };
  const mastered = { id: "mastered_12345678", kind: "mastered", jobId: "job_c", expiresAt: now + 1000 };
  const masteredWithUpload = { id: "mastered_with_upload", kind: "mastered", jobId: "job_a", expiresAt: now + 1000 };

  const byFileId = resolveMockAdaptiveSourceAudio({ fileId: upload.id, jobId: upload.jobId }, [upload]);
  assert.equal(byFileId.ok, true, "resolver accepts upload fileId");
  assert.equal(byFileId.record.id, upload.id);
  assert.equal(byFileId.resolvedBy, "fileId");

  const byJobId = resolveMockAdaptiveSourceAudio({ jobId: "job_b" }, [olderUpload, latestUpload]);
  assert.equal(byJobId.ok, true, "resolver accepts upload job lookup");
  assert.equal(byJobId.record.id, latestUpload.id);
  assert.equal(byJobId.resolvedBy, "jobId");

  const masteredOnly = resolveMockAdaptiveSourceAudio({ fileId: mastered.id, jobId: mastered.jobId }, [mastered]);
  assert.equal(masteredOnly.ok, false, "resolver rejects mastered-only records");
  assert.equal(masteredOnly.code, "missing_original_upload");
  assert.equal(masteredOnly.sawMasteredRecord, true);

  const backwardCompatible = resolveMockAdaptiveSourceAudio(
    { fileId: masteredWithUpload.id, jobId: upload.jobId },
    [masteredWithUpload, upload]
  );
  assert.equal(backwardCompatible.ok, true, "mastered fileId falls through to original upload job lookup");
  assert.equal(backwardCompatible.record.id, upload.id);
  assert.equal(backwardCompatible.resolvedBy, "jobId");
}

function runSourceInvariantTests() {
  const resolver = read("lib/audio/resolve-adaptive-source-audio.ts");
  assertIncludes(resolver, 'kind: "upload"', "resolver saves inline adaptive audio as upload");
  assertIncludes(resolver, 'record?.kind === "upload"', "resolver only returns upload records");
  assertIncludes(resolver, 'record?.kind === "mastered"', "resolver explicitly detects mastered records");
  assertIncludes(resolver, 'findLatestRecordForJob(jobId, "upload")', "resolver looks up uploads by jobId");
  assertNotIncludes(resolver, 'findLatestRecordForJob(jobId, "mastered")', "resolver never looks up mastered records");

  const masterAiRoute = read("app/api/master-ai/route.ts");
  assertIncludes(masterAiRoute, "resolveAdaptiveSourceAudio", "master-ai route uses shared source resolver");
  assertIncludes(masterAiRoute, "inputPath: sourceAudio.record.filePath", "adaptive pipeline uses resolved original upload");
  assertNotIncludes(masterAiRoute, "standardRecord.kind !== \"mastered\"", "master-ai route no longer requires mastered input");
  assertNotIncludes(masterAiRoute, "inputPath: standardRecord.filePath", "master-ai route does not process preset master");

  const analyzeRoute = read("app/api/analyze-track/route.ts");
  assertIncludes(analyzeRoute, "source: {", "analyze-track returns additive source object");
  assertIncludes(analyzeRoute, "fileId: uploadRecord.id", "analyze-track source includes upload fileId");
  assertIncludes(analyzeRoute, "jobId: uploadRecord.jobId", "analyze-track source includes upload jobId");

  const uploadForm = read("components/upload-form.tsx");
  assertNotIncludes(uploadForm, "standard = await runStandardMastering(true)", "adaptive UI does not run preset master first");
  assertNotIncludes(uploadForm, "standardMasterFileId: standard.download.fileId", "adaptive UI does not send mastered fileId JSON");
  assertNotIncludes(uploadForm, 'formData.append("standardMasterFileId", standard.download.fileId)', "adaptive UI does not send mastered fileId multipart");
  assertIncludes(uploadForm, "const adaptiveSourceRef: Partial<SourceUploadRef> | null = standard ? { jobId: standard.jobId } : sourceUploadRef", "adaptive UI prefers standard job upload lookup over analyze source");
  assertIncludes(uploadForm, 'if (!adaptiveSourceRef) formData.append("audio", file)', "adaptive UI sends inline audio fallback");

  const pipeline = read("lib/audio/adaptive-mastering-pipeline.ts");
  assertIncludes(pipeline, "inputPath: string", "adaptive pipeline accepts source input path");
  assertIncludes(pipeline, "const baselineAnalysis = await analyzeTrack(request.inputPath)", "adaptive pipeline analyzes resolved premaster");
  assertIncludes(pipeline, "if (request.referenceAnalysis) {", "reference guidance applies for AI and heuristic summaries");
  assertNotIncludes(pipeline, 'instructionSummary.source === "heuristic"', "reference guidance is not limited to heuristic fallback");

  const standardRoute = read("app/api/master/route.ts");
  assertIncludes(standardRoute, "runMasteringPipeline({", "standard master route still uses standard pipeline");
  assertIncludes(standardRoute, "inputPath: uploadRecord.filePath", "standard master route still processes original upload");
  assertIncludes(standardRoute, 'kind: "mastered"', "standard master route still registers mastered output");
}

runResolverBehaviorTests();
runSourceInvariantTests();
console.log("adaptive-source-audio-invariants: ok");
