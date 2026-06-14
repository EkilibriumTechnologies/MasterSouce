import { promises as fs } from "node:fs";
import path from "node:path";
import { maskEmail } from "@/lib/security/abuse-guard";
import { ensureTempRoot, getTempRoot } from "@/lib/storage/temp-files";
import type { EntitlementEmailSource } from "@/lib/subscriptions/resolve-entitlement-billing-context";

const JOB_EXPORT_VERIFY_TTL_MS = 1000 * 60 * 35;
const REGISTRY = new Map<string, JobExportVerifyRecord>();

export type JobExportVerifyRecord = {
  jobId: string;
  endpoint: "/api/master" | "/api/master-ai";
  planId: string;
  outputQuality: string;
  outputCodec: string;
  emailSource: EntitlementEmailSource;
  maskedEmail: string | null;
  codecVerifiedAfterExport: string | null;
  recordedAt: number;
  verifiedAt: number | null;
  expiresAt: number;
};

function verifyMetaPath(jobId: string): string {
  const safe = jobId.replace(/[^a-zA-Z0-9_-]/g, "_");
  return path.join(getTempRoot(), "job_export_verify", `${safe}.json`);
}

async function writeRecord(record: JobExportVerifyRecord): Promise<void> {
  await ensureTempRoot();
  const dir = path.join(getTempRoot(), "job_export_verify");
  await fs.mkdir(dir, { recursive: true });
  REGISTRY.set(record.jobId, record);
  await fs.writeFile(verifyMetaPath(record.jobId), JSON.stringify(record), "utf8");
}

async function readRecord(jobId: string): Promise<JobExportVerifyRecord | null> {
  const cached = REGISTRY.get(jobId);
  if (cached) {
    if (cached.expiresAt <= Date.now()) {
      REGISTRY.delete(jobId);
      return null;
    }
    return cached;
  }

  try {
    const raw = await fs.readFile(verifyMetaPath(jobId), "utf8");
    const record = JSON.parse(raw) as JobExportVerifyRecord;
    if (!record.jobId || record.expiresAt <= Date.now()) return null;
    REGISTRY.set(record.jobId, record);
    return record;
  } catch {
    return null;
  }
}

function logJobExportVerifyEvent(
  event: "encode_time_resolution" | "export_codec_verified",
  record: Pick<
    JobExportVerifyRecord,
    | "jobId"
    | "endpoint"
    | "planId"
    | "outputQuality"
    | "outputCodec"
    | "emailSource"
    | "maskedEmail"
    | "codecVerifiedAfterExport"
  >
): void {
  console.log(
    JSON.stringify({
      scope: "job_export_verify",
      event,
      jobId: record.jobId,
      endpoint: record.endpoint,
      planId: record.planId,
      outputQuality: record.outputQuality,
      outputCodec: record.outputCodec,
      emailSource: record.emailSource,
      maskedEmail: record.maskedEmail,
      codecVerifiedAfterExport: record.codecVerifiedAfterExport
    })
  );
}

export async function recordJobExportEncodeResolution(params: {
  endpoint: "/api/master" | "/api/master-ai";
  jobId: string;
  planId: string;
  outputQuality: string;
  outputCodec: string;
  emailSource: EntitlementEmailSource;
  normalizedEmail: string | null;
}): Promise<void> {
  const now = Date.now();
  const record: JobExportVerifyRecord = {
    jobId: params.jobId,
    endpoint: params.endpoint,
    planId: params.planId,
    outputQuality: params.outputQuality,
    outputCodec: params.outputCodec,
    emailSource: params.emailSource,
    maskedEmail: params.normalizedEmail ? maskEmail(params.normalizedEmail) : null,
    codecVerifiedAfterExport: null,
    recordedAt: now,
    verifiedAt: null,
    expiresAt: now + JOB_EXPORT_VERIFY_TTL_MS
  };
  await writeRecord(record);
  logJobExportVerifyEvent("encode_time_resolution", record);
}

export async function markJobExportCodecVerified(jobId: string, codec: string): Promise<void> {
  const existing = await readRecord(jobId);
  if (!existing) return;

  const updated: JobExportVerifyRecord = {
    ...existing,
    codecVerifiedAfterExport: codec,
    verifiedAt: Date.now()
  };
  await writeRecord(updated);
  logJobExportVerifyEvent("export_codec_verified", updated);
}

export async function getJobExportVerifyRecord(jobId: string): Promise<JobExportVerifyRecord | null> {
  return readRecord(jobId);
}
