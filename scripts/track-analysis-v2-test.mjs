/**
 * TrackAnalysisV2 tests — deterministic FFmpeg fixtures + pure-logic checks.
 *
 * Run: node --import ./scripts/lib/register-ts-alias.mjs scripts/track-analysis-v2-test.mjs
 *
 * No OpenAI, Stripe, Supabase, network, or production credentials required.
 * Assertions check ranges and relationships, not brittle exact float values.
 */
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, readdirSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import ffmpegStatic from "ffmpeg-static";

import {
  analyzeTrackV2,
  compareTrackAnalysesV2,
  buildTrackAnalysisV2Summary,
  buildDerivedMetrics,
  deriveDiagnosticFlags,
  metricValue,
  V2_THRESHOLDS,
  V2_STDERR_MAX_KEPT_BYTES,
  __boundStderrForTest
} from "@/lib/audio/track-analysis-v2";
import { analyzeTrackWithV2 } from "@/lib/audio/analyze-track-combined";

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const FFMPEG = typeof ffmpegStatic === "string" ? ffmpegStatic : process.env.FFMPEG_BIN?.trim() || null;
assert.ok(FFMPEG, "ffmpeg-static or FFMPEG_BIN required for fixture generation");

function ff(args) {
  const result = spawnSync(FFMPEG, args, { encoding: "utf8" });
  assert.equal(result.status, 0, `ffmpeg failed: ${result.stderr?.slice(-600)}`);
}

const workDir = mkdtempSync(path.join(tmpdir(), "ta2-test-"));
const fx = (name) => path.join(workDir, name);

// --- Fixture generators (deterministic lavfi sources) -----------------------

function genLoudCompressed(out) {
  // Near-full-scale sine -> loud, sine crest is intrinsically low (compressed).
  ff(["-y", "-hide_banner", "-f", "lavfi", "-i", "sine=frequency=220:duration=4",
    "-af", "volume=-1dB", "-c:a", "pcm_s16le", "-ar", "44100", "-ac", "2", out]);
}

function genQuietDynamic(out) {
  // Loud then quiet segment -> low integrated loudness, large loudness range.
  const loud = fx("qd-loud.wav");
  const quiet = fx("qd-quiet.wav");
  ff(["-y", "-hide_banner", "-f", "lavfi", "-i", "sine=frequency=220:duration=1.5",
    "-af", "volume=-6dB", "-c:a", "pcm_s16le", "-ar", "44100", "-ac", "2", loud]);
  ff(["-y", "-hide_banner", "-f", "lavfi", "-i", "sine=frequency=220:duration=3",
    "-af", "volume=-34dB", "-c:a", "pcm_s16le", "-ar", "44100", "-ac", "2", quiet]);
  ff(["-y", "-hide_banner", "-i", loud, "-i", quiet,
    "-filter_complex", "[0:a][1:a]concat=n=2:v=0:a=1[out]", "-map", "[out]",
    "-c:a", "pcm_s16le", "-ar", "44100", "-ac", "2", out]);
}

function genBassHeavy(out) {
  ff(["-y", "-hide_banner", "-f", "lavfi", "-i", "sine=frequency=60:duration=4",
    "-f", "lavfi", "-i", "sine=frequency=3000:duration=4",
    "-filter_complex",
    "[0:a]volume=0dB[a];[1:a]volume=-26dB[b];[a][b]amix=inputs=2:normalize=0,aformat=channel_layouts=stereo[out]",
    "-map", "[out]", "-c:a", "pcm_s16le", "-ar", "44100", out]);
}

function genBrightHarsh(out) {
  ff(["-y", "-hide_banner", "-f", "lavfi", "-i", "sine=frequency=60:duration=4",
    "-f", "lavfi", "-i", "sine=frequency=5000:duration=4",
    "-filter_complex",
    "[0:a]volume=-26dB[a];[1:a]volume=0dB[b];[a][b]amix=inputs=2:normalize=0,aformat=channel_layouts=stereo[out]",
    "-map", "[out]", "-c:a", "pcm_s16le", "-ar", "44100", out]);
}

function genMono(out) {
  ff(["-y", "-hide_banner", "-f", "lavfi", "-i", "sine=frequency=440:duration=3",
    "-af", "volume=-10dB", "-c:a", "pcm_s16le", "-ar", "44100", "-ac", "1", out]);
}

function genWideStereo(out) {
  // Different tone in each channel -> uncorrelated -> correlation ~0, wide.
  ff(["-y", "-hide_banner", "-f", "lavfi", "-i", "sine=frequency=330:duration=3",
    "-f", "lavfi", "-i", "sine=frequency=770:duration=3",
    "-filter_complex", "[0:a][1:a]join=inputs=2:channel_layout=stereo[out]", "-map", "[out]",
    "-c:a", "pcm_s16le", "-ar", "44100", out]);
}

function genClipped(out) {
  // Huge gain into a fixed-point container clips to full scale.
  ff(["-y", "-hide_banner", "-f", "lavfi", "-i", "sine=frequency=220:duration=3",
    "-af", "volume=40dB", "-c:a", "pcm_s16le", "-ar", "44100", "-ac", "2", out]);
}

function genLeadingSilence(out) {
  const silence = fx("ls-silence.wav");
  const tone = fx("ls-tone.wav");
  ff(["-y", "-hide_banner", "-f", "lavfi", "-i", "anullsrc=r=44100:cl=stereo", "-t", "2",
    "-c:a", "pcm_s16le", silence]);
  ff(["-y", "-hide_banner", "-f", "lavfi", "-i", "sine=frequency=220:duration=3",
    "-af", "volume=-6dB", "-c:a", "pcm_s16le", "-ar", "44100", "-ac", "2", tone]);
  ff(["-y", "-hide_banner", "-i", silence, "-i", tone,
    "-filter_complex", "[0:a][1:a]concat=n=2:v=0:a=1[out]", "-map", "[out]",
    "-c:a", "pcm_s16le", "-ar", "44100", "-ac", "2", out]);
}

// --- Tests ------------------------------------------------------------------

async function run() {
  const results = [];
  const time = async (label, fn) => {
    const t0 = Date.now();
    const value = await fn();
    results.push({ label, ms: Date.now() - t0 });
    return value;
  };

  // Generate fixtures.
  const loudPath = fx("loud.wav");
  const quietPath = fx("quiet.wav");
  const bassPath = fx("bass.wav");
  const brightPath = fx("bright.wav");
  const monoPath = fx("mono.wav");
  const widePath = fx("wide.wav");
  const clippedPath = fx("clipped.wav");
  const silencePath = fx("leading-silence.wav");

  genLoudCompressed(loudPath);
  genQuietDynamic(quietPath);
  genBassHeavy(bassPath);
  genBrightHarsh(brightPath);
  genMono(monoPath);
  genWideStereo(widePath);
  genClipped(clippedPath);
  genLeadingSilence(silencePath);

  const loud = await time("loud", () => analyzeTrackV2(loudPath));
  const quiet = await time("quiet", () => analyzeTrackV2(quietPath));
  const bass = await time("bass", () => analyzeTrackV2(bassPath));
  const bright = await time("bright", () => analyzeTrackV2(brightPath));
  const mono = await time("mono", () => analyzeTrackV2(monoPath));
  const wide = await time("wide", () => analyzeTrackV2(widePath));
  const clipped = await time("clipped", () => analyzeTrackV2(clippedPath));
  const silence = await time("leadingSilence", () => analyzeTrackV2(silencePath));

  // 1) Loud vs quiet dynamic relationships.
  const loudLufs = metricValue(loud.measured.loudness.integratedLufs);
  const quietLufs = metricValue(quiet.measured.loudness.integratedLufs);
  assert.ok(loudLufs !== null && quietLufs !== null, "loudness measured for loud/quiet");
  assert.ok(loudLufs > quietLufs, `loud (${loudLufs}) should be louder than quiet (${quietLufs})`);
  const loudLra = metricValue(loud.measured.loudness.loudnessRangeLu);
  const quietLra = metricValue(quiet.measured.loudness.loudnessRangeLu);
  assert.ok(quietLra >= loudLra, `dynamic track LRA (${quietLra}) >= loud LRA (${loudLra})`);
  const loudComp = metricValue(loud.derived.compressionProxy);
  const quietComp = metricValue(quiet.derived.compressionProxy);
  assert.ok(loudComp >= quietComp, `loud compressionProxy (${loudComp}) >= quiet (${quietComp})`);
  console.log("test loud/quiet dynamics: ok", { loudLufs, quietLufs, loudLra, quietLra });

  // 2) Clipping detection.
  assert.equal(clipped.flags.clipping_risk, true, "clipped track flags clipping_risk");
  assert.ok(metricValue(clipped.measured.peaks.samplePeakDb) > -0.5, "clipped sample peak near 0 dBFS");
  console.log("test clipping: ok", { samplePeak: metricValue(clipped.measured.peaks.samplePeakDb) });

  // 3) Tonal balance: bass-heavy vs bright.
  const bassDom = metricValue(bass.derived.lowEndDominanceDb);
  const brightDom = metricValue(bright.derived.lowEndDominanceDb);
  assert.ok(bassDom > brightDom, `bass lowEndDominance (${bassDom}) > bright (${brightDom})`);
  const bassCentroid = metricValue(bass.derived.spectralCentroidHz);
  const brightCentroid = metricValue(bright.derived.spectralCentroidHz);
  assert.ok(brightCentroid > bassCentroid, `bright centroid (${brightCentroid}) > bass (${bassCentroid})`);
  assert.equal(bass.flags.low_end_excess, true, "bass-heavy flags low_end_excess");
  assert.equal(bright.flags.low_end_excess, false, "bright track not low_end_excess");
  console.log("test tonal balance: ok", { bassDom, brightDom, bassCentroid, brightCentroid });

  // 4) Mono handling + unavailable stereo metrics + subprocess count.
  assert.equal(mono.meta.analyzedStereo, false, "mono not analyzed as stereo");
  assert.equal(mono.meta.subprocessCount, 3, "mono uses 3 subprocesses");
  assert.equal(mono.measured.integrity.channelMode.value, "mono", "mono channel mode");
  assert.equal(mono.measured.stereo.midRmsDb.value, null, "mono stereo mid unavailable value");
  assert.equal(mono.measured.stereo.midRmsDb.confidence, "unavailable", "mono stereo mid unavailable confidence");
  assert.equal(mono.derived.stereoCorrelation.value, null, "mono correlation unavailable");
  console.log("test mono/unavailable: ok", { subprocessCount: mono.meta.subprocessCount });

  // 5) Wide stereo.
  assert.equal(wide.meta.analyzedStereo, true, "wide analyzed as stereo");
  assert.equal(wide.meta.subprocessCount, 4, "stereo uses 4 subprocesses");
  const wideCorr = metricValue(wide.derived.stereoCorrelation);
  assert.ok(wideCorr !== null && Math.abs(wideCorr) < 0.5, `uncorrelated stereo correlation ~0 (got ${wideCorr})`);
  assert.ok(metricValue(wide.derived.stereoWidthRatio) > 0.5, "wide stereo has substantial width ratio");
  console.log("test wide stereo: ok", { wideCorr, width: metricValue(wide.derived.stereoWidthRatio) });

  // 6) Leading silence.
  const lead = metricValue(silence.measured.integrity.leadingSilenceSec);
  assert.ok(lead > 1, `leading silence detected (${lead}s)`);
  assert.equal(silence.flags.excessive_leading_silence, true, "leading silence flag set");
  console.log("test leading silence: ok", { lead });

  // 7) Reference comparison deltas (bass = source, bright = reference).
  const cmp = compareTrackAnalysesV2(bass, bright);
  assert.ok(typeof cmp.integratedLufsDelta === "number", "lufs delta present");
  assert.ok(cmp.spectralBandDeltasDb.bass > 0, "source has more bass than reference");
  assert.ok(cmp.spectralBandDeltasDb.presence < 0, "source has less presence than reference");
  assert.ok(cmp.spectralCentroidHzDelta < 0, "source centroid lower than reference");
  console.log("test comparison deltas: ok", {
    lufs: cmp.integratedLufsDelta,
    bassDelta: cmp.spectralBandDeltasDb.bass,
    presenceDelta: cmp.spectralBandDeltasDb.presence
  });

  // 8) Comparison with unavailable side -> null deltas (mono has no stereo metrics).
  const cmpMono = compareTrackAnalysesV2(mono, wide);
  assert.equal(cmpMono.stereoCorrelationDelta, null, "correlation delta null when one side unavailable");
  assert.equal(cmpMono.stereoWidthRatioDelta, null, "width delta null when one side unavailable");
  assert.ok(typeof cmpMono.integratedLufsDelta === "number", "lufs delta still computed");
  console.log("test unavailable-side comparison: ok");

  // 9) Summary projection is compact and safe.
  const summary = buildTrackAnalysisV2Summary(bass);
  assert.equal(summary.schemaVersion, 2, "summary schema version");
  assert.ok(Array.isArray(summary.activeFlags), "summary active flags array");
  assert.ok(summary.activeFlags.includes("low_end_excess"), "summary surfaces active flag");
  const summaryKeys = Object.keys(summary).length;
  assert.ok(summaryKeys <= 20, `summary stays compact (${summaryKeys} keys)`);
  console.log("test summary projection: ok", { keys: summaryKeys, activeFlags: summary.activeFlags });

  // 10) Pure-logic: fully unavailable measurements -> unavailable derived + false flags.
  const emptyMetric = (unit) => ({ value: null, confidence: "unavailable", source: "unavailable", unit });
  const emptyMeasured = {
    loudness: {
      integratedLufs: emptyMetric("LUFS"), loudnessRangeLu: emptyMetric("LU"),
      shortTermMaxLufs: emptyMetric("LUFS"), momentaryMaxLufs: emptyMetric("LUFS"), shortTermRangeLu: emptyMetric("LU")
    },
    peaks: { samplePeakDb: emptyMetric("dBFS"), truePeakDb: emptyMetric("dBTP") },
    dynamics: {
      crestFactorDb: emptyMetric("dB"), rmsLevelDb: emptyMetric("dB"), rmsPeakDb: emptyMetric("dB"),
      rmsTroughDb: emptyMetric("dB"), dynamicRangeDb: emptyMetric("dB"), flatFactor: emptyMetric("ratio"),
      zeroCrossingRate: emptyMetric("ratio")
    },
    spectrumBands: {
      subBassDb: emptyMetric("dB"), bassDb: emptyMetric("dB"), lowMidDb: emptyMetric("dB"), midDb: emptyMetric("dB"),
      upperMidDb: emptyMetric("dB"), presenceDb: emptyMetric("dB"), brillianceDb: emptyMetric("dB")
    },
    stereo: {
      midRmsDb: emptyMetric("dB"), sideRmsDb: emptyMetric("dB"),
      lowMidRmsDb: emptyMetric("dB"), lowSideRmsDb: emptyMetric("dB")
    },
    integrity: {
      durationSec: emptyMetric("s"), sampleRateHz: emptyMetric("Hz"), bitDepth: emptyMetric("bits"),
      codec: emptyMetric("codec"), channelCount: emptyMetric("count"), channelMode: emptyMetric("mode"),
      dcOffset: emptyMetric("fraction"), leftRmsDb: emptyMetric("dB"), rightRmsDb: emptyMetric("dB"),
      clippingSampleCount: emptyMetric("samples"), leadingSilenceSec: emptyMetric("s")
    }
  };
  const emptyDerived = buildDerivedMetrics(emptyMeasured, false);
  assert.equal(emptyDerived.peakToLoudnessRatioDb.value, null, "no PLR without peaks/loudness");
  assert.equal(emptyDerived.spectralCentroidHz.value, null, "no centroid without bands");
  const emptyFlags = deriveDiagnosticFlags(emptyMeasured, emptyDerived, false);
  assert.equal(Object.values(emptyFlags).every((v) => v === false), true, "no flags fire on unavailable data");
  console.log("test pure unavailable-data handling: ok");

  // 11) Thresholds are centralized constants (documented, testable).
  assert.equal(typeof V2_THRESHOLDS.clippingTruePeakDb, "number", "thresholds exported");
  assert.ok(V2_THRESHOLDS.overlyCompressedCrestDb > 0, "crest threshold sane");

  // 12) Bounded concurrency: peak concurrent subprocesses stays small.
  assert.ok(
    wide.meta.maxConcurrentSubprocesses >= 1 && wide.meta.maxConcurrentSubprocesses <= 2,
    `stereo peak concurrency bounded to <=2 (got ${wide.meta.maxConcurrentSubprocesses})`
  );
  assert.ok(
    mono.meta.maxConcurrentSubprocesses >= 1 && mono.meta.maxConcurrentSubprocesses <= 2,
    `mono peak concurrency bounded to <=2 (got ${mono.meta.maxConcurrentSubprocesses})`
  );
  assert.ok(
    typeof wide.meta.maxStderrBytesKept === "number" && wide.meta.maxStderrBytesKept <= V2_STDERR_MAX_KEPT_BYTES,
    `retained stderr within hard bound (got ${wide.meta.maxStderrBytesKept})`
  );
  console.log("test bounded concurrency: ok", {
    stereoMaxConcurrent: wide.meta.maxConcurrentSubprocesses,
    monoMaxConcurrent: mono.meta.maxConcurrentSubprocesses,
    maxStderrKept: wide.meta.maxStderrBytesKept
  });

  // 13) Bounded stderr collector: frame lines are parsed then discarded, banner
  //     (head) + summary (tail) survive, and per-frame loudness is aggregated.
  {
    const banner =
      "  Duration: 00:03:00.00, start: 0.000000, bitrate: 1411 kb/s\n" +
      "  Stream #0:0: Audio: pcm_s16le, 44100 Hz, stereo, s16, 1411 kb/s\n";
    const frameChunks = [];
    for (let i = 0; i < 4000; i += 1) {
      const m = i === 2000 ? -8 : -20 - (i % 5);
      const s = i === 2000 ? -9 : -21 - (i % 7);
      frameChunks.push(`[Parsed_ebur128_0 @ 0x1] t: ${(i * 0.1).toFixed(1)} M: ${m}.0 S: ${s}.0 I: -14.0 LUFS LRA: 5.0 LU\r`);
    }
    const summary =
      "\n[Parsed_ebur128_0 @ 0x1] Summary:\n\n  Integrated loudness:\n    I:         -14.0 LUFS\n" +
      "  Sample peak:\n    Peak:       -1.0 dBFS\n  True peak:\n    Peak:       -0.8 dBTP\n";
    const collected = __boundStderrForTest([banner, frameChunks.join(""), summary]);
    assert.ok(collected.bytesTotal > 100_000, "collector saw the full (large) raw stream");
    assert.ok(collected.bytesKept < 8_000, `frame lines discarded — kept stays tiny (got ${collected.bytesKept})`);
    assert.ok(collected.bytesKept <= V2_STDERR_MAX_KEPT_BYTES, "kept within hard bound");
    assert.ok(collected.stderr.includes("Duration: 00:03:00.00"), "banner (head) preserved");
    assert.ok(collected.stderr.includes("True peak"), "summary (tail) preserved");
    assert.equal(collected.frames.momentaryMax, -8, "incremental momentary max parsed");
    assert.equal(collected.frames.shortTermMax, -9, "incremental short-term max parsed");
    assert.ok(collected.frames.shortTermRange !== null && collected.frames.shortTermRange >= 0, "short-term range parsed");
    console.log("test bounded stderr (frame stripping): ok", {
      total: collected.bytesTotal,
      kept: collected.bytesKept,
      frames: collected.frames
    });
  }

  // 14) Bounded stderr collector: strict maximum byte count under non-frame flood.
  {
    const lines = [];
    for (let i = 0; i < 5000; i += 1) lines.push(`noise-${String(i).padStart(6, "0")} diagnostic filler line payload\n`);
    const collected = __boundStderrForTest([lines.join("")], { maxKeptBytes: 2048, headBytes: 512 });
    assert.equal(collected.truncated, true, "flood triggers truncation");
    assert.ok(collected.bytesKept <= 2048 + 200, `kept respects strict cap + marker (got ${collected.bytesKept})`);
    assert.ok(collected.stderr.includes("noise-000000"), "head (earliest diagnostics) preserved");
    assert.ok(collected.stderr.includes("noise-004999"), "tail (latest diagnostics) preserved");
    assert.ok(collected.stderr.includes("truncated"), "truncation is annotated, not silent");
    console.log("test bounded stderr (hard cap): ok", { kept: collected.bytesKept, dropped: collected.bytesDropped });
  }

  // 15) Subprocess timeout cleanup: an aggressive per-pass timeout kills children,
  //     resolves without hanging, marks metrics unavailable, and fires no flags.
  {
    const t0 = Date.now();
    const timedOut = await analyzeTrackV2(widePath, { timeoutMsPerPass: 1 });
    const elapsed = Date.now() - t0;
    assert.ok(elapsed < 15_000, `timed-out analysis resolves promptly (${elapsed}ms, no hang)`);
    assert.ok(timedOut.meta.notes.some((n) => /timed out/i.test(n)), "timeout recorded in notes");
    assert.equal(metricValue(timedOut.measured.loudness.integratedLufs), null, "loudness unavailable after timeout");
    assert.equal(
      Object.values(timedOut.flags).every((v) => v === false),
      true,
      "no diagnostic flags fire when all passes time out"
    );
    console.log("test subprocess timeout cleanup: ok", { elapsed, notes: timedOut.meta.notes.length });
  }

  // 16) Orchestration: existing (V1) analysis succeeds even when V2 throws
  //     (fail-open). V2 must be opted into explicitly (enableV2: true).
  {
    const combined = await analyzeTrackWithV2(loudPath, {
      enableV2: true,
      analyzeV2Summary: async () => {
        throw new Error("simulated V2 failure");
      }
    });
    assert.ok(combined.analysis && typeof combined.analysis === "object", "existing analysis present when V2 fails");
    assert.equal(combined.analysisV2, undefined, "analysisV2 omitted cleanly when V2 fails");
    console.log("test V1-succeeds-when-V2-fails: ok");
  }

  // 17) Orchestration: V2 overall timeout does not fail/omit existing analysis.
  {
    let onErrorCalled = false;
    const combined = await analyzeTrackWithV2(loudPath, {
      enableV2: true,
      v2OverallTimeoutMs: 1,
      onV2Error: () => {
        onErrorCalled = true;
      },
      analyzeV2Summary: async () => {
        await sleep(300);
        return { schemaVersion: 2, activeFlags: [] };
      }
    });
    assert.ok(combined.analysis && typeof combined.analysis === "object", "existing analysis present after V2 timeout");
    assert.equal(combined.analysisV2, undefined, "analysisV2 omitted after V2 timeout");
    assert.equal(onErrorCalled, false, "timeout path does not report an error (fail-open, not an exception)");
    console.log("test V2-timeout-does-not-fail-existing: ok");
  }

  // 18) Orchestration default is FAIL-SAFE: with no options, V2 does NOT run
  //     against a real upload — only the required existing analysis executes and
  //     the response is byte-for-byte the existing shape (no analysisV2).
  {
    const combined = await analyzeTrackWithV2(loudPath);
    assert.ok(
      combined.analysis && typeof combined.analysis.integratedLufs !== "undefined",
      "existing analysis fields present by default"
    );
    assert.equal(combined.analysisV2, undefined, "analysisV2 omitted by default (no accidental V2 run)");
    assert.deepEqual(Object.keys(combined), ["analysis"], "default response is only { analysis }");
    console.log("test default fail-safe (no V2 run): ok");
  }

  // 19) Orchestration: real concurrent run surfaces both, additively — but only
  //     when V2 is explicitly enabled (enableV2: true).
  {
    const combined = await analyzeTrackWithV2(loudPath, { enableV2: true });
    assert.ok(combined.analysis && typeof combined.analysis.integratedLufs !== "undefined", "existing analysis fields present");
    assert.ok(combined.analysisV2 && combined.analysisV2.schemaVersion === 2, "analysisV2 additively present");
    // Response summary must remain bounded and free of raw ffmpeg output/paths.
    const serialized = JSON.stringify(combined.analysisV2);
    assert.ok(serialized.length < 4_000, `analysisV2 payload stays compact (${serialized.length} bytes)`);
    assert.ok(!/ffmpeg|stderr|Parsed_|[A-Za-z]:\\|\/tmp\//.test(serialized), "no raw ffmpeg output / paths in response");
    console.log("test combined concurrent run (opt-in): ok", { payloadBytes: serialized.length });
  }

  // 20) No client bundle imports Node-only V2 / analysis code.
  {
    const nodeOnly = [
      "@/lib/audio/track-analysis-v2",
      "@/lib/audio/analyze-track",
      "@/lib/audio/analyze-track-combined"
    ];
    const scanDirs = ["app", "components", "src"];
    const offenders = [];
    const walk = (dir) => {
      let entries;
      try {
        entries = readdirSync(dir, { withFileTypes: true });
      } catch {
        return;
      }
      for (const entry of entries) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          if (entry.name === "node_modules" || entry.name === ".next") continue;
          walk(full);
          continue;
        }
        if (!/\.(tsx?|jsx?|mjs)$/.test(entry.name)) continue;
        const src = readFileSync(full, "utf8");
        const isClient = /^\s*["']use client["']/m.test(src);
        // API route handlers are server-only even without a directive; skip them.
        const isApiRoute = full.replace(/\\/g, "/").includes("/api/");
        if (!isClient || isApiRoute) continue;
        for (const mod of nodeOnly) {
          const importRe = new RegExp(`from\\s+["']${mod.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}["']`);
          if (importRe.test(src)) offenders.push(`${full} -> ${mod}`);
        }
      }
    };
    for (const d of scanDirs) walk(path.join(REPO_ROOT, d));
    assert.equal(offenders.length, 0, `client bundles must not import Node-only analysis code:\n${offenders.join("\n")}`);
    console.log("test no-client-import-of-node-only: ok");
  }

  // Performance report.
  const totalMs = results.reduce((a, r) => a + r.ms, 0);
  console.log("\nPerformance (analyzeTrackV2):");
  for (const r of results) console.log(`  ${r.label.padEnd(16)} ${r.ms} ms`);
  console.log(`  ${"TOTAL".padEnd(16)} ${totalMs} ms across ${results.length} tracks`);
  console.log(`  subprocess counts: mono=${mono.meta.subprocessCount}, stereo=${wide.meta.subprocessCount}`);

  console.log("\ntrack-analysis-v2-test: ok");
}

run()
  .catch((err) => {
    console.error("track-analysis-v2-test FAILED:", err);
    process.exitCode = 1;
  })
  .finally(() => {
    rmSync(workDir, { recursive: true, force: true });
  });
