import type { PlanId } from "@/lib/subscriptions/types";

/** Free tier: one billable WAV export per calendar month (UTC). MP3 previews are unmetered. */
export const FREE_WAV_DOWNLOADS_PER_MONTH = 1;

/** Creator tier: billable WAV exports per billing period. */
export const CREATOR_WAV_DOWNLOADS_PER_MONTH = 25;

export type DownloadQuotaRecord = {
  kind: string;
  mime: string;
};

/** Final mastered WAV attachment downloads consume plan WAV quota. */
export function isBillableWavExport(record: DownloadQuotaRecord): boolean {
  return (
    record.kind === "mastered" &&
    (record.mime.includes("wav") || record.mime.includes("wave"))
  );
}

/** MP3 previews, full MP3 masters, and preview-kind assets never consume WAV quota. */
export function isUnmeteredMp3Download(record: DownloadQuotaRecord): boolean {
  if (record.kind === "preview" || record.kind === "mastered_mp3") return true;
  return record.mime.includes("mpeg") || record.mime.includes("mp3");
}

export function resolveFreePlanWavCap(planMonthlyLimit: number): number {
  return Math.min(planMonthlyLimit, FREE_WAV_DOWNLOADS_PER_MONTH);
}

export function isUnlimitedMonthlyWavCap(cap: number | null): boolean {
  return cap === null;
}

export function resolvePlanMonthlyWavCap(planId: PlanId, planMonthlyLimit: number | null): number | null {
  if (planId === "free") {
    return resolveFreePlanWavCap(planMonthlyLimit ?? 1);
  }
  return planMonthlyLimit;
}

export function formatMonthlyWavLimitLabel(cap: number | null): string {
  if (cap === null) return "Unlimited WAV downloads";
  if (cap === 1) return "1 WAV download / month";
  return `${cap} WAV downloads / month`;
}

export function shouldEnforceWavDownloadQuota(params: {
  record: DownloadQuotaRecord;
  forceDownload: boolean;
  isAdaptiveMasterJob: boolean;
  adminBypass: boolean;
}): boolean {
  if (params.adminBypass || params.isAdaptiveMasterJob) return false;
  if (!params.forceDownload) return false;
  return isBillableWavExport(params.record);
}
