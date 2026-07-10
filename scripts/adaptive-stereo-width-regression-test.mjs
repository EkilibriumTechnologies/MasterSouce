/**
 * Focused Adaptive stereo-width regression test.
 *
 * Run: node --experimental-transform-types --import ./scripts/lib/register-ts-alias.mjs scripts/adaptive-stereo-width-regression-test.mjs
 */
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import ffmpegStatic from "ffmpeg-static";

import {
  classifyAdaptiveStereoIntent,
  mapAdaptiveStereoWidth,
  resolveAdaptiveStereoWidthMultiplier,
  shouldApplyAdaptiveStereoWidthFilter
} from "@/lib/audio/adaptive-stereo-width";

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const FFMPEG = typeof ffmpegStatic === "string" ? ffmpegStatic : process.env.FFMPEG_BIN?.trim() || null;
assert.ok(FFMPEG, "ffmpeg-static or FFMPEG_BIN required for adaptive stereo fixture tests");

function ff(args) {
  const result = spawnSync(FFMPEG, args, { encoding: "utf8" });
  assert.equal(result.status, 0, `ffmpeg failed: ${result.stderr?.slice(-900)}`);
  return result.stderr ?? "";
}

function read(relPath) {
  return readFileSync(path.join(REPO_ROOT, relPath), "utf8");
}

function dbToPower(db) {
  return 10 ** (db / 10);
}

function round(value) {
  return Number(value.toFixed(3));
}

function parseChannelRms(stderr) {
  const rms = [];
  let channel = null;
  for (const line of stderr.split(/\r?\n/)) {
    const channelMatch = line.match(/Channel:\s*(\d+)/);
    if (channelMatch) {
      channel = Number(channelMatch[1]);
      continue;
    }
    const rmsMatch = line.match(/RMS level dB:\s*(-?\d+(?:\.\d+)?)/);
    if (rmsMatch && channel !== null && rms[channel - 1] === undefined) {
      rms[channel - 1] = Number(rmsMatch[1]);
    }
  }
  assert.equal(rms.length >= 2, true, `Could not parse mid/side RMS from astats output: ${stderr.slice(-900)}`);
  return rms;
}

function measureStereoMetrics(inputPath, { highpass = null } = {}) {
  const band = highpass === null ? "" : `highpass=f=${highpass},`;
  const stderr = ff([
    "-hide_banner",
    "-i",
    inputPath,
    "-filter_complex",
    `[0:a]${band}asplit=2[a][b];` +
      "[a]pan=mono|c0=0.5*c0+0.5*c1[mid];" +
      "[b]pan=mono|c0=0.5*c0-0.5*c1[side];" +
      "[mid][side]amerge=inputs=2,astats=metadata=0:reset=0[m]",
    "-map",
    "[m]",
    "-f",
    "null",
    "-"
  ]);
  const [midRmsDb, sideRmsDb] = parseChannelRms(stderr);
  const midPower = dbToPower(midRmsDb);
  const sidePower = dbToPower(sideRmsDb);
  const correlation = (midPower - sidePower) / (midPower + sidePower);
  return {
    midRmsDb: round(midRmsDb),
    sideRmsDb: round(sideRmsDb),
    sideToMidDb: round(sideRmsDb - midRmsDb),
    correlation: round(correlation)
  };
}

function renderWithWidth(inputPath, outputPath, stereoWidth) {
  const multiplier = resolveAdaptiveStereoWidthMultiplier(stereoWidth);
  const filter = shouldApplyAdaptiveStereoWidthFilter(stereoWidth) ? `extrastereo=m=${multiplier.toFixed(2)}` : "anull";
  ff(["-y", "-hide_banner", "-i", inputPath, "-af", filter, "-c:a", "pcm_s16le", "-ar", "44100", "-ac", "2", outputPath]);
  return { filter, multiplier };
}

function renderOldBug(inputPath, outputPath) {
  const oldModerateCoefficient = Number(((1.02 - 1) * 2.2).toFixed(2));
  ff([
    "-y",
    "-hide_banner",
    "-i",
    inputPath,
    "-af",
    `extrastereo=m=${oldModerateCoefficient}`,
    "-c:a",
    "pcm_s16le",
    "-ar",
    "44100",
    "-ac",
    "2",
    outputPath
  ]);
  return { filter: `extrastereo=m=${oldModerateCoefficient}`, multiplier: oldModerateCoefficient };
}

function genStereoFixture(out) {
  const left =
    "0.18*sin(2*PI*65*t)+0.12*sin(2*PI*115*t)+" +
    "0.16*sin(2*PI*440*t)+0.10*sin(2*PI*880*t)+0.055*sin(2*PI*1777*t)";
  const right =
    "0.18*sin(2*PI*65*t)+0.12*sin(2*PI*115*t)+" +
    "0.16*sin(2*PI*554*t)+0.10*sin(2*PI*990*t)+0.055*sin(2*PI*2333*t)";
  ff([
    "-y",
    "-hide_banner",
    "-f",
    "lavfi",
    "-i",
    `aevalsrc=exprs='${left}|${right}':s=44100:d=6`,
    "-c:a",
    "pcm_s16le",
    "-ar",
    "44100",
    "-ac",
    "2",
    out
  ]);
}

function runParameterTests() {
  const preservePrompt =
    "Preserve the original stereo image and existing left-right separation. Do not narrow the mix or reduce the side channel.";
  assert.equal(classifyAdaptiveStereoIntent(preservePrompt), "preserve");
  assert.equal(classifyAdaptiveStereoIntent("Center the vocal, kick, bass, and snare without narrowing guitars"), "preserve");
  assert.equal(classifyAdaptiveStereoIntent("Keep the lead vocal centered and make the kick tighter"), "unspecified");
  assert.equal(classifyAdaptiveStereoIntent("Make it narrow and intimate"), "narrower");
  assert.equal(classifyAdaptiveStereoIntent("Make it narrow and intimate, but don't collapse it to mono"), "narrower");
  assert.equal(classifyAdaptiveStereoIntent("Give this a vintage mono master"), "mono");

  assert.equal(mapAdaptiveStereoWidth("moderate", "preserve"), 1);
  assert.equal(mapAdaptiveStereoWidth("moderate", "unspecified"), 1);
  assert.equal(mapAdaptiveStereoWidth("wide", "unspecified"), 1.08);
  assert.ok(mapAdaptiveStereoWidth("moderate", "narrower") < 1, "explicit narrow maps below unity");
  assert.ok(mapAdaptiveStereoWidth("moderate", "mono") < mapAdaptiveStereoWidth("moderate", "narrower"), "mono permits stronger narrowing");

  assert.equal(shouldApplyAdaptiveStereoWidthFilter(1), false);
  assert.equal(resolveAdaptiveStereoWidthMultiplier(1.08), 1.08);
  assert.equal(resolveAdaptiveStereoWidthMultiplier(0), 0.35, "invalid zero cannot collapse to silence/mono by accident");
}

function runSourceInvariants() {
  const pipeline = read("lib/audio/adaptive-mastering-pipeline.ts");
  assert.ok(!pipeline.includes("(settings.stereoWidth - 1) * 2.2"), "old near-zero extrastereo scaling removed");
  assert.ok(pipeline.includes("extrastereo=m=${toFixedDb(stereoWidthMultiplier)}"), "pipeline passes the real width multiplier to ffmpeg");
  assert.ok(!/pan=mono|lowpass=f=150/.test(pipeline), "adaptive pipeline does not contain a full-band or bass-mono collapse stage");
  assert.ok(pipeline.includes("monoCompatibilityActivated: false"), "development diagnostics report mono compatibility inactive");
  assert.ok(pipeline.includes("lowFrequencyMonoActivated: false"), "development diagnostics report bass mono inactive");

  const route = read("app/api/master-ai/route.ts");
  assert.ok(route.includes("userIntent,"), "master-ai route forwards the combined user intent");
  assert.ok(route.includes("referenceAnalysis,"), "reference track guidance is separate from the user prompt");

  const uploadForm = read("components/upload-form.tsx");
  assert.ok(uploadForm.includes('formData.append("user_intent", intent)'), "multipart adaptive request sends prompt text");
  assert.ok(uploadForm.includes("user_intent: adaptiveIntent.trim() || undefined"), "JSON adaptive request sends prompt text");

  const v2FlagTest = read("scripts/track-analysis-v2-feature-flag-test.mjs");
  assert.ok(v2FlagTest.includes("No mastering pipeline consumes V2"), "V1/V2 mastering routing invariant remains covered");
}

function runAudioRegression() {
  const workDir = mkdtempSync(path.join(tmpdir(), "adaptive-stereo-"));
  const fx = (name) => path.join(workDir, name);
  try {
    const input = fx("fixture.wav");
    genStereoFixture(input);

    const old = fx("old-bug.wav");
    const preserve = fx("preserve.wav");
    const defaultOut = fx("default.wav");
    const center = fx("center.wav");
    const wide = fx("wide.wav");
    const narrow = fx("narrow.wav");
    const mono = fx("mono.wav");

    const oldRender = renderOldBug(input, old);
    const preserveRender = renderWithWidth(input, preserve, mapAdaptiveStereoWidth("moderate", "preserve"));
    const defaultRender = renderWithWidth(input, defaultOut, mapAdaptiveStereoWidth("moderate", "unspecified"));
    const centerRender = renderWithWidth(input, center, mapAdaptiveStereoWidth("moderate", "unspecified"));
    const wideRender = renderWithWidth(input, wide, mapAdaptiveStereoWidth("wide", "wider"));
    const narrowRender = renderWithWidth(input, narrow, mapAdaptiveStereoWidth("moderate", "narrower"));
    const monoRender = renderWithWidth(input, mono, mapAdaptiveStereoWidth("moderate", "mono"));

    const inputMetrics = measureStereoMetrics(input);
    const oldMetrics = measureStereoMetrics(old);
    const preserveMetrics = measureStereoMetrics(preserve);
    const defaultMetrics = measureStereoMetrics(defaultOut);
    const centerMetrics = measureStereoMetrics(center);
    const wideMetrics = measureStereoMetrics(wide);
    const narrowMetrics = measureStereoMetrics(narrow);
    const monoMetrics = measureStereoMetrics(mono);
    const highInputMetrics = measureStereoMetrics(input, { highpass: 250 });
    const highPreserveMetrics = measureStereoMetrics(preserve, { highpass: 250 });

    assert.ok(inputMetrics.sideToMidDb > -12, "fixture has measurable stereo separation");
    assert.ok(oldMetrics.sideToMidDb < inputMetrics.sideToMidDb - 10, "old scaling reproduces severe side-channel loss");
    assert.ok(oldMetrics.correlation > 0.97, "old scaling pushes correlation near mono");

    for (const [label, metrics] of [
      ["preserve", preserveMetrics],
      ["default", defaultMetrics],
      ["center", centerMetrics]
    ]) {
      assert.ok(
        Math.abs(metrics.sideToMidDb - inputMetrics.sideToMidDb) <= 0.5,
        `${label} should preserve full-band Side/Mid within 0.5 dB`
      );
      assert.ok(metrics.correlation < 0.95, `${label} should not become nearly mono`);
    }

    assert.ok(wideMetrics.sideToMidDb > inputMetrics.sideToMidDb, "wide intent can conservatively increase side energy");
    assert.ok(narrowMetrics.sideToMidDb < inputMetrics.sideToMidDb - 1, "explicit narrow intent can reduce side energy");
    assert.ok(monoMetrics.sideToMidDb < narrowMetrics.sideToMidDb - 5, "explicit mono permits stronger reduction than narrow");
    assert.ok(
      Math.abs(highPreserveMetrics.sideToMidDb - highInputMetrics.sideToMidDb) <= 0.5,
      "preserve path keeps mid/high side information intact"
    );

    const report = {
      renders: {
        oldBug: oldRender,
        preserve: preserveRender,
        default: defaultRender,
        center: centerRender,
        wide: wideRender,
        narrow: narrowRender,
        mono: monoRender
      },
      fullBand: {
        input: inputMetrics,
        oldBug: oldMetrics,
        preserve: preserveMetrics,
        default: defaultMetrics,
        center: centerMetrics,
        wide: wideMetrics,
        narrow: narrowMetrics,
        mono: monoMetrics
      },
      highpassed250Hz: {
        input: highInputMetrics,
        preserve: highPreserveMetrics
      }
    };
    console.log("adaptive-stereo-width-regression metrics", JSON.stringify(report, null, 2));
  } finally {
    rmSync(workDir, { recursive: true, force: true });
  }
}

runParameterTests();
runSourceInvariants();
runAudioRegression();
console.log("adaptive-stereo-width-regression-test: ok");
