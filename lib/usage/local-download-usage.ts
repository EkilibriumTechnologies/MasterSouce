import { getCurrentMonthKeyUtc } from "@/lib/usage/month-key";

type LocalDownloadState = {
  periodKey: string;
  /** jobId + fileId keys that already consumed a billable unit this period */
  billedJobFileKeys: Set<string>;
};

const DOWNLOADS_BY_SESSION = new Map<string, LocalDownloadState>();

function jobFileKey(jobId: string, fileId: string): string {
  return `${jobId}\x1f${fileId}`;
}

export function getLocalBillableDownloadCount(sessionId: string): number {
  const period = getCurrentMonthKeyUtc();
  const entry = DOWNLOADS_BY_SESSION.get(sessionId);
  if (!entry || entry.periodKey !== period) return 0;
  return entry.billedJobFileKeys.size;
}

/**
 * Returns whether this session may bill a first-time download of job+file this month.
 * Repeat requests for the same job+file in the same month do not consume another unit.
 */
export function tryConsumeLocalBillableDownload(
  sessionId: string,
  jobId: string,
  fileId: string,
  monthlyCap: number,
  adminBypass: boolean
): { allowed: boolean; isRepeat: boolean } {
  if (adminBypass) {
    return { allowed: true, isRepeat: false };
  }

  const periodKey = getCurrentMonthKeyUtc();
  let entry = DOWNLOADS_BY_SESSION.get(sessionId);
  if (!entry || entry.periodKey !== periodKey) {
    entry = { periodKey, billedJobFileKeys: new Set() };
    DOWNLOADS_BY_SESSION.set(sessionId, entry);
  }

  const key = jobFileKey(jobId, fileId);
  if (entry.billedJobFileKeys.has(key)) {
    return { allowed: true, isRepeat: true };
  }

  if (entry.billedJobFileKeys.size >= monthlyCap) {
    return { allowed: false, isRepeat: false };
  }

  entry.billedJobFileKeys.add(key);
  return { allowed: true, isRepeat: false };
}
