/**
 * Master Readiness evaluator tests — pure interpretation of existing analysis.
 *
 * Run: node --experimental-transform-types --import ./scripts/lib/register-ts-alias.mjs scripts/master-readiness-test.mjs
 *
 * No OpenAI, Stripe, Supabase, network, FFmpeg, or production credentials required.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";

import {
  evaluateMasterReadiness,
  MASTER_READINESS_THRESHOLDS
} from "@/lib/audio/master-readiness";

const ROOT = process.cwd();

function read(relPath) {
  return readFileSync(path.join(ROOT, relPath), "utf8");
}

function baseAnalysis(overrides = {}) {
  return {
    durationSec: 180,
    integratedLufs: -14,
    peakDb: -1.8,
    meanDb: -11.8,
    crestDb: 10,
    lowEndDb: -23,
    lowMidDb: -24,
    harshnessDb: -26,
    airDb: -33,
    alreadyLimited: false,
    notes: [],
    ...overrides
  };
}

function baseV2(overrides = {}) {
  return {
    schemaVersion: 2,
    integratedLufs: -14,
    loudnessRangeLu: 7,
    truePeakDb: -1.6,
    samplePeakDb: -1.8,
    crestFactorDb: 10,
    peakToLoudnessRatioDb: 12.4,
    spectralCentroidHz: 1800,
    spectralSlopeDbPerOct: -3,
    stereoCorrelation: 0.6,
    stereoWidthRatio: 0.35,
    channelMode: "stereo",
    durationSec: 180,
    sampleRateHz: 44100,
    activeFlags: [],
    analyzedStereo: true,
    subprocessCount: 4,
    ...overrides
  };
}

function finding(result, id) {
  return result.findings.find((item) => item.id === id) ?? null;
}

function runHealthyTrackTest() {
  const result = evaluateMasterReadiness(baseAnalysis());
  assert.equal(result.status, "Ready to Master");
  assert.equal(result.analysisComplete, true);
  assert.equal(result.recommendedAction, "master_anyway");
  assert.equal(result.score, 100);
  assert.equal(result.findings.length, 1);
  assert.equal(result.findings[0].id, "dynamics");
  assert.equal(result.findings[0].severity, "positive");
  assert.match(result.findings[0].explanation, /Healthy transient\/dynamic information/i);
  assert.doesNotMatch(result.explanation, /limiting\/pumping|clipping|harsh/i);
  assert.ok(!finding(result, "low_end"));
  assert.ok(!finding(result, "harshness"));
  assert.ok(!finding(result, "headroom"));
}

function runExcessiveLowEndTest() {
  const result = evaluateMasterReadiness(
    baseAnalysis({
      lowEndDb: -14,
      lowMidDb: -26,
      harshnessDb: -28
    })
  );
  const lowEnd = finding(result, "low_end");
  assert.ok(lowEnd, "low-end finding required when 20–120 Hz dominates body bands");
  assert.equal(lowEnd.severity, "major");
  assert.match(lowEnd.explanation, /20–120 Hz/);
  assert.doesNotMatch(lowEnd.explanation, /80 Hz/, "V1 must not claim an 80 Hz measurement");
  assert.equal(result.status, "Minor Issues Detected", "a single tonal major must not escalate to Fix Mix First");
  assert.equal(result.recommendedAction, "analyze_and_improve_mix");
  assert.ok(result.score !== null && result.score < 100);
}

function runHarshTrackTest() {
  const result = evaluateMasterReadiness(
    baseAnalysis({
      lowEndDb: -24,
      lowMidDb: -26,
      harshnessDb: -16,
      airDb: -22
    })
  );
  const harshness = finding(result, "harshness");
  assert.ok(harshness, "harshness finding required when 3–8 kHz dominates body bands");
  assert.equal(harshness.severity, "major");
  assert.match(harshness.explanation, /3–8 kHz|high-frequency/i);
  assert.doesNotMatch(harshness.explanation, /80 Hz/);
  assert.equal(result.status, "Minor Issues Detected", "a single tonal major must not escalate to Fix Mix First");
  assert.equal(result.recommendedAction, "analyze_and_improve_mix");
}

function runClippingTest() {
  const result = evaluateMasterReadiness(baseAnalysis({ peakDb: -0.05 }));
  const headroom = finding(result, "headroom");
  assert.ok(headroom, "headroom finding required when sample peak is near full scale");
  assert.equal(headroom.severity, "critical");
  assert.match(headroom.explanation, /clipping or insufficient headroom/i);
  assert.doesNotMatch(headroom.explanation, /true peak/i, "V1 sample peak must not be labeled true peak");
  assert.equal(result.status, "Fix Mix First");
}

function runCompressedTrackTest() {
  const result = evaluateMasterReadiness(
    baseAnalysis({
      crestDb: 4.8,
      alreadyLimited: true
    })
  );
  const dynamics = finding(result, "dynamics");
  assert.ok(dynamics, "dynamics finding required when crest is below the compressed threshold");
  assert.equal(dynamics.severity, "major");
  assert.match(dynamics.explanation, /highly compressed/i);
  assert.doesNotMatch(dynamics.explanation, /Healthy transient/);
  assert.equal(result.status, "Fix Mix First");
}

function runMissingAnalysisTest() {
  const missing = evaluateMasterReadiness(null);
  assert.equal(missing.status, "Ready to Master");
  assert.equal(missing.score, null);
  assert.deepEqual(missing.findings, []);
  assert.equal(missing.analysisComplete, false);
  assert.equal(missing.recommendedAction, "master_anyway");
  assert.match(missing.explanation, /Not enough mix measurements/i);

  const empty = evaluateMasterReadiness(
    baseAnalysis({
      peakDb: null,
      meanDb: null,
      crestDb: null,
      lowEndDb: null,
      lowMidDb: null,
      harshnessDb: null,
      airDb: null
    })
  );
  assert.equal(empty.analysisComplete, false);
  assert.equal(empty.score, null);
  assert.deepEqual(empty.findings, []);
  assert.doesNotMatch(empty.explanation, /clipping|limiting\/pumping|harsh/i);
}

function runNoFalseClaimsTest() {
  const noPeak = evaluateMasterReadiness(baseAnalysis({ peakDb: null }));
  assert.ok(!finding(noPeak, "headroom"), "must not claim clipping without a peak measurement");
  assert.doesNotMatch(JSON.stringify(noPeak.findings), /clipping/i);

  const noBands = evaluateMasterReadiness(
    baseAnalysis({
      lowEndDb: null,
      lowMidDb: null,
      harshnessDb: null,
      airDb: null
    })
  );
  assert.ok(!finding(noBands, "low_end"));
  assert.ok(!finding(noBands, "harshness"));
  assert.doesNotMatch(JSON.stringify(noBands.findings), /80 Hz|3–8 kHz|20–120 Hz/);

  const noCrest = evaluateMasterReadiness(baseAnalysis({ crestDb: null }));
  assert.ok(!finding(noCrest, "dynamics"), "must not claim dynamics without crest or V2 LRA");
}

function runV2PrecedenceTest() {
  const v1WouldFlagLowEnd = baseAnalysis({
    lowEndDb: -14,
    lowMidDb: -26,
    harshnessDb: -28
  });
  const v1Only = evaluateMasterReadiness(v1WouldFlagLowEnd);
  assert.ok(finding(v1Only, "low_end"), "V1-only path flags excessive low end");

  const v2Clear = evaluateMasterReadiness(v1WouldFlagLowEnd, baseV2({ activeFlags: [] }));
  assert.ok(
    !finding(v2Clear, "low_end"),
    "when V2 ran and did not flag low_end_excess, do not invent a competing V1 claim"
  );
  assert.doesNotMatch(JSON.stringify(v2Clear.findings), /80 Hz/);

  const v2Flagged = evaluateMasterReadiness(baseAnalysis(), baseV2({ activeFlags: ["low_end_excess"] }));
  const lowEnd = finding(v2Flagged, "low_end");
  assert.ok(lowEnd);
  assert.match(lowEnd.explanation, /80 Hz/);
  assert.equal(v2Flagged.status, "Minor Issues Detected", "a single V2 tonal flag is not Fix Mix First");

  const v1WouldClip = baseAnalysis({ peakDb: -0.04, crestDb: 4.5 });
  const v2ClearsSafety = evaluateMasterReadiness(
    v1WouldClip,
    baseV2({
      activeFlags: [],
      truePeakDb: -1.6,
      samplePeakDb: -1.8,
      crestFactorDb: 10,
      loudnessRangeLu: 7
    })
  );
  assert.ok(!finding(v2ClearsSafety, "headroom"), "V2-evaluated peaks must not inherit a V1 clipping finding");
  assert.ok(!finding(v2ClearsSafety, "dynamics") || finding(v2ClearsSafety, "dynamics")?.severity === "positive");
  assert.doesNotMatch(JSON.stringify(v2ClearsSafety.findings), /clipping/i);
  assert.doesNotMatch(JSON.stringify(v2ClearsSafety.findings), /highly compressed/i);
}

function runV2ClippingAndCompressionTest() {
  const clipped = evaluateMasterReadiness(
    baseAnalysis({ peakDb: -2 }),
    baseV2({ activeFlags: ["clipping_risk"], truePeakDb: -0.05, samplePeakDb: -0.08 })
  );
  assert.equal(finding(clipped, "headroom")?.severity, "critical");
  assert.equal(clipped.status, "Fix Mix First");

  const compressed = evaluateMasterReadiness(
    baseAnalysis({ crestDb: 11 }),
    baseV2({ activeFlags: ["overly_compressed"], crestFactorDb: 5.2, loudnessRangeLu: 2.1 })
  );
  assert.equal(finding(compressed, "dynamics")?.severity, "major");
  assert.equal(compressed.status, "Fix Mix First");
}

function runEscalationRulesTest() {
  const elevatedLowEnd = evaluateMasterReadiness(
    baseAnalysis({
      lowEndDb: -20,
      lowMidDb: -24,
      harshnessDb: -26
    })
  );
  assert.equal(finding(elevatedLowEnd, "low_end")?.severity, "minor");
  assert.equal(elevatedLowEnd.status, "Minor Issues Detected");

  const twoTonalMajors = evaluateMasterReadiness(
    baseAnalysis({
      lowEndDb: -12,
      lowMidDb: -26,
      harshnessDb: -14,
      airDb: -18
    })
  );
  assert.equal(finding(twoTonalMajors, "low_end")?.severity, "major");
  assert.equal(finding(twoTonalMajors, "harshness")?.severity, "major");
  assert.equal(twoTonalMajors.status, "Fix Mix First", "two major findings escalate");

  const hotPeaks = evaluateMasterReadiness(baseAnalysis({ peakDb: -0.2 }));
  assert.equal(finding(hotPeaks, "headroom")?.severity, "major");
  assert.doesNotMatch(finding(hotPeaks, "headroom")?.explanation ?? "", /clipping/i);
  assert.equal(hotPeaks.status, "Fix Mix First", "peak-safety majors stay Fix Mix First");

  const v2TwoTonal = evaluateMasterReadiness(
    baseAnalysis(),
    baseV2({ activeFlags: ["low_end_excess", "harsh_upper_mids"] })
  );
  assert.equal(v2TwoTonal.status, "Fix Mix First");
}

function runMinorIssuesAndScoreTest() {
  const minor = evaluateMasterReadiness(baseAnalysis({ crestDb: 7.1 }));
  assert.equal(minor.status, "Minor Issues Detected");
  assert.equal(finding(minor, "dynamics")?.severity, "minor");
  assert.equal(minor.recommendedAction, "analyze_and_improve_mix");
  assert.ok(minor.score !== null && minor.score < 100 && minor.score >= 70);

  const oneDimension = evaluateMasterReadiness(
    baseAnalysis({
      peakDb: null,
      crestDb: 10,
      lowEndDb: null,
      lowMidDb: null,
      harshnessDb: null,
      airDb: null
    })
  );
  assert.equal(oneDimension.score, null, "score omitted unless enough dimensions are measurable");
  assert.equal(oneDimension.analysisComplete, true);
}

function runFindingCapTest() {
  const result = evaluateMasterReadiness(
    baseAnalysis({
      peakDb: -0.04,
      crestDb: 4.2,
      lowEndDb: -12,
      lowMidDb: -27,
      harshnessDb: -15,
      airDb: -18
    })
  );
  assert.ok(result.findings.length <= MASTER_READINESS_THRESHOLDS.maxFindings);
  assert.ok(!result.findings.some((item) => item.severity === "positive"));
}

function runArchitectureInvariants() {
  const evaluator = read("lib/audio/master-readiness.ts");
  assert.ok(evaluator.includes("export function evaluateMasterReadiness"), "reusable evaluator exists");
  assert.ok(evaluator.includes("export const MASTER_READINESS_THRESHOLDS"), "thresholds are centralized");
  assert.ok(evaluator.includes("function shouldFixMixFirst"), "escalation rules are centralized");
  assert.ok(!evaluator.includes("majorCount >= 1"), "a single major finding must not auto-escalate");
  assert.ok(!evaluator.includes("spawn("), "evaluator must not spawn FFmpeg");
  assert.ok(!evaluator.includes("mastering-pipeline"), "evaluator must not import mastering DSP");
  assert.ok(!evaluator.includes("adaptive-mastering-pipeline"), "evaluator must not import adaptive DSP");

  const analyze = read("app/api/analyze-track/route.ts");
  assert.ok(analyze.includes("evaluateMasterReadiness(analysis, analysisV2)"), "analyze-track reuses existing analysis");
  assert.ok(analyze.includes("masterReadiness"), "analyze-track returns masterReadiness");
  assert.ok(!analyze.includes("runMasteringPipeline"), "analyze-track still does not master");

  const uploadForm = read("components/upload-form.tsx");
  assert.ok(uploadForm.includes("function MasterReadinessPanel"), "readiness UI exists");
  assert.ok(uploadForm.includes("Master Anyway"), "Master Anyway is always available");
  assert.ok(uploadForm.includes("Analyze &amp; Improve Mix"), "Analyze & Improve Mix routes to Hit Analyzer");
  assert.ok(uploadForm.includes('href="/ar-ai"'), "improve-mix action uses existing A&R workflow");
  assert.ok(uploadForm.includes("Run free adaptive preview"), "existing adaptive CTA remains");
  assert.ok(uploadForm.includes("Preset Master — instant result"), "preset mastering path remains");
  assert.ok(
    uploadForm.includes("Heuristic for mastering readiness — not a mix or song quality rating."),
    "score is framed as a readiness heuristic"
  );
  assert.ok(uploadForm.includes("Readiness {masterReadiness.score} / 100"), "score label stays readiness-scoped");
  assert.ok(!uploadForm.includes("Score {masterReadiness.score}"), "UI must not present a generic quality score");
}

function run() {
  runHealthyTrackTest();
  runExcessiveLowEndTest();
  runHarshTrackTest();
  runClippingTest();
  runCompressedTrackTest();
  runMissingAnalysisTest();
  runNoFalseClaimsTest();
  runV2PrecedenceTest();
  runV2ClippingAndCompressionTest();
  runEscalationRulesTest();
  runMinorIssuesAndScoreTest();
  runFindingCapTest();
  runArchitectureInvariants();
  console.log("master readiness tests passed");
}

run();
