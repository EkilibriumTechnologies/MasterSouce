import { findLatestRecordForJob, resolveTempRecord, saveTempFile, type TempRecord } from "@/lib/storage/temp-files";
import { MAX_UPLOAD_FILE_SIZE_BYTES, MAX_UPLOAD_FILE_SIZE_LABEL } from "@/lib/upload/limits";

const ACCEPTED_MIME = new Set(["audio/mpeg", "audio/mp3", "audio/wav", "audio/x-wav", "audio/wave"]);
const ACCEPTED_EXT = new Set(["wav", "mp3"]);

export type AdaptiveSourceAudioReference = {
  fileId: string;
  jobId: string;
};

export type ResolveAdaptiveSourceAudioRequest = {
  inlineAudio?: File | null;
  fileId?: string | null;
  jobId?: string | null;
  inlineJobId: string;
};

export type ResolveAdaptiveSourceAudioResult =
  | {
      ok: true;
      record: TempRecord;
      source: AdaptiveSourceAudioReference;
      resolvedBy: "inline" | "fileId" | "jobId";
    }
  | {
      ok: false;
      status: 400 | 404;
      error: string;
      code: "invalid_inline_audio" | "missing_original_upload";
    };

function normalizeOptionalId(value: string | null | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

async function saveInlineUpload(
  inlineAudio: File,
  inlineJobId: string
): Promise<ResolveAdaptiveSourceAudioResult> {
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
  const record = await saveTempFile({
    data: Buffer.from(await inlineAudio.arrayBuffer()),
    extension: normalizedExt,
    kind: "upload",
    mime: normalizedExt === "wav" ? "audio/wav" : "audio/mpeg",
    jobId: inlineJobId
  });

  return {
    ok: true,
    record,
    source: { fileId: record.id, jobId: record.jobId },
    resolvedBy: "inline"
  };
}

export async function resolveAdaptiveSourceAudio(
  request: ResolveAdaptiveSourceAudioRequest
): Promise<ResolveAdaptiveSourceAudioResult> {
  if (request.inlineAudio && request.inlineAudio.size > 0) {
    return saveInlineUpload(request.inlineAudio, request.inlineJobId);
  }

  const fileId = normalizeOptionalId(request.fileId);
  const jobId = normalizeOptionalId(request.jobId);
  let sawMasteredRecord = false;

  if (fileId) {
    const record = await resolveTempRecord(fileId);
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
    const record = await findLatestRecordForJob(jobId, "upload");
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
