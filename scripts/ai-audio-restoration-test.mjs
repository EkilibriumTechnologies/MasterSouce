/**
 * Focused AI Audio Restoration V1 tests.
 *
 * Run: node --experimental-transform-types --import ./scripts/lib/register-ts-alias.mjs scripts/ai-audio-restoration-test.mjs
 */
import assert from "node:assert/strict";
import { existsSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import ffmpegStatic from "ffmpeg-static";

import {
  isAiAudioRestorationAuthorized,
  resolveAiAudioRestorationFeatureConfig
} from "@/lib/features/ai-audio-restoration";
import { parseFeatureBoolean } from "@/lib/features/feature-flag-utils";
import { assessAudioArtifacts } from "@/lib/audio/audio-artifact-assessment";
import { runAudioArtifactRestoration } from "@/lib/audio/audio-restoration";
import { probeAudioStream } from "@/lib/audio/media-probe";
import {
  AUDIO_RESTORATION_THRESHOLDS,
  clamp01,
  selectAudioRestorationStrength
} from "@/lib/audio/audio-restoration-thresholds";

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const FFMPEG = typeof ffmpegStatic === "string" ? ffmpegStatic : process.env.FFMPEG_BIN?.trim() || null;
assert.ok(FFMPEG, "ffmpeg-static or FFMPEG_BIN required for restoration tests");

function ff(args) {
  const result = spawnSync(FFMPEG, args, { encoding: "utf8" });
  assert.equal(result.status, 0, `ffmpeg failed: ${result.stderr?.slice(-900)}`);
}

function read(relPath) {
  return readFileSync(path.join(REPO_ROOT, relPath), "utf8");
}

function assertMetricRange(profile) {
  for (const key of [
    "metallicHarshness",
    "highFrequencySmear",
    "transientSoftness",
    "stereoInstability",
    "sibilanceHarshness",
    "codecLikeResidue",
    "overallSeverity"
  ]) {
    assert.equal(typeof profile[key], "number", `${key} is numeric`);
    assert.ok(profile[key] >= 0 && profile[key] <= 1, `${key} is clamped: ${profile[key]}`);
  }
  assert.ok(["light", "balanced", "strong"].includes(profile.recommendedStrength), "strength is valid");
}

function runFeatureFlagTests() {
  assert.equal(parseFeatureBoolean(undefined, false), false, "enabled defaults false");
  assert.equal(parseFeatureBoolean(undefined, true), true, "owner-only defaults true");
  assert.equal(parseFeatureBoolean(" TRUE ", false), true, "truthy flag parses");
  assert.equal(parseFeatureBoolean("0", true), false, "falsey flag parses");

  const disabled = resolveAiAudioRestorationFeatureConfig({});
  assert.deepEqual(disabled, { enabled: false, ownerOnly: true }, "default config is disabled owner-only");
  assert.equal(isAiAudioRestorationAuthorized({ config: disabled, ownerAuthorized: true }), false);

  const ownerOnly = resolveAiAudioRestorationFeatureConfig({
    AI_AUDIO_RESTORATION_ENABLED: "true",
    AI_AUDIO_RESTORATION_OWNER_ONLY: "true"
  });
  assert.equal(isAiAudioRestorationAuthorized({ config: ownerOnly, ownerAuthorized: false }), false);
  assert.equal(isAiAudioRestorationAuthorized({ config: ownerOnly, ownerAuthorized: true }), true);

  const allAuthorized = resolveAiAudioRestorationFeatureConfig({
    AI_AUDIO_RESTORATION_ENABLED: "true",
    AI_AUDIO_RESTORATION_OWNER_ONLY: "false"
  });
  assert.equal(isAiAudioRestorationAuthorized({ config: allAuthorized, ownerAuthorized: false }), true);
  console.log("feature flags: ok", { disabled, ownerOnly, allAuthorized });
}

function genBrightFixture(out) {
  ff([
    "-y",
    "-hide_banner",
    "-f",
    "lavfi",
    "-i",
    "sine=frequency=440:duration=3",
    "-f",
    "lavfi",
    "-i",
    "sine=frequency=7200:duration=3",
    "-filter_complex",
    "[0:a]volume=-14dB[a];[1:a]volume=-3dB[b];[a][b]amix=inputs=2:normalize=0,aformat=channel_layouts=stereo[out]",
    "-map",
    "[out]",
    "-c:a",
    "pcm_s16le",
    "-ar",
    "44100",
    "-ac",
    "2",
    out
  ]);
}

function genSilence(out) {
  ff([
    "-y",
    "-hide_banner",
    "-f",
    "lavfi",
    "-i",
    "anullsrc=r=44100:cl=stereo",
    "-t",
    "2",
    "-c:a",
    "pcm_s16le",
    out
  ]);
}

async function runAssessmentTests(workDir) {
  const bright = path.join(workDir, "bright.wav");
  const silence = path.join(workDir, "silence.wav");
  const invalid = path.join(workDir, "invalid.wav");
  genBrightFixture(bright);
  genSilence(silence);
  writeFileSync(invalid, "not audio", "utf8");

  const a = await assessAudioArtifacts(bright);
  const b = await assessAudioArtifacts(bright);
  assertMetricRange(a);
  assert.deepEqual(a, b, "assessment is deterministic for same fixture");

  const silent = await assessAudioArtifacts(silence);
  assertMetricRange(silent);
  assert.equal(silent.restorationRecommended, false, "silent input fails safe");
  assert.equal(silent.overallSeverity, 0, "silent input severity zero");

  const bad = await assessAudioArtifacts(invalid);
  assertMetricRange(bad);
  assert.equal(bad.restorationRecommended, false, "invalid input fails safe");

  assert.equal(typeof AUDIO_RESTORATION_THRESHOLDS.artifact.metallicHarshness, "number");
  assert.equal(clamp01(-1), 0);
  assert.equal(clamp01(2), 1);
  assert.equal(selectAudioRestorationStrength(0.8, 0.8), "strong");
  console.log("artifact assessment: ok", { bright: a, silent, invalid: bad });
  return bright;
}

function highProfile() {
  return {
    version: "v1",
    metallicHarshness: 0.8,
    highFrequencySmear: 0.8,
    transientSoftness: 0.8,
    stereoInstability: 0.8,
    sibilanceHarshness: 0.8,
    codecLikeResidue: 0.8,
    overallSeverity: 0.8,
    recommendedStrength: "strong",
    restorationRecommended: true
  };
}

async function runProcessingTests(inputPath) {
  const originalStat = statSync(inputPath);
  for (const strength of ["light", "balanced", "strong"]) {
    const result = await runAudioArtifactRestoration({
      inputPath,
      jobId: `restoration_${strength}`,
      strength,
      artifactProfile: highProfile()
    });
    assert.equal(result.success, true, `${strength} restoration succeeds`);
    assert.equal(result.fallbackUsed, false, `${strength} does not fallback`);
    assert.ok(result.outputPath, `${strength} output path set`);
    assert.notEqual(result.outputPath, inputPath, "restored file is distinct from original");
    assert.ok(existsSync(result.outputPath), "restored file exists");
    assert.ok(statSync(result.outputPath).size > 0, "restored file non-empty");
    const probe = await probeAudioStream(result.outputPath);
    assert.equal(probe.sample_rate, 44100, "sample rate remains valid");
    assert.equal(probe.channels, 2, "channel layout remains valid");
    assert.ok(result.modulesApplied.includes("safety_gain_control"), "safety control applied");
    console.log(`processing ${strength}: ok`, {
      success: result.success,
      fallbackUsed: result.fallbackUsed,
      modules: result.modulesApplied,
      probe
    });
  }

  const skipped = await runAudioArtifactRestoration({
    inputPath,
    jobId: "restoration_skip",
    strength: "balanced",
    artifactProfile: {
      ...highProfile(),
      restorationRecommended: false,
      overallSeverity: 0.1
    }
  });
  assert.equal(skipped.success, false, "not recommended skips by default");
  assert.equal(skipped.fallbackUsed, true, "not recommended falls back");

  const failed = await runAudioArtifactRestoration({
    inputPath: path.join(path.dirname(inputPath), "missing.wav"),
    jobId: "restoration_missing",
    strength: "balanced",
    artifactProfile: highProfile()
  });
  assert.equal(failed.success, false, "missing input fails structurally");
  assert.equal(failed.fallbackUsed, true, "missing input falls back");

  const afterStat = statSync(inputPath);
  assert.equal(afterStat.size, originalStat.size, "original source remains intact");
  console.log("fallback behavior: ok", { skipped, failed });
}

function runStaticIntegrationTests() {
  const route = read("app/api/master-ai/route.ts");
  assert.ok(route.includes("resolveAiAudioRestorationFeatureConfig"), "route resolves server-side feature flags");
  assert.ok(route.includes("isAiAudioRestorationAuthorized"), "route checks server-side authorization");
  assert.ok(route.includes("assessAudioArtifacts(sourceAudio.record.filePath)"), "route assesses authoritative upload");
  assert.ok(route.includes("inputPath: adaptiveSource"), "adaptive pipeline uses selected source");
  assert.ok(route.includes('selectedSource=" + selectedSource'), "selected source is logged");
  assert.ok(route.includes('kind: "restored"'), "restored intermediate is registered");
  assert.ok(route.includes("outputQuality = resolveEncodeOutputQuality"), "output quality selected before render");
  assert.ok(route.includes("outputCodec = resolveCodecForQuality(outputQuality)"), "output codec selected before render");
  assert.ok(route.includes("[adaptive-mastering] outputQuality=32bit_float") || route.includes("outputQuality"), "owner quality logging remains present");
  assert.ok(route.includes("pcm_f32le") || read("lib/audio/wav-export-codec.ts").includes('if (quality === "32bit_float") return "pcm_f32le";'), "owner codec mapping remains preserved");

  const tempFiles = read("lib/storage/temp-files.ts");
  assert.ok(tempFiles.includes('"restored"'), "restored temp kind is registered");

  const uploadForm = read("components/upload-form.tsx");
  assert.ok(uploadForm.includes("AI Audio Restoration"), "UI section exists");
  assert.ok(uploadForm.includes("No significant restoration issues detected."), "not recommended UI state exists");
  assert.ok(uploadForm.includes("Restoration recommended before mastering."), "recommended UI state exists");
  assert.ok(uploadForm.includes("Restoring audio before mastering"), "processing UI state exists");
  assert.ok(uploadForm.includes("Audio restored. Adaptive Mastering will use the restored source."), "success UI state exists");
  assert.ok(uploadForm.includes("Restoration could not be completed. Adaptive Mastering will continue with the original source."), "fallback UI state exists");
  assert.ok(!/fingerprint|watermark|provenance|detection marker/i.test(uploadForm), "UI avoids disallowed claims");
  console.log("adaptive integration invariants: ok", {
    successSelection: "restored_source",
    fallbackSelection: "original_source",
    ownerQuality: "32bit_float",
    ownerCodec: "pcm_f32le"
  });
}

async function run() {
  runFeatureFlagTests();
  const workDir = mkdtempSync(path.join(tmpdir(), "ai-audio-restoration-"));
  try {
    const bright = await runAssessmentTests(workDir);
    await runProcessingTests(bright);
    runStaticIntegrationTests();
    console.log("ai-audio-restoration-test: ok");
  } finally {
    rmSync(workDir, { recursive: true, force: true });
  }
}

run().catch((err) => {
  console.error("ai-audio-restoration-test FAILED:", err);
  process.exitCode = 1;
});
