/**
 * Mastering Decision Report tests — proven statements only.
 *
 * Run:
 *   node --experimental-transform-types --import ./scripts/lib/register-ts-alias.mjs scripts/mastering-decision-report-test.mjs
 *
 * No OpenAI, Stripe, Supabase, network, FFmpeg, or production credentials required.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";

import {
  buildMasteringDecisionReport,
  canShowMasteringDecisionReport,
  hasDisplayableMasteringDecisionReport,
  loudnessExplanationUsesMeasuredLufs,
  reportTextContainsTruePeakClaim
} from "@/lib/audio/mastering-decision-report";

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

function baseSettings(overrides = {}) {
  return {
    eqDirection: {
      lowEnd: 0,
      lowMid: 0,
      presence: 0,
      air: 0,
      ...(overrides.eqDirection ?? {})
    },
    compressionIntensity: overrides.compressionIntensity ?? "medium",
    stereoWidth: overrides.stereoWidth ?? 1,
    targetLufs: overrides.targetLufs ?? -9,
    limiterCeilingDb: overrides.limiterCeilingDb ?? -1,
    transientHandling: overrides.transientHandling ?? "balanced"
  };
}

function baseAnalysis(overrides = {}) {
  return {
    integratedLufs: -14.2,
    peakDb: -1.8,
    crestDb: 10.1,
    lowEndDb: -23,
    alreadyLimited: false,
    ...overrides
  };
}

function decision(report, category, action) {
  return report.decisions.find((item) => item.category === category && (!action || item.action === action)) ?? null;
}

function allReportText(report) {
  return [
    report.summary,
    ...report.decisions.map((item) => `${item.title} ${item.explanation}`),
    ...report.warnings,
    "Peak",
    "Integrated LUFS",
    "Crest",
    report.selectedTargetLufs === null ? "" : `Selected loudness target: ${report.selectedTargetLufs.toFixed(1)} LUFS`
  ].join("\n");
}

function runVisibilityTests() {
  const empty = buildMasteringDecisionReport({});
  assert.equal(canShowMasteringDecisionReport(false, empty), false, "report hidden before Adaptive result exists");
  assert.equal(canShowMasteringDecisionReport(false, null), false, "null report hidden before Adaptive result");

  const report = buildMasteringDecisionReport({
    settings: baseSettings({ compressionIntensity: "light", stereoWidth: 1 }),
    baseline: baseAnalysis({ lowEndDb: -16 }),
    postMaster: baseAnalysis({ integratedLufs: -10.4, peakDb: -1.1, crestDb: 8.8 })
  });
  assert.equal(hasDisplayableMasteringDecisionReport(report), true, "populated report is displayable");
  assert.equal(canShowMasteringDecisionReport(true, report), true, "report appears after Adaptive result exists");
  assert.equal(canShowMasteringDecisionReport(false, report), false, "populated report still hidden without Adaptive result");
}

function runUnsupportedCategoryOmissionTests() {
  const report = buildMasteringDecisionReport({
    settings: baseSettings({
      eqDirection: { lowEnd: 0, lowMid: 0, presence: 0, air: 0 },
      compressionIntensity: "strong",
      transientHandling: "tight",
      stereoWidth: 1
    }),
    baseline: baseAnalysis({ lowEndDb: -26, alreadyLimited: false }),
    postMaster: null
  });

  assert.equal(decision(report, "low_end"), null, "low-end omitted without strong-low-end evidence or EQ action");
  assert.equal(decision(report, "dynamics"), null, "dynamics omitted when intensity is strong");
  assert.equal(decision(report, "loudness"), null, "loudness omitted without post-master LUFS");
  assert.equal(decision(report, "peak_safety"), null, "peak safety omitted without post-master peak");
  assert.equal(decision(report, "tonal_balance"), null, "tonal claims omitted when EQ is neutral");
  assert.equal(decision(report, "transient_preservation"), null, "unsupported transient category is omitted");
  assert.ok(decision(report, "stereo_image", "subtle"), "unity stereo width can report subtle processing");
}

function runMeasuredLufsTests() {
  const measured = -10.4;
  const target = -9;
  const report = buildMasteringDecisionReport({
    settings: baseSettings({ targetLufs: target, compressionIntensity: "strong", stereoWidth: 1.08 }),
    baseline: baseAnalysis({ integratedLufs: -14.8 }),
    postMaster: baseAnalysis({ integratedLufs: measured, peakDb: -1.05 })
  });

  const loudness = decision(report, "loudness", "measured");
  assert.ok(loudness, "loudness decision requires post-master measurement");
  assert.equal(
    loudnessExplanationUsesMeasuredLufs(loudness, measured, target),
    true,
    "loudness explanation uses measured post-master LUFS"
  );
  assert.match(loudness.explanation, /Final measured loudness: -10\.4 LUFS/);
  assert.doesNotMatch(loudness.explanation, /Final measured loudness: -9\.0 LUFS/);
  assert.equal(report.postMeasurements.integratedLufs, -10.4);
  assert.equal(report.preMeasurements.integratedLufs, -14.8);
  assert.equal(report.selectedTargetLufs, -9);
  assert.notEqual(report.postMeasurements.integratedLufs, report.selectedTargetLufs);
}

function runTargetLufsNotPresentedAsMeasuredTest() {
  const report = buildMasteringDecisionReport({
    settings: baseSettings({ targetLufs: -8.8, compressionIntensity: "strong" }),
    postMaster: baseAnalysis({ integratedLufs: -11.2, peakDb: -1.2 })
  });
  const loudness = decision(report, "loudness");
  assert.ok(loudness);
  assert.match(loudness.explanation, /-11\.2 LUFS/);
  assert.doesNotMatch(loudness.explanation, /target/i);
  assert.doesNotMatch(loudness.explanation, /-8\.8/);
  assert.equal(report.selectedTargetLufs, -8.8, "target is stored separately from measured LUFS");
}

function runSamplePeakNeverLabeledTruePeakTest() {
  const report = buildMasteringDecisionReport({
    settings: baseSettings({ limiterCeilingDb: -1, compressionIntensity: "strong" }),
    baseline: baseAnalysis({ peakDb: -2.2 }),
    postMaster: baseAnalysis({ integratedLufs: -10.1, peakDb: -1.05, crestDb: 8.4 })
  });
  const peak = decision(report, "peak_safety");
  const text = allReportText(report);
  assert.ok(peak, "sample peak can support a peak-level statement");
  assert.equal(peak.title, "Peak Level — Within Target");
  assert.match(peak.explanation, /measured sample peak/i);
  assert.match(peak.explanation, /mastering ceiling/i);
  assert.doesNotMatch(peak.title, /peak safety|true peak safe/i);
  assert.doesNotMatch(text, /true peak safe|peak safety|dbtp|inter-sample|streaming-platform|clipping prevention/i);
  assert.equal(reportTextContainsTruePeakClaim(text), false, "report text must not say true peak");
  assert.equal(report.postMeasurements.peakDb, -1.05);
}

function runStereoEvidenceTests() {
  const noWidth = buildMasteringDecisionReport({
    settings: baseSettings({ stereoWidth: 1, compressionIntensity: "strong" }),
    postMaster: baseAnalysis({ integratedLufs: -10 })
  });
  assert.equal(decision(noWidth, "stereo_image", "widened"), null, "unity width is not a widening claim");
  assert.equal(decision(noWidth, "stereo_image", "narrowed"), null, "unity width is not a narrowing claim");
  assert.ok(decision(noWidth, "stereo_image", "subtle"), "unity width reports subtle stereo processing");
  assert.doesNotMatch(decision(noWidth, "stereo_image", "subtle").explanation, /already wide/i);

  const widened = buildMasteringDecisionReport({
    settings: baseSettings({ stereoWidth: 1.08, compressionIntensity: "strong" })
  });
  assert.ok(decision(widened, "stereo_image", "widened"), "stereo widening requires a width decision above unity");

  const narrowed = buildMasteringDecisionReport({
    settings: baseSettings({ stereoWidth: 0.82, compressionIntensity: "strong" })
  });
  assert.ok(decision(narrowed, "stereo_image", "narrowed"), "stereo narrowing requires a width decision below unity");
}

function runLowEndEvidenceTests() {
  const strongButBoosted = buildMasteringDecisionReport({
    settings: baseSettings({
      eqDirection: { lowEnd: 1.2, lowMid: 0, presence: 0, air: 0 },
      compressionIntensity: "strong"
    }),
    baseline: baseAnalysis({ lowEndDb: -16 })
  });
  assert.equal(decision(strongButBoosted, "low_end", "protected"), null, "strong low end alone is not protection");
  assert.ok(decision(strongButBoosted, "low_end", "enhanced"), "boost is reported only from the Adaptive EQ decision");

  const strongAndAvoided = buildMasteringDecisionReport({
    settings: baseSettings({
      eqDirection: { lowEnd: 0, lowMid: 0, presence: 0, air: 0 },
      compressionIntensity: "strong"
    }),
    baseline: baseAnalysis({ lowEndDb: -16 })
  });
  const protectedDecision = decision(strongAndAvoided, "low_end", "protected");
  assert.ok(protectedDecision, "protected requires strong low-end measurement plus no bass boost");
  assert.ok(protectedDecision.dataSource.includes("adaptive_eq_low_end"));
  assert.ok(protectedDecision.dataSource.includes("pre_master_low_end_db"));

  const weakAndNeutral = buildMasteringDecisionReport({
    settings: baseSettings({
      eqDirection: { lowEnd: 0, lowMid: 0, presence: 0, air: 0 },
      compressionIntensity: "strong"
    }),
    baseline: baseAnalysis({ lowEndDb: -26 })
  });
  assert.equal(decision(weakAndNeutral, "low_end"), null, "neutral EQ without strong low end omits low-end claims");

  const reduced = buildMasteringDecisionReport({
    settings: baseSettings({
      eqDirection: { lowEnd: -1.2, lowMid: 0, presence: 0, air: 0 },
      compressionIntensity: "strong"
    }),
    baseline: baseAnalysis({ lowEndDb: -26 })
  });
  assert.ok(decision(reduced, "low_end", "reduced"), "low-end reduction requires an Adaptive EQ cut");
}

function runMissingPostMasterGracefulTest() {
  const report = buildMasteringDecisionReport({
    settings: baseSettings({ compressionIntensity: "light", stereoWidth: 1 }),
    baseline: baseAnalysis({ lowEndDb: -16, alreadyLimited: true }),
    postMaster: null,
    validationWarnings: ["Post-render analysis was unavailable for adaptive output."]
  });

  assert.equal(decision(report, "loudness"), null, "missing post-master omits measured loudness");
  assert.equal(decision(report, "peak_safety"), null, "missing post-master omits peak-level statement");
  assert.doesNotMatch(allReportText(report), /Peak Level — Within Target/);
  assert.doesNotMatch(allReportText(report), /Final measured loudness/);
  assert.doesNotMatch(report.summary, /improved|optimized/i);
  assert.deepEqual(report.postMeasurements, {}, "missing post-master leaves after-measurements empty");
  assert.equal(report.preMeasurements.integratedLufs, -14.2, "pre-master measurements still appear");
  assert.ok(decision(report, "dynamics", "preserved"), "settings-backed decisions still appear");
  assert.ok(decision(report, "low_end", "protected"), "low-end protection can still be proven from baseline + EQ");
  assert.ok(
    report.warnings.includes("Post-render analysis was unavailable for adaptive output."),
    "existing validation warning is preserved"
  );
  assert.equal(
    report.warnings.filter((warning) => /measured loudness and peak results are not shown/i.test(warning)).length,
    0,
    "does not duplicate a missing-analysis warning"
  );
}

function runDynamicsEvidenceTests() {
  const light = buildMasteringDecisionReport({
    settings: baseSettings({ compressionIntensity: "light", transientHandling: "balanced" })
  });
  assert.ok(decision(light, "dynamics", "preserved"));

  const mediumPreserve = buildMasteringDecisionReport({
    settings: baseSettings({ compressionIntensity: "medium", transientHandling: "preserve" })
  });
  assert.ok(decision(mediumPreserve, "dynamics", "preserved"));
  assert.match(decision(mediumPreserve, "dynamics").explanation, /moderate/);

  const strong = buildMasteringDecisionReport({
    settings: baseSettings({ compressionIntensity: "strong", transientHandling: "preserve" })
  });
  assert.equal(decision(strong, "dynamics"), null, "strong compression is not described as preserved");

  const healthyCrestOnly = buildMasteringDecisionReport({
    settings: baseSettings({ compressionIntensity: "strong", transientHandling: "balanced" }),
    baseline: baseAnalysis({ crestDb: 12.4, alreadyLimited: false })
  });
  assert.equal(
    decision(healthyCrestOnly, "dynamics"),
    null,
    "healthy pre-master crest is not treated as dynamics preservation"
  );
}

function runNoFabricatedTonalImprovementTest() {
  const report = buildMasteringDecisionReport({
    settings: baseSettings({
      eqDirection: { lowEnd: 0, lowMid: 0, presence: 0.8, air: 0 },
      compressionIntensity: "strong"
    }),
    postMaster: baseAnalysis({ integratedLufs: -10 })
  });
  const presence = decision(report, "tonal_balance", "lifted");
  assert.ok(presence);
  assert.doesNotMatch(presence.explanation, /improved/i);
  assert.match(presence.explanation, /Adaptive EQ decision/);
}

function runNeutralSummaryTest() {
  const report = buildMasteringDecisionReport({
    settings: baseSettings({
      eqDirection: { lowEnd: 0, lowMid: 0, presence: 0.8, air: 0 },
      compressionIntensity: "light",
      stereoWidth: 1
    }),
    baseline: baseAnalysis({ lowEndDb: -16 }),
    postMaster: baseAnalysis({ integratedLufs: -10.4, peakDb: -1.1 })
  });
  assert.match(report.summary, /^\d+ confirmed decisions from the settings applied and measurements taken\.$/);
  assert.doesNotMatch(
    report.summary,
    /professionally optimized|streaming optimized|tonal balance improved|dynamics improved/i
  );
}

function runArchitectureInvariants() {
  const reportModule = read("lib/audio/mastering-decision-report.ts");
  const forbiddenReportImports = [
    "@/lib/audio/mastering-pipeline",
    "@/lib/audio/adaptive-mastering-pipeline",
    "@/lib/audio/analyze-track",
    "@/lib/audio/track-analysis-v2",
    "@/lib/audio/master-readiness",
    "@/lib/audio/readiness",
    "@/lib/openai/adaptive-mastering",
    "runAdaptiveMasteringPipeline",
    "runMasteringPipeline",
    "evaluateMasterReadiness",
    "analyzeTrack(",
    "openai"
  ];
  for (const needle of forbiddenReportImports) {
    assertNotIncludes(reportModule, needle, "decision report must not import or alter DSP / readiness");
  }
  assertIncludes(reportModule, "shouldApplyAdaptiveStereoWidthFilter", "stereo claims reuse existing width evidence");

  const dspFiles = [
    "lib/audio/mastering-pipeline.ts",
    "lib/audio/adaptive-mastering-pipeline.ts",
    "lib/audio/analyze-track.ts",
    "lib/audio/master-readiness.ts",
    "lib/master-comparison/loudness-match.ts",
    "lib/master-comparison/master-comparison.ts"
  ];
  for (const file of dspFiles) {
    assertNotIncludes(read(file), "mastering-decision-report", `${file} must remain independent of the Decision Report`);
  }

  const route = read("app/api/master-ai/route.ts");
  assertIncludes(route, "buildMasteringDecisionReport", "Adaptive response includes a sanitized decision report");
  assertIncludes(route, "decisionReport,", "decisionReport is added to the Adaptive payload");
  assertIncludes(route, "adaptiveSettings: adaptive.instructionSummary", "existing Adaptive settings payload remains");

  const apiType = read("lib/api/adaptive-master.ts");
  assertIncludes(apiType, "decisionReport: MasteringDecisionReport", "client contract includes decisionReport");

  const uploadForm = read("components/upload-form.tsx");
  assertIncludes(uploadForm, "MasteringDecisionReportPanel", "Decision Report is wired near A/B");
  assertIncludes(uploadForm, "adaptiveResultExists={adaptiveModeActive}", "report only renders after Adaptive result");
  assertIncludes(uploadForm, "setDecisionReport(adaptive.decisionReport ?? null)", "report is stored from Adaptive payload");
  assertIncludes(uploadForm, "<AudioCompare", "A/B comparison remains");
  assertIncludes(uploadForm, "mergeAdaptiveAnalysisForComparison(adaptive.analysis)", "A/B analysis merge remains");
  assertIncludes(uploadForm, "<AdaptiveExportGate", "adaptive download gate remains");
  assertIncludes(uploadForm, "buildMp3DownloadUrl(result.download.fileId, result.jobId)", "MP3 download URL remains");
  assertIncludes(uploadForm, 'data-analytics-id="ab-download"', "download analytics remain");
  assertIncludes(uploadForm, "function MasterReadinessPanel", "Master Readiness UI remains");
  assertIncludes(
    uploadForm,
    "Heuristic for mastering readiness — not a mix or song quality rating.",
    "Master Readiness copy remains"
  );
  assertIncludes(uploadForm, "<PostMasterReleaseCallout />", "download callout remains after the report");

  const ui = read("components/mastering-decision-report.tsx");
  assertIncludes(ui, "What MasterSauce Changed", "default heading is user-facing");
  assertIncludes(ui, "Technical Details", "optional technical section exists");
  assertIncludes(ui, "canShowMasteringDecisionReport", "UI uses the Adaptive-result visibility helper");
  assertIncludes(reportModule, 'title: "Peak Level — Within Target"', "peak statement is sample-peak vs ceiling");
  assertNotIncludes(reportModule, 'title: "Peak Safety"', "user-facing title must not say Peak Safety");
  assertIncludes(ui, 'label: "Peak"', "sample peak is labeled Peak");
  assertNotIncludes(ui, "true peak", "UI must not label sample peak as true peak");
  assertNotIncludes(ui, "True Peak", "UI must not label sample peak as True Peak");
  assertNotIncludes(ui, "True Peak Safe", "UI must not claim true-peak safety");
  assertNotIncludes(ui, "dBTP", "UI must not use true-peak units");
  assertNotIncludes(ui, "dataSource", "UI must not expose internal dataSource names");
  assertIncludes(ui, "Selected loudness target", "target LUFS is labeled as selected, not measured");
  assertNotIncludes(ui, "evaluateMasterReadiness", "Decision Report UI must not call Master Readiness");
}

function run() {
  runVisibilityTests();
  runUnsupportedCategoryOmissionTests();
  runMeasuredLufsTests();
  runTargetLufsNotPresentedAsMeasuredTest();
  runSamplePeakNeverLabeledTruePeakTest();
  runStereoEvidenceTests();
  runLowEndEvidenceTests();
  runMissingPostMasterGracefulTest();
  runDynamicsEvidenceTests();
  runNoFabricatedTonalImprovementTest();
  runNeutralSummaryTest();
  runArchitectureInvariants();
  console.log("mastering decision report tests passed");
}

run();
