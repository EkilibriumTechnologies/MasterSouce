/**
 * Final listening validation: commercial-quality real tracks ×
 * Original → Previous preset → Calibrated preset.
 *
 * Local only. Does not commit/push. Does not modify lib/ unless VARIANT swap
 * is requested via LISTENING_VARIANT=previous|calibrated (caller restores).
 *
 * Usage:
 *   node --experimental-transform-types --import ./scripts/lib/register-ts-alias.mjs scripts/preset-listening-validation.mjs
 *
 * Env:
 *   LISTENING_VARIANT=calibrated|previous|final  (default calibrated) — output folder / report name
 *   LISTENING_MODE=balanced|clean|loud     (default balanced)
 *   LISTENING_SKIP_MASTER=1                — analyze existing masters only
 *   LISTENING_OUTPUT_QUALITY=24bit|32bit_float  (default 24bit; use 32bit_float for owner WAV check)
 */
import { spawnSync } from "node:child_process";
import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { getFfmpegExecutablePath } from "@/lib/audio/ffmpeg-bin";
import { runMasteringPipeline } from "@/lib/audio/mastering-pipeline";
import { analyzeTrackV2, compareTrackAnalysesV2 } from "@/lib/audio/track-analysis-v2";
import { GENRE_PRESETS, getLoudnessModeLufsTarget, getLoudnessModeTruePeak } from "@/lib/genre-presets";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, "..");
const OUT_DIR = path.join(REPO_ROOT, "tmp", "listening-validation");
const VARIANT = (process.env.LISTENING_VARIANT || "calibrated").toLowerCase();
const MODE = (process.env.LISTENING_MODE || "balanced").toLowerCase();
const SKIP_MASTER = process.env.LISTENING_SKIP_MASTER === "1";
const OUTPUT_QUALITY = (process.env.LISTENING_OUTPUT_QUALITY || "24bit").toLowerCase();
const EXCERPT_SEC = 48;
const EXCERPT_START_FRAC = 0.28;

/** Commercial-quality source mixes mapped to genre presets. */
const TRACKS = [
  {
    genre: "pop",
    label: "Everybody Else (Edit)",
    source: path.join("C:", "Users", "LHernaiz", "Downloads", "Everybody Else (Edit).wav")
  },
  {
    genre: "rock",
    label: "Adrenaline Saints",
    source: path.join("C:", "Users", "LHernaiz", "Downloads", "Adrenaline Saints.wav")
  },
  {
    genre: "hiphop",
    label: "Smoke",
    source: path.join("C:", "Users", "LHernaiz", "Downloads", "Smoke.wav")
  },
  {
    genre: "edm",
    label: "Merkaba Center Earth",
    source: path.join("C:", "Users", "LHernaiz", "Downloads", "Merkaba Center Earth.wav")
  },
  {
    genre: "reggaeton",
    label: "Vamo Alla",
    source: path.join("C:", "Users", "LHernaiz", "Downloads", "Vamo Alla.wav")
  },
  {
    genre: "rnb",
    label: "Bartender",
    source: path.join("C:", "Users", "LHernaiz", "Downloads", "Bartender.wav")
  },
  {
    genre: "lofi",
    label: "Sheets of empty canvas",
    source: path.join(
      "C:",
      "Users",
      "LHernaiz",
      "Downloads",
      "Sheets of empty canvas, untouched sheets.mp3"
    )
  }
];

function ff(args) {
  const bin = getFfmpegExecutablePath();
  const r = spawnSync(bin, args, { encoding: "utf8", maxBuffer: 32 * 1024 * 1024 });
  if (r.status !== 0) {
    throw new Error(`ffmpeg failed (${r.status}): ${(r.stderr || "").slice(-1500)}`);
  }
  return r.stderr || "";
}

function ffprobeDuration(filePath) {
  const bin = getFfmpegExecutablePath().replace(/ffmpeg(\.exe)?$/i, (_, ext) => `ffprobe${ext || ""}`);
  const probeBin = spawnSync("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", filePath], {
    encoding: "utf8"
  });
  if (probeBin.status === 0 && probeBin.stdout.trim()) {
    return Number(probeBin.stdout.trim());
  }
  // Fallback via ffmpeg
  const err = ff(["-hide_banner", "-i", filePath, "-f", "null", "-"]);
  const m = err.match(/Duration:\s*(\d+):(\d+):(\d+(?:\.\d+)?)/);
  if (!m) throw new Error(`Cannot probe duration: ${filePath}`);
  return Number(m[1]) * 3600 + Number(m[2]) * 60 + Number(m[3]);
}

function mv(metric) {
  return metric?.value ?? null;
}

function round(n, d = 2) {
  if (n === null || n === undefined || !Number.isFinite(n)) return null;
  const f = 10 ** d;
  return Math.round(n * f) / f;
}

function pickSummary(analysis) {
  const m = analysis.measured;
  const d = analysis.derived;
  const bands = m.spectrumBands;
  const samplePeak = round(mv(m.peaks.samplePeakDb), 2);
  const truePeak = round(mv(m.peaks.truePeakDb), 2);
  const clipCount = mv(m.integrity.clippingSampleCount);
  return {
    integratedLufs: round(mv(m.loudness.integratedLufs), 2),
    truePeakDbTp: truePeak,
    samplePeakDb: samplePeak,
    lra: round(mv(m.loudness.loudnessRangeLu), 2),
    crestFactorDb: round(mv(m.dynamics.crestFactorDb), 2),
    rmsDb: round(mv(m.dynamics.rmsLevelDb), 2),
    sampleRateHz: mv(m.integrity.sampleRateHz),
    codec: mv(m.integrity.codec),
    clippingSampleCount: clipCount,
    clipped: clipCount != null ? clipCount > 0 : samplePeak != null ? samplePeak > -0.1 : null,
    stereoCorrelation: round(mv(d.stereoCorrelation), 3),
    stereoWidthRatio: round(mv(d.stereoWidthRatio), 3),
    spectralCentroidHz: round(mv(d.spectralCentroidHz), 0),
    spectralSlopeDbPerOct: round(mv(d.spectralSlopeDbPerOct), 2),
    lowEndDominanceDb: round(mv(d.lowEndDominanceDb), 2),
    harshnessProxyDb: round(mv(d.harshnessProxyDb), 2),
    sibilanceProxyDb: round(mv(d.sibilanceProxyDb), 2),
    compressionProxy: round(mv(d.compressionProxy), 3),
    transientActivityProxy: round(mv(d.transientActivityProxy), 3),
    spectralBalance: {
      subBassDb: round(mv(bands.subBassDb), 2),
      bassDb: round(mv(bands.bassDb), 2),
      lowMidDb: round(mv(bands.lowMidDb), 2),
      midDb: round(mv(bands.midDb), 2),
      upperMidDb: round(mv(bands.upperMidDb), 2),
      presenceDb: round(mv(bands.presenceDb), 2),
      brillianceDb: round(mv(bands.brillianceDb), 2)
    },
    flags: { ...analysis.flags }
  };
}

function listeningNotes(original, previous, calibrated) {
  const notes = [];
  const o = original;
  const p = previous;
  const c = calibrated;

  // Harsh highs
  if (c.harshnessProxyDb != null && p.harshnessProxyDb != null) {
    const dHarsh = c.harshnessProxyDb - p.harshnessProxyDb;
    if (c.flags.harsh_upper_mids && !p.flags.harsh_upper_mids) {
      notes.push({ issue: "harsh highs", severity: "fail", detail: `calibrated newly flags harsh_upper_mids (Δ harshness ${round(dHarsh)} dB)` });
    } else if (dHarsh > 1.5) {
      notes.push({ issue: "harsh highs", severity: "warn", detail: `harshnessProxy +${round(dHarsh)} dB vs previous` });
    } else if (dHarsh < -0.8) {
      notes.push({ issue: "harsh highs", severity: "improve", detail: `less harsh than previous (Δ ${round(dHarsh)} dB)` });
    }
  }

  // Dullness (centroid / brilliance drop)
  if (c.spectralCentroidHz != null && p.spectralCentroidHz != null) {
    const dCent = c.spectralCentroidHz - p.spectralCentroidHz;
    const dBrill =
      c.spectralBalance.brillianceDb != null && p.spectralBalance.brillianceDb != null
        ? c.spectralBalance.brillianceDb - p.spectralBalance.brillianceDb
        : 0;
    if (dCent < -400 && dBrill < -1.5) {
      notes.push({ issue: "dullness", severity: "fail", detail: `centroid ${round(dCent, 0)} Hz, brilliance ${round(dBrill)} dB vs previous` });
    } else if (dCent < -250) {
      notes.push({ issue: "dullness", severity: "warn", detail: `centroid ${round(dCent, 0)} Hz vs previous` });
    }
  }

  // Excessive bass
  if (c.lowEndDominanceDb != null && p.lowEndDominanceDb != null) {
    const dBass = c.lowEndDominanceDb - p.lowEndDominanceDb;
    if (c.flags.low_end_excess && !p.flags.low_end_excess) {
      notes.push({ issue: "excessive bass", severity: "fail", detail: `new low_end_excess flag (Δ ${round(dBass)} dB)` });
    } else if (dBass > 2) {
      notes.push({ issue: "excessive bass", severity: "warn", detail: `lowEndDominance +${round(dBass)} dB vs previous` });
    }
  }

  // Pumping / over-compression (LRA collapse + compression proxy up)
  if (c.lra != null && p.lra != null && c.compressionProxy != null && p.compressionProxy != null) {
    const dLra = c.lra - p.lra;
    const dComp = c.compressionProxy - p.compressionProxy;
    if (dLra < -2.5 && dComp > 0.08) {
      notes.push({ issue: "pumping", severity: "fail", detail: `LRA ${round(dLra)} LU, compressionProxy +${round(dComp, 3)}` });
    } else if (c.flags.overly_compressed && !p.flags.overly_compressed) {
      notes.push({ issue: "pumping", severity: "fail", detail: "new overly_compressed flag" });
    } else if (dLra < -1.5) {
      notes.push({ issue: "pumping", severity: "warn", detail: `LRA ${round(dLra)} LU vs previous` });
    }
  }

  // Transient impact
  if (c.transientActivityProxy != null && p.transientActivityProxy != null) {
    const dT = c.transientActivityProxy - p.transientActivityProxy;
    if (dT < -0.12) {
      notes.push({ issue: "transient impact", severity: "fail", detail: `transientActivity ${round(dT, 3)} vs previous` });
    } else if (dT < -0.06) {
      notes.push({ issue: "transient impact", severity: "warn", detail: `transientActivity ${round(dT, 3)} vs previous` });
    } else if (dT > 0.05) {
      notes.push({ issue: "transient impact", severity: "improve", detail: `more impact (Δ ${round(dT, 3)})` });
    }
  }

  // Vocal clarity proxy: presence vs mid, sibilance not excessive
  if (c.spectralBalance.presenceDb != null && p.spectralBalance.presenceDb != null) {
    const dPres = c.spectralBalance.presenceDb - p.spectralBalance.presenceDb;
    if (dPres < -2 && !(c.flags.excessive_sibilance)) {
      notes.push({ issue: "vocal clarity", severity: "warn", detail: `presence ${round(dPres)} dB vs previous` });
    } else if (c.flags.excessive_sibilance && !p.flags.excessive_sibilance) {
      notes.push({ issue: "vocal clarity", severity: "warn", detail: "new excessive_sibilance (harsh vocal top)" });
    } else if (dPres > 0.8 && !c.flags.harsh_upper_mids) {
      notes.push({ issue: "vocal clarity", severity: "improve", detail: `presence +${round(dPres)} dB without harsh flag` });
    }
  }

  // Genre character: stereo collapse or extreme tonal tilt vs original
  if (c.stereoCorrelation != null && o.stereoCorrelation != null) {
    const dCorr = Math.abs(c.stereoCorrelation - o.stereoCorrelation);
    if (c.flags.phase_risk && !p.flags.phase_risk) {
      notes.push({ issue: "genre character", severity: "fail", detail: "new phase_risk" });
    } else if (dCorr > 0.35 && c.flags.narrow_stereo) {
      notes.push({ issue: "genre character", severity: "warn", detail: `stereo correlation drift ${round(dCorr, 3)} + narrow_stereo` });
    }
  }

  // True peak / clipping regressions
  if (c.truePeakDbTp != null && p.truePeakDbTp != null) {
    if (c.flags.clipping_risk && !p.flags.clipping_risk) {
      notes.push({ issue: "true peak", severity: "fail", detail: "new clipping_risk" });
    } else if (c.truePeakDbTp > -0.3 && c.truePeakDbTp > (p.truePeakDbTp ?? -99) + 0.4) {
      notes.push({ issue: "true peak", severity: "fail", detail: `TP ${c.truePeakDbTp} dBTP worse than previous ${p.truePeakDbTp}` });
    }
  }

  // Loudness target miss regression
  return notes;
}

function objectivelyWorse(notes, calMetrics, prevMetrics, targetLufs, targetTp) {
  const fails = notes.filter((n) => n.severity === "fail");
  const reasons = fails.map((f) => `${f.issue}: ${f.detail}`);

  // Loudness accuracy regression > 1.0 LU vs previous absolute error
  if (calMetrics.integratedLufs != null && prevMetrics.integratedLufs != null) {
    const calErr = Math.abs(calMetrics.integratedLufs - targetLufs);
    const prevErr = Math.abs(prevMetrics.integratedLufs - targetLufs);
    if (calErr > prevErr + 1.0 && calErr > 1.5) {
      reasons.push(`LUFS accuracy worse: |Δ| ${round(calErr)} vs previous ${round(prevErr)} (target ${targetLufs})`);
    }
  }

  // True-peak ceiling breach when previous was safe
  if (calMetrics.truePeakDbTp != null && prevMetrics.truePeakDbTp != null) {
    if (calMetrics.truePeakDbTp > targetTp + 0.15 && prevMetrics.truePeakDbTp <= targetTp + 0.15) {
      reasons.push(`TP breach: ${calMetrics.truePeakDbTp} > ceil ${targetTp} (previous ${prevMetrics.truePeakDbTp} was safe)`);
    }
  }

  return reasons;
}

async function ensureExcerpt(track) {
  const excerptPath = path.join(OUT_DIR, "sources", `${track.genre}.wav`);
  await fs.mkdir(path.dirname(excerptPath), { recursive: true });
  try {
    await fs.access(excerptPath);
    return excerptPath;
  } catch {
    // continue
  }
  await fs.access(track.source);
  const dur = ffprobeDuration(track.source);
  const start = Math.max(0, Math.min(dur - EXCERPT_SEC - 1, dur * EXCERPT_START_FRAC));
  ff([
    "-y",
    "-hide_banner",
    "-ss",
    String(start.toFixed(2)),
    "-t",
    String(EXCERPT_SEC),
    "-i",
    track.source,
    "-c:a",
    "pcm_s24le",
    "-ar",
    "48000",
    "-ac",
    "2",
    excerptPath
  ]);
  return excerptPath;
}

async function masterVariant(track, excerptPath) {
  const outWav = path.join(OUT_DIR, "masters", VARIANT, `${track.genre}_${MODE}.wav`);
  await fs.mkdir(path.dirname(outWav), { recursive: true });
  if (SKIP_MASTER) {
    await fs.access(outWav);
    return outWav;
  }
  const result = await runMasteringPipeline({
    inputPath: excerptPath,
    genre: track.genre,
    loudnessMode: MODE,
    outputFormat: "wav",
    outputQuality: OUTPUT_QUALITY === "32bit_float" ? "32bit_float" : "24bit",
    jobId: `listen_${VARIANT}_${track.genre}_${MODE}`
  });
  await fs.copyFile(result.masteredPath, outWav);
  await fs.unlink(result.masteredPath).catch(() => {});
  await fs.unlink(result.previewPath).catch(() => {});
  await fs.unlink(result.inputPreviewPath).catch(() => {});
  return outWav;
}

async function writeListenMp3(wavPath, mp3Path) {
  await fs.mkdir(path.dirname(mp3Path), { recursive: true });
  ff(["-y", "-hide_banner", "-i", wavPath, "-codec:a", "libmp3lame", "-q:a", "2", mp3Path]);
}

async function writeSpectrogram(wavPath, pngPath) {
  await fs.mkdir(path.dirname(pngPath), { recursive: true });
  ff([
    "-y",
    "-hide_banner",
    "-i",
    wavPath,
    "-lavfi",
    "showspectrumpic=s=1280x512:mode=combined:color=intensity:scale=log",
    pngPath
  ]);
}

async function main() {
  if (!["calibrated", "previous", "final"].includes(VARIANT)) {
    throw new Error(`LISTENING_VARIANT must be calibrated|previous|final, got ${VARIANT}`);
  }
  if (!["24bit", "32bit_float"].includes(OUTPUT_QUALITY)) {
    throw new Error(`LISTENING_OUTPUT_QUALITY must be 24bit|32bit_float, got ${OUTPUT_QUALITY}`);
  }
  await fs.mkdir(OUT_DIR, { recursive: true });

  const rows = [];
  for (const track of TRACKS) {
    console.log(`[${VARIANT}] ${track.genre}: preparing excerpt from ${track.label}`);
    const excerpt = await ensureExcerpt(track);
    console.log(`[${VARIANT}] ${track.genre}: mastering (${MODE})`);
    const masterPath = await masterVariant(track, excerpt);

    const previewMp3 = path.join(OUT_DIR, "previews", VARIANT, `${track.genre}.mp3`);
    const spectrogram = path.join(OUT_DIR, "spectrograms", VARIANT, `${track.genre}.png`);
    await writeListenMp3(masterPath, previewMp3);
    await writeSpectrogram(masterPath, spectrogram);

    console.log(`[${VARIANT}] ${track.genre}: analyzing`);
    const analysis = await analyzeTrackV2(masterPath);
    const summary = pickSummary(analysis);
    const targetLufs = getLoudnessModeLufsTarget(GENRE_PRESETS[track.genre], MODE);
    const targetTp = getLoudnessModeTruePeak(GENRE_PRESETS[track.genre], MODE);

    rows.push({
      genre: track.genre,
      label: track.label,
      variant: VARIANT,
      mode: MODE,
      sourcePath: track.source,
      excerptPath: excerpt,
      masterPath,
      previewMp3,
      spectrogram,
      targetLufs,
      targetTruePeak: targetTp,
      lufsError: summary.integratedLufs != null ? round(summary.integratedLufs - targetLufs) : null,
      tpHeadroom: summary.truePeakDbTp != null ? round(targetTp - summary.truePeakDbTp) : null,
      metrics: summary
    });
    console.log(
      `  LUFS ${summary.integratedLufs} (Δ${rows.at(-1).lufsError}) TP ${summary.truePeakDbTp} LRA ${summary.lra} corr ${summary.stereoCorrelation}`
    );
  }

  // Also analyze originals once (shared)
  const originals = [];
  for (const track of TRACKS) {
    const excerpt = path.join(OUT_DIR, "sources", `${track.genre}.wav`);
    const previewMp3 = path.join(OUT_DIR, "previews", "original", `${track.genre}.mp3`);
    const spectrogram = path.join(OUT_DIR, "spectrograms", "original", `${track.genre}.png`);
    await writeListenMp3(excerpt, previewMp3);
    await writeSpectrogram(excerpt, spectrogram);
    const analysis = await analyzeTrackV2(excerpt);
    originals.push({
      genre: track.genre,
      label: track.label,
      previewMp3,
      spectrogram,
      metrics: pickSummary(analysis)
    });
  }

  const outJson = path.join(OUT_DIR, `listening-${VARIANT}.json`);
  const report = {
    variant: VARIANT,
    mode: MODE,
    generatedAt: new Date().toISOString(),
    tracks: rows,
    originals
  };
  await fs.writeFile(outJson, JSON.stringify(report, null, 2), "utf8");
  console.log(`Wrote ${outJson}`);
}

function compactVariant(row) {
  if (!row) return null;
  return {
    lufs: row.metrics.integratedLufs,
    truePeak: row.metrics.truePeakDbTp,
    samplePeak: row.metrics.samplePeakDb ?? null,
    lra: row.metrics.lra,
    crestFactorDb: row.metrics.crestFactorDb ?? null,
    rmsDb: row.metrics.rmsDb ?? null,
    sampleRateHz: row.metrics.sampleRateHz ?? null,
    codec: row.metrics.codec ?? null,
    clipped: row.metrics.clipped ?? row.metrics.flags?.clipping_risk ?? null,
    stereoCorrelation: row.metrics.stereoCorrelation,
    spectralBalance: row.metrics.spectralBalance,
    harshnessProxyDb: row.metrics.harshnessProxyDb,
    lowEndDominanceDb: row.metrics.lowEndDominanceDb,
    compressionProxy: row.metrics.compressionProxy,
    transientActivityProxy: row.metrics.transientActivityProxy,
    spectralCentroidHz: row.metrics.spectralCentroidHz,
    flags: row.metrics.flags,
    previewMp3: row.previewMp3,
    spectrogram: row.spectrogram,
    lufsError: row.lufsError,
    tpHeadroom: row.tpHeadroom
  };
}

function gainStagingGate(row) {
  if (!row) return [];
  const issues = [];
  const lufs = row.metrics.integratedLufs;
  const tp = row.metrics.truePeakDbTp;
  const targetLufs = row.targetLufs;
  const targetTp = row.targetTruePeak;
  if (tp != null && tp > targetTp + 0.1) {
    issues.push(`TP fail: ${tp} > ceil ${targetTp} + 0.1`);
  }
  if (lufs != null && lufs > targetLufs + 1.0) {
    issues.push(`LUFS overshoot fail: ${lufs} > target ${targetLufs} + 1.0`);
  }
  if (row.metrics.clipped) {
    issues.push("clipping detected on exported master");
  }
  return issues;
}

// Compare mode when variant JSONs exist
async function compareIfReady() {
  const prevPath = path.join(OUT_DIR, "listening-previous.json");
  const calPath = path.join(OUT_DIR, "listening-calibrated.json");
  const finalPath = path.join(OUT_DIR, "listening-final.json");
  try {
    await fs.access(prevPath);
    await fs.access(calPath);
  } catch {
    return;
  }

  const previous = JSON.parse(await fs.readFile(prevPath, "utf8"));
  const calibrated = JSON.parse(await fs.readFile(calPath, "utf8"));
  let finalReportJson = null;
  try {
    finalReportJson = JSON.parse(await fs.readFile(finalPath, "utf8"));
  } catch {
    finalReportJson = null;
  }
  const comparison = [];
  let stop = false;

  for (const track of TRACKS) {
    const o = previous.originals.find((x) => x.genre === track.genre)?.metrics
      || calibrated.originals.find((x) => x.genre === track.genre)?.metrics
      || finalReportJson?.originals?.find((x) => x.genre === track.genre)?.metrics;
    const p = previous.tracks.find((x) => x.genre === track.genre);
    const c = calibrated.tracks.find((x) => x.genre === track.genre);
    const f = finalReportJson?.tracks?.find((x) => x.genre === track.genre);
    if (!o || !p || !c) continue;

    const compareMetrics = f?.metrics || c.metrics;
    const compareTargetLufs = f?.targetLufs ?? c.targetLufs;
    const compareTargetTp = f?.targetTruePeak ?? c.targetTruePeak;
    const notes = listeningNotes(o, p.metrics, compareMetrics);
    const worse = objectivelyWorse(notes, compareMetrics, p.metrics, compareTargetLufs, compareTargetTp);
    const stagingIssues = gainStagingGate(f || c);
    if (worse.length || stagingIssues.length) stop = true;

    comparison.push({
      genre: track.genre,
      label: track.label,
      mode: MODE,
      targets: { lufs: compareTargetLufs, truePeak: compareTargetTp },
      original: o,
      previous: compactVariant(p),
      calibrated: compactVariant(c),
      final: compactVariant(f),
      listeningNotes: notes,
      objectivelyWorseReasons: worse,
      gainStagingIssues: stagingIssues,
      verdict:
        worse.length || stagingIssues.length
          ? "STOP — gate failed"
          : notes.some((n) => n.severity === "warn")
            ? "PASS with warnings"
            : "PASS"
    });
  }

  const finalReport = {
    generatedAt: new Date().toISOString(),
    mode: MODE,
    includesFinal: Boolean(finalReportJson),
    stopRecommended: stop,
    summary: stop
      ? "STOP: one or more presets failed listening/gain-staging gates."
      : finalReportJson
        ? "PASS: final corrected presets meet listening + gain-staging gates."
        : "PASS: no calibrated preset objectively worse than previous.",
    genres: comparison
  };
  const comparePath = path.join(OUT_DIR, "listening-compare.json");
  await fs.writeFile(comparePath, JSON.stringify(finalReport, null, 2), "utf8");
  console.log(`\n=== LISTENING COMPARE ===`);
  console.log(finalReport.summary);
  for (const g of comparison) {
    console.log(`\n${g.genre} (${g.label}): ${g.verdict}`);
    const fLufs = g.final?.lufs ?? "—";
    const fTp = g.final?.truePeak ?? "—";
    console.log(
      `  LUFS O/P/C/F: ${g.original.integratedLufs} / ${g.previous.lufs} / ${g.calibrated.lufs} / ${fLufs} (target ${g.targets.lufs})`
    );
    console.log(
      `  TP   O/P/C/F: ${g.original.truePeakDbTp} / ${g.previous.truePeak} / ${g.calibrated.truePeak} / ${fTp} (ceil ${g.targets.truePeak})`
    );
    if (g.final) {
      console.log(
        `  Final SR/codec/clip: ${g.final.sampleRateHz} / ${g.final.codec} / clipped=${g.final.clipped}`
      );
      console.log(`  Final ΔLUFS=${g.final.lufsError} TP headroom=${g.final.tpHeadroom}`);
    }
    console.log(`  LRA  O/P/C: ${g.original.lra} / ${g.previous.lra} / ${g.calibrated.lra}`);
    console.log(
      `  Corr O/P/C: ${g.original.stereoCorrelation} / ${g.previous.stereoCorrelation} / ${g.calibrated.stereoCorrelation}`
    );
    if (g.listeningNotes.length) {
      for (const n of g.listeningNotes) console.log(`  [${n.severity}] ${n.issue}: ${n.detail}`);
    }
    if (g.objectivelyWorseReasons.length) {
      for (const r of g.objectivelyWorseReasons) console.log(`  WORSE: ${r}`);
    }
    if (g.gainStagingIssues.length) {
      for (const r of g.gainStagingIssues) console.log(`  GATE: ${r}`);
    }
  }
  console.log(`\nWrote ${comparePath}`);
}

const args = process.argv.slice(2);
if (args.includes("--compare-only")) {
  compareIfReady().catch((err) => {
    console.error(err);
    process.exit(1);
  });
} else {
  main()
    .then(() => compareIfReady())
    .catch((err) => {
      console.error(err);
      process.exit(1);
    });
}
