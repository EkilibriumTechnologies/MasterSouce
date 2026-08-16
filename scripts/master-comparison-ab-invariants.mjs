/**
 * Original vs Master A/B comparison invariants.
 *
 * Playback/UX only — does not run FFmpeg, OpenAI, Stripe, or network.
 *
 * Run:
 *   node --experimental-transform-types --import ./scripts/lib/register-ts-alias.mjs scripts/master-comparison-ab-invariants.mjs
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";

import {
  computeLoudnessMatchGains,
  dbToLinearGain,
  LOUDNESS_MATCH_DEFAULT_ENABLED
} from "@/lib/master-comparison/loudness-match";
import {
  canShowMasterComparison,
  createInitialComparisonState,
  LOUDNESS_MATCH_HELPER_TEXT,
  mergeAdaptiveAnalysisForComparison,
  resolveComparisonLufs,
  switchComparisonSource
} from "@/lib/master-comparison/master-comparison";

const ROOT = process.cwd();

function read(relPath) {
  return readFileSync(path.join(ROOT, relPath), "utf8");
}

function assertIncludes(content, needle, context) {
  assert.ok(content.includes(needle), `${context}: missing ${JSON.stringify(needle)}`);
}

function assertNotIncludes(content, needle, context) {
  assert.equal(content.includes(needle), false, `${context}: unexpected ${JSON.stringify(needle)}`);
}

function assertNoDspImport(content, fileLabel) {
  const forbidden = [
    "@/lib/audio/mastering-pipeline",
    "@/lib/audio/adaptive-mastering-pipeline",
    "@/lib/audio/analyze-track",
    "@/lib/audio/track-analysis-v2",
    "@/lib/audio/readiness",
    "@/lib/audio/master-readiness",
    "@/lib/openai/adaptive-mastering",
    "analyzeTrack(",
    "evaluateTrackReadiness(",
    "runAdaptiveMasteringPipeline"
  ];
  for (const needle of forbidden) {
    assertNotIncludes(content, needle, `${fileLabel} must not import or call mastering DSP`);
  }
}

function runVisibilityTests() {
  assert.equal(
    canShowMasterComparison({
      originalSource: "/api/download?fileId=orig&as=original-preview.mp3",
      masteredSource: "/api/download?fileId=mast&as=adaptive-master-preview.mp3"
    }),
    true,
    "Compare appears when both sources exist"
  );
  assert.equal(
    canShowMasterComparison({ originalSource: "/orig.mp3", masteredSource: "" }),
    false,
    "Compare hidden when master source is missing"
  );
  assert.equal(
    canShowMasterComparison({ originalSource: "", masteredSource: "/master.mp3" }),
    false,
    "Compare hidden when original source is missing"
  );
  assert.equal(
    canShowMasterComparison({ originalSource: null, masteredSource: null }),
    false,
    "Compare hidden when both sources are missing"
  );
}

function runSwitchPreservationTests() {
  const playing = {
    ...createInitialComparisonState(),
    activeSource: "original",
    currentTime: 12.4,
    playing: true
  };
  const toMaster = switchComparisonSource(playing, "mastered", 12.4);
  assert.equal(toMaster.activeSource, "mastered", "Original → Master switches source");
  assert.equal(toMaster.currentTime, 12.4, "Original → Master preserves playback position");
  assert.equal(toMaster.playing, true, "Original → Master preserves playing state");
  assert.equal(toMaster.loudnessMatchEnabled, true, "switch does not change Loudness Match");

  const pausedMaster = {
    ...createInitialComparisonState(),
    activeSource: "mastered",
    currentTime: 8.05,
    playing: false,
    loudnessMatchEnabled: true
  };
  const toOriginal = switchComparisonSource(pausedMaster, "original", 8.05);
  assert.equal(toOriginal.activeSource, "original", "Master → Original switches source");
  assert.equal(toOriginal.currentTime, 8.05, "Master → Original preserves seek position");
  assert.equal(toOriginal.playing, false, "Master → Original preserves paused state");

  const livePosition = switchComparisonSource(playing, "mastered", 13.9);
  assert.equal(livePosition.currentTime, 13.9, "live element position wins over stale state");
}

function runLoudnessMatchDefaultTests() {
  assert.equal(LOUDNESS_MATCH_DEFAULT_ENABLED, true, "Loudness Match defaults ON");
  assert.equal(createInitialComparisonState().loudnessMatchEnabled, true, "initial state enables Loudness Match");
  assert.match(
    LOUDNESS_MATCH_HELPER_TEXT,
    /without louder automatically sounding better/i,
    "helper copy explains louder-is-better bias"
  );
}

function runLoudnessMatchOnUsesMeasuredValues() {
  const originalLufs = -14.2;
  const masteredLufs = -9.4;
  const gains = computeLoudnessMatchGains({
    originalLufs,
    masteredLufs,
    enabled: true
  });

  assert.equal(gains.compensationAvailable, true, "measured LUFS pair is usable");
  assert.equal(gains.applied, true, "ON applies compensation when both LUFS exist");
  assert.equal(gains.originalGainDb, 0, "quieter original stays at unity");
  assert.ok(gains.masteredGainDb < 0, "louder master is attenuated");
  assert.equal(
    Number(gains.masteredGainDb.toFixed(4)),
    Number((originalLufs - masteredLufs).toFixed(4)),
    "master gain is originalLufs - masteredLufs when master is louder"
  );
  assert.equal(gains.originalLinear, 1, "original linear gain is unity");
  assert.ok(gains.masteredLinear < 1, "master linear gain is attenuated");
  assert.ok(gains.originalLinear <= 1 && gains.masteredLinear <= 1, "never boosts above unity");

  const originalLouder = computeLoudnessMatchGains({
    originalLufs: -8,
    masteredLufs: -12,
    enabled: true
  });
  assert.ok(originalLouder.originalGainDb < 0, "louder original is attenuated");
  assert.equal(originalLouder.masteredGainDb, 0, "quieter master stays at unity");
  assert.equal(
    Number(originalLouder.originalGainDb.toFixed(4)),
    Number((-12 - -8).toFixed(4)),
    "original gain is masteredLufs - originalLufs when original is louder"
  );
}

function runLoudnessMatchOffAppliesNoCompensation() {
  const off = computeLoudnessMatchGains({
    originalLufs: -16,
    masteredLufs: -9,
    enabled: false
  });
  assert.equal(off.applied, false, "OFF does not apply compensation");
  assert.equal(off.originalGainDb, 0, "OFF original gain is 0 dB");
  assert.equal(off.masteredGainDb, 0, "OFF master gain is 0 dB");
  assert.equal(off.originalLinear, 1, "OFF original linear is unity");
  assert.equal(off.masteredLinear, 1, "OFF master linear is unity");
  assert.equal(off.compensationAvailable, true, "OFF still reports that measurements exist");
}

function runMissingLufsFailsGracefully() {
  const missingOriginal = computeLoudnessMatchGains({
    originalLufs: null,
    masteredLufs: -9.5,
    enabled: true
  });
  assert.equal(missingOriginal.compensationAvailable, false, "missing original LUFS is not usable");
  assert.equal(missingOriginal.applied, false, "missing original LUFS applies no compensation");
  assert.equal(missingOriginal.originalLinear, 1);
  assert.equal(missingOriginal.masteredLinear, 1);

  const missingMaster = computeLoudnessMatchGains({
    originalLufs: -14,
    masteredLufs: undefined,
    enabled: true
  });
  assert.equal(missingMaster.applied, false, "missing master LUFS applies no compensation");

  const nonFinite = computeLoudnessMatchGains({
    originalLufs: Number.NaN,
    masteredLufs: -9,
    enabled: true
  });
  assert.equal(nonFinite.applied, false, "NaN LUFS is treated as missing");

  const unresolved = resolveComparisonLufs({
    durationSec: 180,
    integratedLufs: -9.1,
    peakDb: -0.8,
    crestDb: 8,
    notes: []
  });
  assert.equal(unresolved.originalLufs, null, "top-level LUFS is not invented as original");
  assert.equal(unresolved.masteredLufs, null, "top-level LUFS is not invented as mastered");
}

function runAdaptiveAnalysisMergeUsesMeasuredValues() {
  const merged = mergeAdaptiveAnalysisForComparison({
    standard: {
      durationSec: 200,
      integratedLufs: -15.1,
      peakDb: -3.2,
      crestDb: 11.9,
      notes: ["baseline"],
      original: { durationSec: 200, integratedLufs: -15.1, peakDb: -3.2, crestDb: 11.9 }
    },
    adaptive: {
      durationSec: 200,
      integratedLufs: -9.8,
      peakDb: -1.1,
      crestDb: 8.7,
      notes: ["master"],
      original: { durationSec: 200, integratedLufs: -9.8, peakDb: -1.1, crestDb: 8.7 }
    }
  });

  const lufs = resolveComparisonLufs(merged);
  assert.equal(lufs.originalLufs, -15.1, "baseline measured LUFS becomes original");
  assert.equal(lufs.masteredLufs, -9.8, "post-master measured LUFS becomes mastered");
  assert.notEqual(lufs.originalLufs, -9.8, "misnamed post-master copy is not used as original");

  const missingPostMaster = mergeAdaptiveAnalysisForComparison({
    standard: {
      durationSec: 90,
      integratedLufs: -13,
      peakDb: -2,
      crestDb: 10,
      notes: []
    },
    adaptive: null
  });
  const missing = resolveComparisonLufs(missingPostMaster);
  assert.equal(missing.originalLufs, -13, "baseline LUFS still available when post-master analysis is missing");
  assert.equal(missing.masteredLufs, null, "missing post-master analysis does not invent master LUFS");
}

function runLinearGainSafety() {
  assert.equal(dbToLinearGain(0), 1);
  assert.ok(dbToLinearGain(-6) < 1);
  assert.equal(dbToLinearGain(6), 1, "positive dB is clamped to unity to prevent monitor clipping");
}

function runSourceInvariants() {
  const audioCompare = read("components/audio-compare.tsx");
  const controls = read("components/master-comparison-controls.tsx");
  const uploadForm = read("components/upload-form.tsx");
  const loudnessMatch = read("lib/master-comparison/loudness-match.ts");
  const comparison = read("lib/master-comparison/master-comparison.ts");
  const exportAccess = read("app/api/adaptive/export-access/route.ts");
  const captureEmail = read("app/api/capture-email/route.ts");
  const downloadRoute = read("app/api/download/route.ts");

  assertIncludes(audioCompare, "<MasterComparisonControls", "Compare controls are rendered in the player");
  assertIncludes(audioCompare, "canShowMasterComparison", "player hides Compare without both sources");
  assertIncludes(audioCompare, "selectSource", "player switches sources through selectSource");
  assertIncludes(audioCompare, "readLivePosition", "player reads live position before switching");
  assertIncludes(audioCompare, "LOUDNESS_MATCH_DEFAULT_ENABLED", "player defaults Loudness Match ON");
  assertIncludes(audioCompare, "createGain", "monitoring gain uses Web Audio GainNode");
  assertIncludes(audioCompare, "playsInline", "iOS inline playback attribute is set");
  assertIncludes(
    audioCompare,
    "sample-accurate crossfades are not reliable",
    "Safari/iOS switching limitation is documented"
  );

  assertIncludes(controls, "Compare", "controls expose Compare heading");
  assertIncludes(controls, "Original", "controls expose Original");
  assertIncludes(controls, "Master", "controls expose Master");
  assertIncludes(controls, "Loudness Match", "controls expose Loudness Match");
  assertIncludes(controls, "LOUDNESS_MATCH_HELPER_TEXT", "controls include loudness-match helper copy");
  assertIncludes(controls, "LOUDNESS_MATCH_PLAYBACK_ONLY_TEXT", "controls state this is playback-only");
  assertIncludes(comparison, "comparison playback only", "playback-only copy is defined");

  assertIncludes(uploadForm, "mergeAdaptiveAnalysisForComparison", "Adaptive merge preserves both measured LUFS");
  assertIncludes(uploadForm, "originalLufs={comparisonLufs.originalLufs}", "original LUFS is passed to the player");
  assertIncludes(uploadForm, "masteredLufs={comparisonLufs.masteredLufs}", "mastered LUFS is passed to the player");

  assertIncludes(loudnessMatch, "Does not estimate loudness", "loudness-match refuses invented LUFS");
  assertIncludes(loudnessMatch, "never boost", "loudness-match never boosts monitor gain");

  assertNoDspImport(audioCompare, "audio-compare.tsx");
  assertNoDspImport(controls, "master-comparison-controls.tsx");
  assertNoDspImport(loudnessMatch, "loudness-match.ts");
  assertNoDspImport(comparison, "master-comparison.ts");

  assertIncludes(
    exportAccess,
    "return `/api/download?fileId=${fileId}&as=adaptive-master.wav&dl=1`;",
    "adaptive download URL is unchanged"
  );
  assertIncludes(captureEmail, "as=mastered.wav", "standard download URL is unchanged");
  assertIncludes(downloadRoute, 'record.kind === "mastered"', "download route still serves final masters");
  assertNotIncludes(audioCompare, "as=adaptive-master.wav", "A/B player does not rewrite adaptive download URLs");
  assertNotIncludes(audioCompare, "as=mastered.wav", "A/B player does not rewrite standard download URLs");
  assertNotIncludes(loudnessMatch, "ffmpeg", "loudness-match does not invoke ffmpeg");
  assertNotIncludes(comparison, "ffmpeg", "comparison helper does not invoke ffmpeg");
}

function run() {
  runVisibilityTests();
  runSwitchPreservationTests();
  runLoudnessMatchDefaultTests();
  runLoudnessMatchOnUsesMeasuredValues();
  runLoudnessMatchOffAppliesNoCompensation();
  runMissingLufsFailsGracefully();
  runAdaptiveAnalysisMergeUsesMeasuredValues();
  runLinearGainSafety();
  runSourceInvariants();
  console.log("master comparison A/B invariants passed");
}

run();
