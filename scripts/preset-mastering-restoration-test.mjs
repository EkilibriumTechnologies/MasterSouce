/**
 * Preset mastering + AI Audio Restoration integration invariants and helper behavior.
 *
 * Run: node --experimental-transform-types --import ./scripts/lib/register-ts-alias.mjs scripts/preset-mastering-restoration-test.mjs
 */
import assert from "node:assert/strict";
import { existsSync, mkdtempSync, readFileSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import ffmpegStatic from "ffmpeg-static";

import { buildAudioRestorationPublicRecommendation } from "@/lib/audio/artifact-recommendation";
import { resolveMasteringSourceWithRestoration } from "@/lib/audio/mastering-source-restoration";
import { suggestMasteringPreset } from "@/lib/audio/suggested-mastering-preset";
import { isHomepageBeforeAfterEnabled } from "@/lib/features/homepage-before-after";

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const FFMPEG = typeof ffmpegStatic === "string" ? ffmpegStatic : process.env.FFMPEG_BIN?.trim() || null;
assert.ok(FFMPEG, "ffmpeg-static or FFMPEG_BIN required");

function read(relPath) {
  return readFileSync(path.join(REPO_ROOT, relPath), "utf8");
}

function ff(args) {
  const result = spawnSync(FFMPEG, args, { encoding: "utf8" });
  assert.equal(result.status, 0, `ffmpeg failed: ${result.stderr?.slice(-900)}`);
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
    out
  ]);
}

function runStaticRouteTests() {
  const route = read("app/api/master/route.ts");
  const helper = read("lib/audio/mastering-source-restoration.ts");
  const analyze = read("app/api/analyze-track/route.ts");
  assert.ok(route.includes("resolveMasteringSourceWithRestoration"), "preset route uses shared helper");
  assert.ok(route.includes("applyAudioRestoration"), "preset accepts restoration request");
  assert.ok(route.includes("audioRestorationStrength"), "preset accepts restoration strength");
  assert.ok(helper.includes('workflowLogTag'), "helper logs per workflow");
  assert.ok(helper.includes("[preset-mastering] selectedSource=") || helper.includes("`[${workflowLogTag}] selectedSource="), "preset selectedSource log path exists");
  assert.ok(analyze.includes("buildAudioRestorationPublicRecommendation"), "analyze returns public restoration recommendation");
  assert.ok(analyze.includes("suggestMasteringPreset"), "analyze returns suggested preset");
  assert.ok(!analyze.includes("resolveHitAnalyzerAccess"), "analyze-track remains outside Hit Analyzer quota");
  console.log("preset route static: ok");
}

function runRecommendationTests() {
  const low = buildAudioRestorationPublicRecommendation({
    overallSeverity: 0.2,
    restorationRecommended: false,
    recommendedStrength: "balanced"
  });
  assert.equal(low.artifactLevel, "Low");
  assert.equal(low.defaultChoice, "off");
  assert.match(low.message, /No significant restoration issues detected/);

  const moderate = buildAudioRestorationPublicRecommendation({
    overallSeverity: 0.55,
    restorationRecommended: true,
    recommendedStrength: "light"
  });
  assert.equal(moderate.artifactLevel, "Moderate");
  assert.equal(moderate.defaultChoice, "balanced");
  assert.match(moderate.message, /may benefit from AI Audio Restoration/);

  const high = buildAudioRestorationPublicRecommendation({
    overallSeverity: 0.8,
    restorationRecommended: true,
    recommendedStrength: "strong"
  });
  assert.equal(high.artifactLevel, "High");
  assert.equal(high.defaultChoice, "strong");

  const weakPreset = suggestMasteringPreset({
    durationSec: 120,
    integratedLufs: null,
    peakDb: null,
    meanDb: null,
    crestDb: null,
    lowEndDb: null,
    lowMidDb: null,
    harshnessDb: null,
    airDb: null,
    alreadyLimited: false,
    notes: []
  });
  assert.equal(weakPreset.key, null, "weak evidence keeps default");

  const edmLean = suggestMasteringPreset({
    durationSec: 180,
    integratedLufs: -8.5,
    peakDb: -0.2,
    meanDb: -8,
    crestDb: 5.5,
    lowEndDb: -16,
    lowMidDb: -26,
    harshnessDb: -20,
    airDb: -25,
    alreadyLimited: true,
    notes: []
  });
  assert.ok(edmLean.key === "edm" || edmLean.key === "hiphop" || edmLean.key === "reggaeton", "loud limited low-end suggests dance/urban family");
  console.log("recommendation helpers: ok", { low, moderate, high, edmLean });
}

async function runHelperSourceSelectionTests(workDir) {
  const inputPath = path.join(workDir, "bright.wav");
  genBrightFixture(inputPath);
  const originalStat = statSync(inputPath);

  const off = await resolveMasteringSourceWithRestoration({
    originalPath: inputPath,
    jobId: "preset_off",
    featureConfig: { enabled: true, ownerOnly: false },
    restorationAuthorized: true,
    ownerAuthorized: false,
    restorationRequested: false,
    requestedStrength: "balanced",
    workflowLogTag: "preset-mastering"
  });
  assert.equal(off.selectedSource, "original_source", "off uses original_source");
  assert.equal(off.selectedPath, inputPath);

  const balanced = await resolveMasteringSourceWithRestoration({
    originalPath: inputPath,
    jobId: "preset_balanced",
    featureConfig: { enabled: true, ownerOnly: false },
    restorationAuthorized: true,
    ownerAuthorized: false,
    restorationRequested: true,
    requestedStrength: "balanced",
    workflowLogTag: "preset-mastering"
  });
  if (balanced.result?.success && balanced.result.outputPath) {
    assert.equal(balanced.selectedSource, "restored_source", "balanced success uses restored_source");
    assert.notEqual(balanced.selectedPath, inputPath, "restored path is distinct");
    assert.ok(existsSync(balanced.result.outputPath), "restored intermediate exists");
  } else {
    assert.equal(balanced.selectedSource, "original_source", "balanced failure/no-modules falls back");
  }

  const strong = await resolveMasteringSourceWithRestoration({
    originalPath: inputPath,
    jobId: "preset_strong",
    featureConfig: { enabled: true, ownerOnly: false },
    restorationAuthorized: true,
    ownerAuthorized: false,
    restorationRequested: true,
    requestedStrength: "strong",
    workflowLogTag: "preset-mastering"
  });
  if (strong.result?.success && strong.result.outputPath) {
    assert.equal(strong.selectedSource, "restored_source", "strong success uses restored_source");
  } else {
    assert.equal(strong.selectedSource, "original_source", "strong failure falls back");
  }

  const disabled = await resolveMasteringSourceWithRestoration({
    originalPath: inputPath,
    jobId: "preset_disabled",
    featureConfig: { enabled: false, ownerOnly: false },
    restorationAuthorized: false,
    ownerAuthorized: false,
    restorationRequested: true,
    requestedStrength: "balanced",
    workflowLogTag: "preset-mastering"
  });
  assert.equal(disabled.selectedSource, "original_source", "disabled keeps original_source");

  const ownerOnlyBlocked = await resolveMasteringSourceWithRestoration({
    originalPath: inputPath,
    jobId: "preset_owner_blocked",
    featureConfig: { enabled: true, ownerOnly: true },
    restorationAuthorized: false,
    ownerAuthorized: false,
    restorationRequested: true,
    requestedStrength: "balanced",
    workflowLogTag: "preset-mastering"
  });
  assert.equal(ownerOnlyBlocked.selectedSource, "original_source", "ownerOnly blocks normal users");

  assert.equal(statSync(inputPath).size, originalStat.size, "original upload remains unchanged");
  console.log("helper source selection: ok", {
    off: off.selectedSource,
    balanced: balanced.selectedSource,
    strong: strong.selectedSource
  });
}

function runHomepageGateTests() {
  assert.equal(isHomepageBeforeAfterEnabled({}), false, "before/after default false");
  assert.equal(isHomepageBeforeAfterEnabled({ HOMEPAGE_BEFORE_AFTER_ENABLED: "true" }), true);
  assert.equal(isHomepageBeforeAfterEnabled({ HOMEPAGE_BEFORE_AFTER_ENABLED: "false" }), false);
  const page = read("app/page.tsx");
  assert.ok(page.includes("isHomepageBeforeAfterEnabled"), "homepage gates Before & After");
  assert.ok(read(".env.example").includes("HOMEPAGE_BEFORE_AFTER_ENABLED=false"), "env example keeps gate disabled");
  console.log("homepage before/after gate: ok");
}

async function run() {
  runStaticRouteTests();
  runRecommendationTests();
  runHomepageGateTests();
  const workDir = mkdtempSync(path.join(tmpdir(), "preset-restoration-"));
  try {
    await runHelperSourceSelectionTests(workDir);
    console.log("preset-mastering-restoration-test: ok");
  } finally {
    rmSync(workDir, { recursive: true, force: true });
  }
}

run().catch((err) => {
  console.error("preset-mastering-restoration-test FAILED:", err);
  process.exitCode = 1;
});
