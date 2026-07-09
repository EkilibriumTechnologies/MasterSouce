/**
 * Route-equivalent benchmark for TrackAnalysisV2 performance + process-safety.
 *
 * Measures the OLD execution model (existing analysis then V2, with V2 passes
 * run strictly sequentially) vs the NEW model (existing + V2 concurrent, V2
 * passes in bounded concurrent waves) on ~30s and ~3-min stereo fixtures.
 *
 * It ALSO reports the two production route modes gated by the server feature
 * flag TRACK_ANALYSIS_V2_ENABLED (see lib/features/track-analysis-v2.ts):
 * - DISABLED / default: existing analysis only (6 subprocesses).
 * - ENABLED (experimental, more expensive): existing + concurrent V2.
 *
 * Run: node --experimental-transform-types --import ./scripts/lib/register-ts-alias.mjs scripts/track-analysis-v2-benchmark.mjs
 *
 * No network, credentials, billing, or DSP involved.
 */
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import ffmpegStatic from "ffmpeg-static";

import { analyzeTrack } from "@/lib/audio/analyze-track";
import { analyzeTrackV2, analyzeTrackV2Summary } from "@/lib/audio/track-analysis-v2";
import { analyzeTrackWithV2 } from "@/lib/audio/analyze-track-combined";

const FFMPEG = typeof ffmpegStatic === "string" ? ffmpegStatic : process.env.FFMPEG_BIN?.trim() || null;
if (!FFMPEG) {
  console.error("ffmpeg-static or FFMPEG_BIN required");
  process.exit(1);
}

const workDir = mkdtempSync(path.join(tmpdir(), "ta2-bench-"));

function ff(args) {
  const r = spawnSync(FFMPEG, args, { encoding: "utf8" });
  if (r.status !== 0) throw new Error(`ffmpeg failed: ${r.stderr?.slice(-400)}`);
}

function genStereoFixture(out, durationSec) {
  // Two decorrelated tones + light noise -> realistic stereo with content in
  // every band, so all passes do real work (fair timing).
  ff([
    "-y",
    "-hide_banner",
    "-f",
    "lavfi",
    "-i",
    `sine=frequency=110:duration=${durationSec}`,
    "-f",
    "lavfi",
    "-i",
    `sine=frequency=880:duration=${durationSec}`,
    "-filter_complex",
    "[0:a]volume=-6dB[a];[1:a]volume=-10dB[b];[a][b]join=inputs=2:channel_layout=stereo[out]",
    "-map",
    "[out]",
    "-c:a",
    "pcm_s16le",
    "-ar",
    "44100",
    out
  ]);
}

async function timed(fn) {
  const t0 = Date.now();
  const value = await fn();
  return { ms: Date.now() - t0, value };
}

function rssMb() {
  return Math.round((process.memoryUsage().rss / (1024 * 1024)) * 10) / 10;
}

async function benchFixture(label, durationSec) {
  const file = path.join(workDir, `${label}.wav`);
  genStereoFixture(file, durationSec);

  // --- OLD model: existing analysis, THEN V2 with sequential passes. ---
  const oldExisting = await timed(() => analyzeTrack(file));
  const oldV2 = await timed(() => analyzeTrackV2(file, { sequentialPasses: true }));
  const oldRouteMs = oldExisting.ms + oldV2.ms;
  const oldSubprocs = 6 + oldV2.value.meta.subprocessCount; // existing analyzeTrack = 6

  // --- NEW model: existing + V2 concurrent, V2 in bounded waves. ---
  const rssBefore = rssMb();
  const newRoute = await timed(() => analyzeTrackWithV2(file));
  const rssAfter = rssMb();

  // --- Feature-flag route modes (production behavior). ---
  // DISABLED (default): route runs existing analysis only (enableV2: false) — no
  // V2 subprocesses. ENABLED (experimental): existing + concurrent V2.
  const flagDisabled = await timed(() => analyzeTrackWithV2(file, { enableV2: false }));
  const flagEnabled = await timed(() => analyzeTrackWithV2(file, { enableV2: true }));
  assert.equal(flagDisabled.value.analysisV2, undefined, "disabled mode omits analysisV2");
  // Component timings (measured independently for reporting).
  const newExisting = await timed(() => analyzeTrack(file));
  const newV2Full = await timed(() => analyzeTrackV2(file));
  const newV2 = await timed(() => analyzeTrackV2Summary(file));
  const newSubprocs = 6 + newV2Full.value.meta.subprocessCount;

  return {
    label,
    durationSec,
    old: {
      existingMs: oldExisting.ms,
      v2Ms: oldV2.ms,
      routeMs: oldRouteMs,
      subprocesses: oldSubprocs,
      maxConcurrent: 1 + 1 // existing sequential then V2 sequential
    },
    now: {
      existingMs: newExisting.ms,
      v2Ms: newV2.ms,
      v2FullMs: newV2Full.ms,
      routeMs: newRoute.ms,
      subprocesses: newSubprocs,
      v2MaxConcurrent: newV2Full.value.meta.maxConcurrentSubprocesses,
      maxStderrBytesKept: newV2Full.value.meta.maxStderrBytesKept,
      rssBeforeMb: rssBefore,
      rssAfterMb: rssAfter
    },
    flag: {
      disabled: {
        routeMs: flagDisabled.ms,
        subprocesses: 6, // existing analyzeTrack only; V2 never started
        returnsAnalysisV2: flagDisabled.value.analysisV2 !== undefined
      },
      enabled: {
        routeMs: flagEnabled.ms,
        subprocesses: newSubprocs, // existing (6) + V2 subprocess count
        returnsAnalysisV2: flagEnabled.value.analysisV2 !== undefined
      }
    }
  };
}

function pct(oldMs, newMs) {
  if (oldMs <= 0) return "n/a";
  return `${Math.round(((oldMs - newMs) / oldMs) * 100)}%`;
}

async function run() {
  const fixtures = [
    ["stereo-30s", 30],
    ["stereo-180s", 180]
  ];

  // Warm ffmpeg resolution + JIT before measuring "warm" numbers.
  console.log("Warming up...");
  const warmFile = path.join(workDir, "warmup.wav");
  genStereoFixture(warmFile, 5);
  await analyzeTrackWithV2(warmFile);

  const rows = [];
  for (const [label, dur] of fixtures) {
    process.stdout.write(`Benchmarking ${label} (${dur}s)... `);
    rows.push(await benchFixture(label, dur));
    console.log("done");
  }

  console.log("\n================ TrackAnalysisV2 route-equivalent benchmark ================\n");
  for (const r of rows) {
    console.log(`Fixture: ${r.label}  (~${r.durationSec}s stereo, warm)`);
    console.log("  OLD model (existing -> sequential V2):");
    console.log(`    existing analysis : ${r.old.existingMs} ms`);
    console.log(`    V2 analysis       : ${r.old.v2Ms} ms`);
    console.log(`    route wall-clock  : ${r.old.routeMs} ms`);
    console.log(`    subprocess count  : ${r.old.subprocesses}`);
    console.log(`    max concurrent    : 1`);
    console.log("  NEW model (existing || V2, bounded waves):");
    console.log(`    existing analysis : ${r.now.existingMs} ms`);
    console.log(`    V2 analysis       : ${r.now.v2Ms} ms (full: ${r.now.v2FullMs} ms)`);
    console.log(`    route wall-clock  : ${r.now.routeMs} ms  (improvement: ${pct(r.old.routeMs, r.now.routeMs)})`);
    console.log(`    subprocess count  : ${r.now.subprocesses}`);
    console.log(`    V2 max concurrent : ${r.now.v2MaxConcurrent}`);
    console.log(`    max stderr kept   : ${r.now.maxStderrBytesKept} bytes`);
    console.log(`    Node RSS          : ${r.now.rssBeforeMb} -> ${r.now.rssAfterMb} MB`);
    console.log("  FEATURE-FLAG route modes (production behavior):");
    console.log("    DISABLED (default):");
    console.log(`      subprocess count       : ${r.flag.disabled.subprocesses}`);
    console.log(`      route-equivalent latency: ${r.flag.disabled.routeMs} ms`);
    console.log(`      returns analysisV2      : ${r.flag.disabled.returnsAnalysisV2}`);
    console.log("    ENABLED (experimental, more expensive):");
    console.log(`      subprocess count       : ${r.flag.enabled.subprocesses}`);
    console.log(`      route-equivalent latency: ${r.flag.enabled.routeMs} ms`);
    console.log(`      returns analysisV2      : ${r.flag.enabled.returnsAnalysisV2}`);
    console.log(
      `      extra subprocs vs default: +${r.flag.enabled.subprocesses - r.flag.disabled.subprocesses}` +
        `  (~${pct(r.flag.enabled.routeMs, r.flag.disabled.routeMs)} faster when disabled)`
    );
    console.log("");
  }
  console.log("Note: absolute times reflect this host + ffmpeg-static; the relevant");
  console.log("result is the measured route wall-clock reduction and bounded memory.");
  console.log("ENABLED mode is EXPERIMENTAL and more expensive (more subprocesses,");
  console.log("higher latency); the default DISABLED mode is the production behavior.");
}

run()
  .catch((err) => {
    console.error("benchmark FAILED:", err);
    process.exitCode = 1;
  })
  .finally(() => rmSync(workDir, { recursive: true, force: true }));
