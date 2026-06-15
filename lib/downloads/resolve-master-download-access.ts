import type { NextRequest } from "next/server";
import type { MasterJobUnlockRow } from "@/lib/downloads/master-job-unlocks";
import { isJobUnlocked } from "@/lib/email/capture-email";
import { readVerifiedEmailState } from "@/lib/security/verified-email-state";

export type MasterDownloadAccess = {
  unlock: MasterJobUnlockRow | null;
  billingEmail: string | null;
  originalEmail: string | null;
};

function normalizeEmail(email: string | null | undefined): string | null {
  const normalized = email?.trim().toLowerCase();
  return normalized ? normalized : null;
}

export function readTrustedBillingEmail(request: NextRequest): string | null {
  return normalizeEmail(readVerifiedEmailState(request)?.normalizedEmail);
}

/**
 * Resolves mastered-export authorization without discarding Supabase unlock rows.
 * In-memory job unlock is a dev fallback when no DB row exists; trusted cookie email
 * backs quota/accounting when the row is missing but the browser session was unlocked.
 */
export function resolveMasterDownloadAccess(params: {
  request: NextRequest;
  jobId: string;
  unlock: MasterJobUnlockRow | null;
  requireWavFileId?: string | null;
}): MasterDownloadAccess | null {
  const { request, jobId, unlock, requireWavFileId } = params;

  if (unlock) {
    if (requireWavFileId && unlock.fileId !== requireWavFileId) {
      return null;
    }
    const billingEmail = normalizeEmail(unlock.normalizedEmail);
    return {
      unlock,
      billingEmail,
      originalEmail: normalizeEmail(unlock.originalEmail) ?? billingEmail
    };
  }

  if (!isJobUnlocked(jobId)) {
    return null;
  }

  const cookieEmail = readTrustedBillingEmail(request);
  return {
    unlock: null,
    billingEmail: cookieEmail,
    originalEmail: cookieEmail
  };
}
