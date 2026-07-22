/**
 * Deterministic preset-mastering calibration harness (local only; not part of npm test).
 * Uses one identical synthetic source for every genre × loudness mode.
 */
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { getFfmpegExecutablePath } from "@/lib/audio/ffmpeg-bin";
import { runMasteringPipeline } from "@/lib/audio/mastering-pipeline";
import { probeAudioStream } from "@/lib/audio/media-probe";
import { GENRE_PRESETS, getLoudnessModeLufsTarget, getLoudnessModeTruePeak, LOUDNESS_MODES } from "@/lib/genre-presets";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, "..");
const LABEL = process.env.CALIBRATION_LABEL || "after";
const OUT_JSON = path.join(REPO_ROOT, "tmp", `preset-calibration-${LABEL}.json`);

const GENRES = Object.keys(GENRE_PRESETS);
const MODES = Object.keys(LOUDNESS_MODES);

function ff(args) {
  const bin = getFfmpegExecutablePath();
  const r = spawnSync(bin, args, { encoding: "utf8" });
  if (r.status !== 0) {
    throw new Error(`ffmpeg failed (${r.status}): ${(r.stderr || "").slice(-1200)}`);
  }
  return r.stderr || "";
}

function parseLastFloat(text, pattern) {
  const matches = [...text.matchAll(pattern)];
  if (!matches.length) return null;
  const value = Number(matches[matches.length - 1][1]);
  return Number.isFinite(value) ? value : null;
}

async function measureMaster(filePath) {
  const ebur = ff([
    "-hide_banner",
    "-i",
    filePath,
    "-filter_complex",
    "ebur128=peak=true:framelog=verbose",
    "-f",
    "null",
    "-"
  ]);
  const vol = ff(["-hide_banner", "-i", filePath, "-af", "volumedetect", "-f", "null", "-"]);
  const astats = ff([
    "-hide_banner",
    "-i",
    filePath,
    "-af",
    "astats=metadata=1:reset=0",
    "-f",
    "null",
    "-"
  ]);

  const integratedLufs = parseLastFloat(ebur, /I:\s*(-?\d+(?:\.\d+)?)\s*LUFS/g);
  const lra = parseLastFloat(ebur, /LRA:\s*(-?\d+(?:\.\d+)?)\s*LU/g);
  // Prefer the summary True-peak block; fall back to last TPK sample if needed.
  const truePeakBlock = ebur.match(/True peak:\s*Peak:\s*(-?\d+(?:\.\d+)?)\s*dBFS/i);
  const truePeak =
    truePeakBlock && Number.isFinite(Number(truePeakBlock[1]))
      ? Number(truePeakBlock[1])
      : parseLastFloat(ebur, /TPK:\s*(-?\d+(?:\.\d+)?)/g);
  const samplePeak = parseLastFloat(vol, /max_volume:\s*(-?\d+(?:\.\d+)?)\s*dB/g);
  const rms = parseLastFloat(vol, /mean_volume:\s*(-?\d+(?:\.\d+)?)\s*dB/g);
  const crest =
    samplePeak !== null && rms !== null ? Number((samplePeak - rms).toFixed(2)) : null;
  const correlation = parseLastFloat(astats, /Overall\s+Pearson\s+correlation:\s*(-?\d+(?:\.\d+)?)/gi);
  const probe = await probeAudioStream(filePath);

  return {
    integratedLufs,
    truePeakDbTp: truePeak,
    samplePeakDb: samplePeak,
    lra,
    crestFactorDb: crest,
    rmsDb: rms,
    sampleRate: probe.sample_rate,
    codec: probe.codec_name,
    channels: probe.channels,
    stereoCorrelation: correlation,
    clipped: samplePeak !== null && samplePeak >= -0.05
  };
}

async function makeSource(dir, sampleRate) {
  const out = path.join(dir, `source_${sampleRate}.wav`);
  // Mix-level stereo bed (~-12 LUFS): sub/mid/high partials with slight L/R offset.
  ff([
    "-y",
    "-hide_banner",
    "-f",
    "lavfi",
    "-i",
    `aevalsrc=exprs='0.45*sin(2*PI*55*t)+0.35*sin(2*PI*110*t)+0.25*sin(2*PI*220*t)+0.20*sin(2*PI*880*t)+0.12*sin(2*PI*3500*t)+0.08*sin(2*PI*8000*t)+0.05*sin(2*PI*12000*t)':s=${sampleRate}:d=12`,
    "-f",
    "lavfi",
    "-i",
    `aevalsrc=exprs='0.42*sin(2*PI*58*t)+0.32*sin(2*PI*116*t)+0.22*sin(2*PI*233*t)+0.18*sin(2*PI*910*t)+0.11*sin(2*PI*3600*t)+0.07*sin(2*PI*8200*t)+0.045*sin(2*PI*11500*t)':s=${sampleRate}:d=12`,
    "-filter_complex",
    "[0:a][1:a]join=inputs=2:channel_layout=stereo,volume=-6dB[out]",
    "-map",
    "[out]",
    "-c:a",
    "pcm_s24le",
    "-ar",
    String(sampleRate),
    "-ac",
    "2",
    out
  ]);
  return out;
}

async function main() {
  await fs.mkdir(path.join(REPO_ROOT, "tmp"), { recursive: true });
  const work = await fs.mkdtemp(path.join(os.tmpdir(), "preset-cal-"));
  const source441 = await makeSource(work, 44100);
  const source48 = await makeSource(work, 48000);
  const source96 = await makeSource(work, 96000);

  const sourceMetrics = await measureMaster(source441);
  const rows = [];

  for (const genre of GENRES) {
    for (const mode of MODES) {
      const result = await runMasteringPipeline({
        inputPath: source441,
        genre,
        loudnessMode: mode,
        outputFormat: "wav",
        outputQuality: "32bit_float",
        jobId: `cal_${LABEL}_${genre}_${mode}`
      });
      const measured = await measureMaster(result.masteredPath);
      const targetLufs = getLoudnessModeLufsTarget(GENRE_PRESETS[genre], mode);
      const targetTp = getLoudnessModeTruePeak(GENRE_PRESETS[genre], mode);
      rows.push({
        genre,
        mode,
        targetLufs,
        targetTruePeak: targetTp,
        lufsError: measured.integratedLufs !== null ? Number((measured.integratedLufs - targetLufs).toFixed(2)) : null,
        tpHeadroom:
          measured.truePeakDbTp !== null ? Number((targetTp - measured.truePeakDbTp).toFixed(2)) : null,
        ...measured,
        ownerFloatOk: measured.codec === "pcm_f32le"
      });
      await fs.unlink(result.masteredPath).catch(() => {});
      await fs.unlink(result.previewPath).catch(() => {});
      await fs.unlink(result.inputPreviewPath).catch(() => {});
    }
  }

  // Sample-rate preservation checks (Pop / balanced).
  const srChecks = [];
  for (const [label, src, expected] of [
    ["44.1", source441, 44100],
    ["48", source48, 48000],
    ["96", source96, 96000]
  ]) {
    const result = await runMasteringPipeline({
      inputPath: src,
      genre: "pop",
      loudnessMode: "balanced",
      outputFormat: "wav",
      outputQuality: "24bit",
      jobId: `cal_sr_${LABEL}_${expected}`
    });
    const probe = await probeAudioStream(result.masteredPath);
    srChecks.push({
      label,
      expectedHz: expected,
      observedHz: probe.sample_rate,
      ok: probe.sample_rate === expected,
      codec: probe.codec_name
    });
    if (LABEL === "after") {
      assert.equal(probe.sample_rate, expected, `sample rate ${label} must be preserved`);
    }
    await fs.unlink(result.masteredPath).catch(() => {});
    await fs.unlink(result.previewPath).catch(() => {});
    await fs.unlink(result.inputPreviewPath).catch(() => {});
  }

  const owner = rows.find((r) => r.genre === "pop" && r.mode === "balanced");
  assert.ok(owner?.ownerFloatOk, "owner/pop balanced must remain pcm_f32le");

  const report = {
    label: LABEL,
    generatedAt: new Date().toISOString(),
    sourceMetrics,
    sampleRateChecks: srChecks,
    rows
  };
  await fs.writeFile(OUT_JSON, JSON.stringify(report, null, 2), "utf8");
  console.log(`Wrote ${OUT_JSON}`);
  console.log(
    rows
      .map(
        (r) =>
          `${r.genre}/${r.mode}: LUFS ${r.integratedLufs?.toFixed(1)} (Δ${r.lufsError}) TP ${r.truePeakDbTp?.toFixed(2)} (ceil ${r.targetTruePeak}) clip=${r.clipped}`
      )
      .join("\n")
  );
  console.log("SR:", srChecks.map((c) => `${c.label}:${c.observedHz}${c.ok ? " ok" : " FAIL"}`).join(" "));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
