/**
 * Shared helpers for mastering journey contract tests.
 *
 * Scope: FFmpeg fixture generation, in-memory temp-record simulation, response-shape
 * validators, and static route/UI invariant checks. This is NOT live HTTP route
 * integration — see scripts/mastering-journey-integration-test.mjs.
 */
import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import assert from "node:assert/strict";
import path from "node:path";
import ffmpegStatic from "ffmpeg-static";
import {
  isBillableWavExport,
  isUnmeteredMp3Download,
  shouldEnforceWavDownloadQuota
} from "../../lib/usage/download-quota-policy.ts";
import { MAX_UPLOAD_FILE_SIZE_BYTES, MAX_UPLOAD_FILE_SIZE_LABEL } from "../../lib/upload/limits.ts";

export {
  isBillableWavExport,
  isUnmeteredMp3Download,
  shouldEnforceWavDownloadQuota,
  MAX_UPLOAD_FILE_SIZE_BYTES,
  MAX_UPLOAD_FILE_SIZE_LABEL
};

export const ROOT = process.cwd();

/** Route paths checked via static source reads (not HTTP calls). */
export const ACCEPTED_MIME = new Set(["audio/mpeg", "audio/mp3", "audio/wav", "audio/x-wav", "audio/wave"]);
export const ACCEPTED_EXT = new Set(["wav", "mp3"]);

export const MASTERING_JOURNEY_ROUTES = [
  "app/api/master/route.ts",
  "app/api/master-ai/route.ts",
  "app/api/analyze-track/route.ts",
  "app/api/download/route.ts",
  "app/api/capture-email/route.ts",
  "app/api/adaptive/export-access/route.ts"
];

export const FFMPEG =
  typeof ffmpegStatic === "string" ? ffmpegStatic : process.env.FFMPEG_BIN?.trim() || null;

export function read(relPath) {
  return readFileSync(path.join(ROOT, relPath), "utf8");
}

export function assertIncludes(content, needle, context) {
  assert.ok(content.includes(needle), `${context}: missing "${needle}"`);
}

export function assertNotIncludes(content, needle, context) {
  assert.equal(content.includes(needle), false, `${context}: unexpected "${needle}"`);
}

export function assertExcludes(content, needle, context) {
  assert.ok(!content.includes(needle), `${context}: must not include "${needle}"`);
}

export function assertBefore(content, firstNeedle, laterNeedle, context) {
  const first = content.indexOf(firstNeedle);
  const later = content.indexOf(laterNeedle);
  assert.notEqual(first, -1, `${context}: missing "${firstNeedle}"`);
  assert.notEqual(later, -1, `${context}: missing "${laterNeedle}"`);
  assert.ok(first < later, `${context}: expected "${firstNeedle}" before "${laterNeedle}"`);
}

export function requireFfmpeg() {
  assert.ok(
    FFMPEG,
    "ffmpeg-static or FFMPEG_BIN is required for FFmpeg fixture tests (flow1); refusing to silently skip"
  );
  return FFMPEG;
}

export function runFfmpeg(args) {
  const ffmpeg = requireFfmpeg();
  const result = spawnSync(ffmpeg, args, { encoding: "utf8" });
  assert.equal(result.status, 0, `ffmpeg failed: ${result.stderr.slice(-800)}`);
  return result;
}

export function probeStream(filePath) {
  const ffmpeg = requireFfmpeg();
  const result = spawnSync(ffmpeg, ["-hide_banner", "-i", filePath], { encoding: "utf8" });
  const line = result.stderr.split(/\r?\n/).find((row) => row.includes("Audio:"));
  assert.ok(line, `missing Audio stream line for ${filePath}`);
  const codecMatch = line.match(/Audio:\s*([^\s,]+)/);
  const rateMatch = line.match(/,\s*(\d+)\s*Hz,/);
  const channelMatch = line.match(/Hz,\s*([^,]+),/);
  assert.ok(codecMatch && rateMatch && channelMatch, `unable to parse probe line: ${line}`);
  const durationMatch = result.stderr.match(/Duration:\s*(\d+):(\d+):(\d+(?:\.\d+)?)/);
  let durationSec = null;
  if (durationMatch) {
    durationSec =
      Number(durationMatch[1]) * 3600 + Number(durationMatch[2]) * 60 + Number(durationMatch[3]);
  }
  return {
    codec: codecMatch[1],
    sampleRate: Number(rateMatch[1]),
    channels: channelMatch[1].trim().toLowerCase(),
    durationSec,
    raw: line.trim()
  };
}

export function generateTestWav(outputPath, durationSec = 8) {
  runFfmpeg([
    "-y",
    "-hide_banner",
    "-f",
    "lavfi",
    "-i",
    `sine=frequency=440:duration=${durationSec}`,
    "-c:a",
    "pcm_s16le",
    "-ar",
    "44100",
    "-ac",
    "2",
    outputPath
  ]);
}

export function probeDurationSec(filePath) {
  const ffmpeg = requireFfmpeg();
  const result = spawnSync(ffmpeg, ["-hide_banner", "-i", filePath], { encoding: "utf8" });
  const match = result.stderr.match(/Duration:\s*(\d+):(\d+):(\d+(?:\.\d+)?)/);
  assert.ok(match, `duration missing for ${filePath}`);
  return Number(match[1]) * 3600 + Number(match[2]) * 60 + Number(match[3]);
}

/** In-memory temp record store mirroring lib/storage/temp-files lookup semantics. */
export function createTempRecordStore() {
  const records = new Map();

  return {
    add(record) {
      records.set(record.id, { ...record });
      return record;
    },
    get(id) {
      const record = records.get(id);
      if (!record) return null;
      if (record.expiresAt <= Date.now()) return null;
      return record;
    },
    findLatestUploadForJob(jobId) {
      const uploads = [...records.values()]
        .filter((item) => item.kind === "upload" && item.jobId === jobId && item.expiresAt > Date.now())
        .sort((a, b) => b.expiresAt - a.expiresAt);
      return uploads[0] ?? null;
    },
    expire(id) {
      const record = records.get(id);
      if (record) record.expiresAt = Date.now() - 1;
    },
    all() {
      return [...records.values()];
    }
  };
}

/**
 * Mirror of lib/audio/resolve-adaptive-source-audio.ts lookup branches — keep in sync.
 *
 * Production resolveAdaptiveSourceAudio writes inline uploads to lib/storage/temp-files
 * on disk, so tests inject an in-memory store instead of calling the real module.
 */
export function resolveAdaptiveSourceAudioMirror(request, store) {
  const inlineAudio = request.inlineAudio;
  if (inlineAudio && inlineAudio.size > 0) {
    const filename = inlineAudio.name || "track";
    const ext = filename.split(".").pop()?.toLowerCase() ?? "";
    const mimeAccepted = ACCEPTED_MIME.has(inlineAudio.type);
    const extAccepted = ACCEPTED_EXT.has(ext);
    if (!mimeAccepted && !extAccepted) {
      return {
        ok: false,
        status: 400,
        error: "Only WAV or MP3 are supported for adaptive mastering.",
        code: "invalid_inline_audio"
      };
    }
    if (inlineAudio.size > MAX_UPLOAD_FILE_SIZE_BYTES) {
      return {
        ok: false,
        status: 400,
        error: `File exceeds the maximum upload size of ${MAX_UPLOAD_FILE_SIZE_LABEL}.`,
        code: "invalid_inline_audio"
      };
    }
    const normalizedExt = ext === "wav" || inlineAudio.type.includes("wav") ? "wav" : "mp3";
    const record = store.add({
      id: `upload_${Math.random().toString(16).slice(2, 10)}`,
      filePath: `/tmp/${normalizedExt}-inline`,
      kind: "upload",
      mime: normalizedExt === "wav" ? "audio/wav" : "audio/mpeg",
      jobId: request.inlineJobId,
      expiresAt: Date.now() + 30 * 60 * 1000
    });
    return {
      ok: true,
      record,
      source: { fileId: record.id, jobId: record.jobId },
      resolvedBy: "inline"
    };
  }

  const fileId = request.fileId?.trim() || undefined;
  const jobId = request.jobId?.trim() || undefined;
  let sawMasteredRecord = false;

  if (fileId) {
    const record = store.get(fileId);
    if (record?.kind === "upload") {
      if (jobId && record.jobId !== jobId) {
        return {
          ok: false,
          status: 404,
          error: "Original upload reference does not match the supplied job.",
          code: "missing_original_upload"
        };
      }
      return {
        ok: true,
        record,
        source: { fileId: record.id, jobId: record.jobId },
        resolvedBy: "fileId"
      };
    }
    if (record?.kind === "mastered") {
      sawMasteredRecord = true;
    }
  }

  if (jobId) {
    const record = store.findLatestUploadForJob(jobId);
    if (record) {
      return {
        ok: true,
        record,
        source: { fileId: record.id, jobId: record.jobId },
        resolvedBy: "jobId"
      };
    }
  }

  return {
    ok: false,
    status: fileId || jobId ? 404 : 400,
    error: sawMasteredRecord
      ? "Original upload is missing or expired; mastered files cannot be used for adaptive mastering."
      : "Original upload is missing or expired.",
    code: "missing_original_upload"
  };
}

/** Mirrors /api/master and /api/analyze-track upload validation messages. */
export function validateAcceptedUpload(filename, mime, size) {
  if (size > MAX_UPLOAD_FILE_SIZE_BYTES) {
    return { ok: false, status: 400, error: `File exceeds the maximum upload size of ${MAX_UPLOAD_FILE_SIZE_LABEL}.` };
  }
  const ext = filename.split(".").pop()?.toLowerCase() ?? "";
  const mimeAccepted = ACCEPTED_MIME.has(mime);
  const extAccepted = ACCEPTED_EXT.has(ext);
  if (!mimeAccepted && !extAccepted) {
    return { ok: false, status: 400, error: "Only WAV or MP3 are supported for MVP." };
  }
  return { ok: true, ext: ext === "wav" || mime.includes("wav") ? "wav" : "mp3" };
}

export function buildDownloadUrl(fileId, asName, extra = "") {
  return `/api/download?fileId=${fileId}&as=${asName}${extra}`;
}

/** Builds a client-response-shaped object for contract validation only (not from a live route). */
export function buildSimulatedStandardMasterResponse(records) {
  const { jobId, upload, mastered, originalPreview, masteredPreview, analysis } = records;
  return {
    jobId,
    preset: "Pop",
    mode: "Balanced",
    previews: {
      original: buildDownloadUrl(originalPreview.id, "original-preview.mp3"),
      mastered: buildDownloadUrl(masteredPreview.id, "mastered-preview.mp3")
    },
    download: {
      requiresEmail: true,
      fileId: mastered.id
    },
    analysis: {
      durationSec: analysis.durationSec,
      integratedLufs: analysis.integratedLufs,
      peakDb: analysis.peakDb,
      crestDb: analysis.crestDb,
      notes: analysis.notes,
      original: analysis.original
    },
    subscription: {
      customerPortalEligible: false,
      stripeReady: true,
      authReady: true
    },
    _internal: { uploadFilePath: upload.filePath, masteredFilePath: mastered.filePath }
  };
}

export function validateStandardMasterResponse(response) {
  assert.match(response.jobId, /^job_/, "standard master jobId prefix");
  assert.equal(typeof response.preset, "string", "standard master preset label");
  assert.equal(typeof response.mode, "string", "standard master mode label");
  assert.match(response.previews.original, /^\/api\/download\?fileId=/, "original preview URL");
  assert.match(response.previews.mastered, /^\/api\/download\?fileId=/, "mastered preview URL");
  assert.equal(response.download.requiresEmail, true, "standard export requires email");
  assert.match(response.download.fileId, /^mastered_/, "standard export fileId is mastered temp record");
  assert.equal(typeof response.analysis.durationSec, "number", "analysis durationSec");
  assert.equal(typeof response.analysis.original, "object", "analysis original metrics");
  assert.ok(!response._internal, "internal simulation fields must not leak to clients");
}

/** Builds a client-response-shaped object for contract validation only (not from a live route). */
export function buildSimulatedAdaptiveMasterResponse(records) {
  const { jobId, adaptiveMaster, standardPreview, adaptivePreview, sourceUpload } = records;
  return {
    jobId,
    mode: "adaptive",
    previews: {
      standard: buildDownloadUrl(standardPreview.id, "standard-master-preview.mp3"),
      adaptive: buildDownloadUrl(adaptivePreview.id, "adaptive-master-preview.mp3")
    },
    download: {
      requiresEmail: true,
      fileId: adaptiveMaster.id
    },
    analysis: {
      standard: {
        durationSec: 8,
        integratedLufs: -14,
        peakDb: -1,
        crestDb: 10,
        notes: [],
        original: { durationSec: 8, integratedLufs: -14, peakDb: -1, crestDb: 10 }
      },
      adaptive: {
        durationSec: 8,
        integratedLufs: -11,
        peakDb: -0.5,
        crestDb: 9,
        notes: [],
        original: { durationSec: 8, integratedLufs: -11, peakDb: -0.5, crestDb: 9 }
      }
    },
    readiness: null,
    adaptiveSettings: {
      source: "heuristic",
      rationale: "test",
      settings: {
        eqDirection: { lowEnd: 0, lowMid: 0, presence: 0, air: 0 },
        compressionIntensity: "medium",
        saturationAmount: 0,
        stereoWidth: 0,
        targetLufs: -11,
        transientHandling: "balanced",
        vocalPresenceEmphasis: 0
      }
    },
    validation: { correctivePasses: 0, warnings: [] },
    _internal: { sourceInputPath: sourceUpload.filePath, sourceKind: sourceUpload.kind }
  };
}

export function validateAdaptiveMasterResponse(response) {
  assert.match(response.jobId, /^adaptive_/, "adaptive jobId prefix");
  assert.equal(response.mode, "adaptive");
  assert.match(response.previews.standard, /standard-master-preview\.mp3/, "standard preview filename");
  assert.match(response.previews.adaptive, /adaptive-master-preview\.mp3/, "adaptive preview filename");
  assert.equal(response.download.requiresEmail, true);
  assert.match(response.download.fileId, /^mastered_/, "adaptive export fileId is mastered temp record");
  assert.equal(response.analysis.standard.original !== undefined, true, "adaptive standard analysis");
  assert.ok(!response._internal, "internal simulation fields must not leak to clients");
}

export function buildSimulatedAnalyzeTrackResponse(source) {
  return {
    analysis: {
      verdict: "ready",
      loudness: "ok",
      peakSafety: "ok",
      dynamicControl: "ok",
      recommendation: "Track is ready for mastering."
    },
    source: {
      fileId: source.fileId,
      jobId: source.jobId
    }
  };
}

export function validateAnalyzeTrackResponse(response) {
  assert.equal(typeof response.analysis.verdict, "string", "analyze verdict");
  assert.equal(typeof response.source.fileId, "string", "analyze source fileId");
  assert.match(response.source.jobId, /^analysis_/, "analyze source jobId prefix");
}

const PATH_LEAK_RE = /(?:[A-Za-z]:[\\/]|\/(?:tmp|var|home|users|app|workspace|mnt)\/)/i;
const STACK_LEAK_RE = /\bat\s+[\w./\\-]+\s*\(/;

export function validateErrorResponseSafe(body, context) {
  assert.equal(typeof body.error, "string", `${context}: error message required`);
  if (body.code !== undefined) {
    assert.equal(typeof body.code, "string", `${context}: code must be string`);
  }
  assert.ok(!PATH_LEAK_RE.test(body.error), `${context}: error must not contain filesystem paths`);
  assert.ok(!STACK_LEAK_RE.test(body.error), `${context}: error must not contain stack traces`);
  assert.equal("stack" in body, false, `${context}: stack must not be returned`);
  assert.equal("diagnostics" in body, false, `${context}: diagnostics must not be returned`);
}

/** FFmpeg-based fixture encoding; approximates preview/export artifacts, not runMasteringPipeline. */
export function simulateStandardMasterOutputs(workDir, sourceWav) {
  const masteredWav = path.join(workDir, "mastered.wav");
  const originalPreview = path.join(workDir, "original-preview.mp3");
  const masteredPreview = path.join(workDir, "mastered-preview.mp3");

  runFfmpeg([
    "-y",
    "-hide_banner",
    "-i",
    sourceWav,
    "-af",
    "volume=-3dB,alimiter=limit=0.8913:attack=5:release=80:level=disabled",
    "-c:a",
    "pcm_s16le",
    "-ar",
    "44100",
    "-ac",
    "2",
    masteredWav
  ]);

  runFfmpeg([
    "-y",
    "-hide_banner",
    "-i",
    sourceWav,
    "-ss",
    "0",
    "-t",
    "30",
    "-codec:a",
    "libmp3lame",
    "-b:a",
    "192k",
    originalPreview
  ]);

  runFfmpeg([
    "-y",
    "-hide_banner",
    "-i",
    masteredWav,
    "-ss",
    "0",
    "-t",
    "30",
    "-codec:a",
    "libmp3lame",
    "-b:a",
    "192k",
    masteredPreview
  ]);

  const sourceProbe = probeStream(sourceWav);
  const masteredProbe = probeStream(masteredWav);
  const originalPreviewProbe = probeStream(originalPreview);
  const masteredPreviewProbe = probeStream(masteredPreview);

  assert.match(originalPreviewProbe.codec, /mp3/i, "original preview is mp3");
  assert.match(masteredPreviewProbe.codec, /mp3/i, "mastered preview is mp3");
  assert.ok(masteredProbe.durationSec > 0, "mastered wav has duration");

  return {
    masteredWav,
    originalPreview,
    masteredPreview,
    analysis: {
      durationSec: sourceProbe.durationSec,
      integratedLufs: -14,
      peakDb: -1,
      crestDb: 10,
      notes: [],
      original: {
        durationSec: sourceProbe.durationSec,
        integratedLufs: -14,
        peakDb: -1,
        crestDb: 10
      }
    }
  };
}

export function simulateMp3MasterExport(workDir, sourceWav) {
  const fullMp3 = path.join(workDir, "full-master.mp3");
  runFfmpeg([
    "-y",
    "-hide_banner",
    "-i",
    sourceWav,
    "-codec:a",
    "libmp3lame",
    "-b:a",
    "320k",
    fullMp3
  ]);
  const probe = probeStream(fullMp3);
  assert.match(probe.codec, /mp3/i, "full master mp3 codec");
  assert.ok(probe.durationSec > 0, "full master mp3 duration");
  return { fullMp3, probe };
}
