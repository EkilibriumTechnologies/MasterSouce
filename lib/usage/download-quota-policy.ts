/** Free tier: one billable WAV export per calendar month (UTC). MP3 previews are unmetered. */
export const FREE_WAV_DOWNLOADS_PER_MONTH = 1;

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

export type WavQuotaEnforcementBackend = "none" | "supabase" | "local";

/**
 * Email-based Supabase counts apply whenever billing email is known.
 * Session counter is only used when Supabase is off or billing email is missing at download time.
 */
export function resolveWavQuotaEnforcementBackend(params: {
  enforceWavQuota: boolean;
  isSupabaseConfigured: boolean;
  billingEmail: string | null;
  hasDownloadAccess: boolean;
}): WavQuotaEnforcementBackend {
  if (!params.enforceWavQuota) return "none";
  if (params.isSupabaseConfigured && Boolean(params.billingEmail)) {
    return "supabase";
  }
  if (params.hasDownloadAccess) return "local";
  return "none";
}
