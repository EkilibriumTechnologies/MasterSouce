import { promises as fs } from "node:fs";
import path from "node:path";
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
  trustedIdentitySource: EntitlementEmailSource;
  adminOverrideGranted: boolean;
  codecVerifiedAfterExport: string | null;
  recordedAt: number;
  verifiedAt: number | null;
  expiresAt: number;
};

function verifyMetaPath(jobId: string): string {
  const safe = jobId.replace(/[^a-zA-Z0-9_-]/g, "_");
  return path.join(getTempRoot(), "job_export_verify", `${safe}.json`);
}

function maskEmail(email: string): string {
  const trimmed = email.trim().toLowerCase();
  const [local, domain] = trimmed.split("@");
  if (!local || !domain) return "<invalid-email>";
  const localMasked =
    local.length <= 2 ? `${local[0] ?? "*"}*` : `${local.slice(0, 2)}***${local.slice(-1)}`;
  const domainParts = domain.split(".");
  const root = domainParts[0] ?? "";
  const tld = domainParts.slice(1).join(".");
  const domainMasked = root.length <= 2 ? `${root[0] ?? "*"}*` : `${root.slice(0, 2)}***`;
  return `${localMasked}@${domainMasked}${tld ? `.${tld}` : ""}`;
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
    | "trustedIdentitySource"
    | "adminOverrideGranted"
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
      trustedIdentitySource: record.trustedIdentitySource,
      adminOverrideGranted: record.adminOverrideGranted,
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
  adminOverrideGranted?: boolean;
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
    trustedIdentitySource: params.emailSource,
    adminOverrideGranted: params.adminOverrideGranted === true,
    codecVerifiedAfterExport: null,
    recordedAt: now,
    verifiedAt: null,
    expiresAt: now + JOB_EXPORT_VERIFY_TTL_MS
  };
  await writeRecord(record);
  logJobExportVerifyEvent("encode_time_resolution", record);
}

export async function markJobExportCodecVerified(
  jobId: string,
  codec: string,
  outputQuality?: string
): Promise<void> {
  const existing = await readRecord(jobId);
  if (!existing) return;

  const updated: JobExportVerifyRecord = {
    ...existing,
    ...(outputQuality ? { outputQuality, outputCodec: codec } : {}),
    codecVerifiedAfterExport: codec,
    verifiedAt: Date.now()
  };
  await writeRecord(updated);
  logJobExportVerifyEvent("export_codec_verified", updated);
}

export async function getJobExportVerifyRecord(jobId: string): Promise<JobExportVerifyRecord | null> {
  return readRecord(jobId);
}
