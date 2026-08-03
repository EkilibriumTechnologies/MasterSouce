/**
 * Adaptive Mastering sample-rate preservation tests.
 *
 * Verifies Adaptive final WAV mux (and Restoration intermediates) preserve the
 * authoritative source sample rate via resolveExportSampleRate — the same helper
 * used by preset mastering / codec remux.
 *
 * Run: npm run test:adaptive-sample-rate
 */
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { existsSync, mkdtempSync, readFileSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import ffmpegStatic from "ffmpeg-static";

import { runAudioArtifactRestoration } from "@/lib/audio/audio-restoration";
import { probeAudioStream } from "@/lib/audio/media-probe";
import {
  resolveCodecForQuality,
  resolveExportSampleRate,
  WAV_EXPORT_CHANNELS,
  WAV_EXPORT_SAMPLE_RATE
} from "@/lib/audio/wav-export-codec";
import { validateExportedWav } from "@/lib/audio/wav-export-validation";

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const FFMPEG = typeof ffmpegStatic === "string" ? ffmpegStatic : process.env.FFMPEG_BIN?.trim() || null;
assert.ok(FFMPEG, "ffmpeg-static or FFMPEG_BIN required for adaptive sample-rate tests");

const PRESERVED_RATES = [44100, 48000, 96000];
const FALLBACK_NONSTANDARD_RATE = 32000;

function read(relPath) {
  return readFileSync(path.join(REPO_ROOT, relPath), "utf8");
}

function ff(args) {
  const result = spawnSync(FFMPEG, args, { encoding: "utf8" });
  assert.equal(result.status, 0, `ffmpeg failed: ${(result.stderr || "").slice(-1000)}`);
  return result.stderr || "";
}

function sha256File(filePath) {
  return createHash("sha256").update(readFileSync(filePath)).digest("hex");
}

function makeSource(workDir, sampleRate, name) {
  const out = path.join(workDir, name);
  ff([
    "-y",
    "-hide_banner",
    "-f",
    "lavfi",
    "-i",
    `sine=frequency=440:duration=2:sample_rate=${sampleRate}`,
    "-c:a",
    "pcm_s16le",
    "-ar",
    String(sampleRate),
    "-ac",
    String(WAV_EXPORT_CHANNELS),
    out
  ]);
  return out;
}

/**
 * Mirrors Adaptive final-mux args: plan codec + resolveExportSampleRate(source).
 * Does not exercise Adaptive EQ/compression decisions.
 */
async function renderAdaptiveOwnerExport(sourcePath, outputPath) {
  const outputQuality = "32bit_float";
  const outputCodec = resolveCodecForQuality(outputQuality);
  assert.equal(outputCodec, "pcm_f32le");
  const inputProbe = await probeAudioStream(sourcePath);
  const exportSampleRate = resolveExportSampleRate(inputProbe.sample_rate);
  ff([
    "-y",
    "-hide_banner",
    "-i",
    sourcePath,
    "-af",
    "volume=-6dB,alimiter=limit=0.8913:attack=5:release=80:level=disabled",
    "-c:a",
    outputCodec,
    "-ar",
    String(exportSampleRate),
    "-ac",
    String(WAV_EXPORT_CHANNELS),
    outputPath
  ]);
  await validateExportedWav(outputPath, { codec: outputCodec, sampleRate: exportSampleRate });
  const probe = await probeAudioStream(outputPath);
  return { outputQuality, outputCodec, exportSampleRate, inputProbe, probe };
}

function highArtifactProfile() {
  return {
    version: "v1",
    metallicHarshness: 0.8,
    highFrequencySmear: 0.8,
    transientSoftness: 0.8,
    stereoInstability: 0.8,
    sibilanceHarshness: 0.8,
    codecLikeResidue: 0.8,
    overallSeverity: 0.8,
    recommendedStrength: "balanced",
    restorationRecommended: true
  };
}

function runResolverUnitTests() {
  for (const rate of [44100, 48000, 88200, 96000, 176400, 192000]) {
    assert.equal(resolveExportSampleRate(rate), rate, `preserves ${rate}`);
  }
  assert.equal(resolveExportSampleRate(FALLBACK_NONSTANDARD_RATE), WAV_EXPORT_SAMPLE_RATE, "nonstandard falls back to 44.1");
  assert.equal(resolveExportSampleRate(null), WAV_EXPORT_SAMPLE_RATE, "null falls back to 44.1");
  assert.equal(resolveExportSampleRate(undefined), WAV_EXPORT_SAMPLE_RATE, "undefined falls back to 44.1");
  assert.equal(resolveExportSampleRate(Number.NaN), WAV_EXPORT_SAMPLE_RATE, "NaN falls back to 44.1");
  console.log("resolver unit tests: ok");
}

function runStaticInvariants() {
  const pipeline = read("lib/audio/adaptive-mastering-pipeline.ts");
  assert.ok(pipeline.includes("resolveExportSampleRate"), "adaptive pipeline imports resolveExportSampleRate");
  assert.ok(pipeline.includes("probeAudioStream"), "adaptive pipeline probes input sample rate");
  assert.ok(
    pipeline.includes("String(exportSampleRate)"),
    "adaptive pipeline muxes with resolved export sample rate"
  );
  assert.ok(
    !pipeline.includes("String(WAV_EXPORT_SAMPLE_RATE)"),
    "adaptive pipeline no longer hardcodes WAV_EXPORT_SAMPLE_RATE for -ar"
  );
  assert.ok(
    pipeline.includes("sampleRate: exportSampleRate"),
    "adaptive pipeline validates exported sample rate"
  );
  assert.ok(
    pipeline.includes("[adaptive-mastering] inputSampleRate="),
    "adaptive pipeline logs inputSampleRate"
  );
  assert.ok(
    pipeline.includes("[adaptive-mastering] outputSampleRate="),
    "adaptive pipeline logs outputSampleRate"
  );
  assert.ok(
    pipeline.includes("[adaptive-mastering] verifiedExportSampleRate="),
    "adaptive pipeline logs verifiedExportSampleRate"
  );

  const preset = read("lib/audio/mastering-pipeline.ts");
  assert.ok(preset.includes("resolveExportSampleRate(inputProbe.sample_rate)"), "preset still uses shared resolver");

  const finalize = read("lib/audio/wav-export-finalize.ts");
  assert.ok(finalize.includes("resolveExportSampleRate(probe.sample_rate)"), "finalize remux still preserves rate");

  const restoration = read("lib/audio/audio-restoration.ts");
  assert.ok(restoration.includes("String(sampleRate)"), "restoration writes intermediate at probed rate");
  assert.ok(restoration.includes('"-c:a"'), "restoration still uses its own intermediate codec");
  assert.ok(restoration.includes('"pcm_s24le"'), "restoration intermediate remains pcm_s24le");

  const route = read("app/api/master-ai/route.ts");
  const restorationHelper = read("lib/audio/mastering-source-restoration.ts");
  assert.ok(
    restorationHelper.includes("selectedSource=${selectedSource}") ||
      restorationHelper.includes("[adaptive-mastering] selectedSource="),
    "selectedSource logging intact"
  );
  assert.ok(route.includes("resolveMasteringSourceWithRestoration"), "adaptive uses shared restoration helper");
  assert.ok(route.includes("inputPath: adaptiveSource"), "adaptive source selection intact");

  console.log("static invariants: ok");
}

async function runAdaptiveWithoutRestorationTests(workDir) {
  for (const rate of PRESERVED_RATES) {
    const source = makeSource(workDir, rate, `adaptive_src_${rate}.wav`);
    const checksumBefore = sha256File(source);
    const out = path.join(workDir, `adaptive_out_${rate}.wav`);
    const result = await renderAdaptiveOwnerExport(source, out);
    assert.equal(result.probe.sample_rate, rate, `Adaptive without restoration preserves ${rate}`);
    assert.equal(result.probe.codec_name, "pcm_f32le", `owner codec remains pcm_f32le at ${rate}`);
    assert.equal(result.probe.sample_fmt, "flt", `sample_fmt remains flt at ${rate}`);
    assert.equal(result.probe.channels, WAV_EXPORT_CHANNELS, `stereo preserved at ${rate}`);
    assert.equal(sha256File(source), checksumBefore, `source unchanged after Adaptive export at ${rate}`);
    console.log(`adaptive without restoration ${rate}: ok`, {
      outputQuality: result.outputQuality,
      outputCodec: result.outputCodec,
      verifiedExportCodec: result.probe.codec_name,
      verifiedExportSampleRate: result.probe.sample_rate
    });
  }
}

async function runAdaptiveWithRestorationTests(workDir) {
  for (const rate of PRESERVED_RATES) {
    const source = makeSource(workDir, rate, `restored_src_${rate}.wav`);
    const checksumBefore = sha256File(source);
    const restored = await runAudioArtifactRestoration({
      inputPath: source,
      jobId: `sr_rest_${rate}`,
      strength: "balanced",
      artifactProfile: highArtifactProfile()
    });
    assert.equal(restored.success, true, `restoration succeeds at ${rate}`);
    assert.ok(restored.outputPath && existsSync(restored.outputPath), "restored intermediate exists");
    assert.notEqual(restored.outputPath, source, "restored intermediate is distinct");
    const restoredProbe = await probeAudioStream(restored.outputPath);
    assert.equal(restoredProbe.sample_rate, rate, `restored intermediate preserves ${rate}`);
    assert.equal(restoredProbe.codec_name, "pcm_s24le", "restored intermediate remains pcm_s24le");

    const out = path.join(workDir, `adaptive_from_restored_${rate}.wav`);
    const result = await renderAdaptiveOwnerExport(restored.outputPath, out);
    assert.equal(result.probe.sample_rate, rate, `Restoration + Adaptive preserves ${rate}`);
    assert.equal(result.probe.codec_name, "pcm_f32le", `final owner codec remains pcm_f32le at ${rate}`);
    assert.notEqual(result.probe.codec_name, "pcm_s24le", "final WAV is not the restoration intermediate");
    assert.equal(sha256File(source), checksumBefore, `source unchanged after Restoration+Adaptive at ${rate}`);
    console.log(`adaptive with restoration ${rate}: ok`, {
      restoredSampleRate: restoredProbe.sample_rate,
      verifiedExportCodec: result.probe.codec_name,
      verifiedExportSampleRate: result.probe.sample_rate
    });
  }
}

async function runRestorationFailureFallbackTest(workDir) {
  const rate = 48000;
  const source = makeSource(workDir, rate, "fallback_src_48000.wav");
  const checksumBefore = sha256File(source);
  const failed = await runAudioArtifactRestoration({
    inputPath: path.join(workDir, "missing-source.wav"),
    jobId: "sr_rest_fallback",
    strength: "balanced",
    artifactProfile: highArtifactProfile()
  });
  assert.equal(failed.success, false, "missing restoration input fails");
  assert.equal(failed.fallbackUsed, true, "restoration failure falls back");

  // Adaptive continues on original_source when restoration fails.
  const out = path.join(workDir, "adaptive_fallback_48000.wav");
  const result = await renderAdaptiveOwnerExport(source, out);
  assert.equal(result.probe.sample_rate, rate, "fallback path preserves original sample rate");
  assert.equal(result.probe.codec_name, "pcm_f32le", "fallback path keeps owner pcm_f32le");
  assert.equal(sha256File(source), checksumBefore, "original checksum unchanged on restoration failure");
  console.log("restoration failure fallback: ok", {
    selectedSource: "original_source",
    verifiedExportSampleRate: result.probe.sample_rate,
    verifiedExportCodec: result.probe.codec_name
  });
}

async function runPreviewRegressionCheck(workDir) {
  const source = makeSource(workDir, 48000, "preview_src_48000.wav");
  const mastered = path.join(workDir, "preview_master_48000.wav");
  await renderAdaptiveOwnerExport(source, mastered);
  const preview = path.join(workDir, "preview.mp3");
  ff([
    "-y",
    "-hide_banner",
    "-i",
    mastered,
    "-ss",
    "0.2",
    "-t",
    "1.0",
    "-codec:a",
    "libmp3lame",
    "-b:a",
    "192k",
    preview
  ]);
  assert.ok(statSync(preview).size > 0, "preview MP3 generated");
  // ffmpeg -i without an output exits non-zero; stderr still carries the stream line.
  const probe = spawnSync(FFMPEG, ["-hide_banner", "-i", preview], { encoding: "utf8" });
  assert.match(probe.stderr || "", /Audio:\s*mp3/i, "preview remains MP3");
  console.log("preview/MP3 regression: ok");
}

async function run() {
  runResolverUnitTests();
  runStaticInvariants();

  const workDir = mkdtempSync(path.join(tmpdir(), "mastersouce-adaptive-sr-"));
  try {
    await runAdaptiveWithoutRestorationTests(workDir);
    await runAdaptiveWithRestorationTests(workDir);
    await runRestorationFailureFallbackTest(workDir);
    await runPreviewRegressionCheck(workDir);
  } finally {
    rmSync(workDir, { recursive: true, force: true });
  }

  console.log("adaptive sample-rate preservation tests passed");
}

await run();
