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

function runPanelStructureTests(uploadForm) {
  const panels = [
    "function OwnerTestingPanel",
    "function StandardMasterPanel",
    "function AdaptivePromptPanel",
    "function AnalysisSummaryPanel",
    "function ExportPanel"
  ];

  for (const panel of panels) {
    assertIncludes(uploadForm, panel, "upload form panel extraction");
  }
}

function runCoreActionTests(uploadForm) {
  assertIncludes(uploadForm, "Preset Master — instant result", "standard master button label");
  assertIncludes(uploadForm, "onRunStandard", "standard master panel callback");
  assertIncludes(uploadForm, "Prompt Master — describe your sound", "adaptive prompt button label");
  assertIncludes(uploadForm, "Run free adaptive preview", "adaptive preview button label");
  assertIncludes(uploadForm, "onRunAdaptive", "adaptive prompt panel callback");
}

function runAdaptiveSourceTests(uploadForm) {
  assertNotIncludes(uploadForm, "standard = await runStandardMastering(true)", "adaptive UI must not run standard first");
  assertNotIncludes(uploadForm, "standardMasterFileId: standard.download.fileId", "adaptive UI must not send mastered fileId JSON");
  assertNotIncludes(
    uploadForm,
    'formData.append("standardMasterFileId", standard.download.fileId)',
    "adaptive UI must not send mastered fileId multipart"
  );
  assertIncludes(
    uploadForm,
    "const adaptiveSourceRef: Partial<SourceUploadRef> | null = standard ? { jobId: standard.jobId } : sourceUploadRef",
    "adaptive source lookup remains job/source based"
  );
  assertIncludes(uploadForm, 'if (!adaptiveSourceRef) formData.append("audio", file)', "adaptive inline upload fallback");
}

function runExportGateTests(uploadForm) {
  assertIncludes(uploadForm, "function ExportPanel", "export gate panel exists");
  assertIncludes(uploadForm, "<AdaptiveExportGate", "adaptive export gate remains wired");
  assertIncludes(uploadForm, "<EmailCaptureForm", "standard email capture remains wired");
  assertIncludes(uploadForm, "buildMp3DownloadUrl(result.download.fileId, result.jobId)", "adaptive MP3 unlock URL remains wired");
  assertIncludes(uploadForm, 'data-analytics-id="ab-download"', "download analytics data id remains wired");
  assertIncludes(uploadForm, "resolveOwnerSessionToken(ownerTestingPanel)", "owner/admin download override remains wired");
}

function runAnalyticsEventTests(uploadForm) {
  const eventNames = [
    "mastering_upload_started",
    "mastering_upload_succeeded",
    "mastering_upload_failed",
    "mastering_preview_started",
    "mastering_preview_succeeded",
    "mastering_preview_failed",
    "mastering_download_clicked",
    "ab_download_clicked",
    "mp3_download_started",
    "mp3_download_completed",
    "wav_download_started",
    "wav_download_completed"
  ];

  for (const eventName of eventNames) {
    assertIncludes(uploadForm, eventName, "upload form analytics event names unchanged");
  }
}

function run() {
  const uploadForm = read("components/upload-form.tsx");
  runPanelStructureTests(uploadForm);
  runCoreActionTests(uploadForm);
  runAdaptiveSourceTests(uploadForm);
  runExportGateTests(uploadForm);
  runAnalyticsEventTests(uploadForm);
  console.log("upload-form refactor invariants passed");
}

run();
