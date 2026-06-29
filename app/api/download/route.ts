import { createReadStream } from "node:fs";
import { readFile, stat } from "node:fs/promises";
import { Readable } from "node:stream";
import { NextRequest, NextResponse } from "next/server";
import { isJobUnlocked } from "@/lib/email/capture-email";
import { getMasterJobUnlock, type MasterJobUnlockRow } from "@/lib/downloads/master-job-unlocks";
import { recordMasteredDownloadAttempt } from "@/lib/downloads/record-mastered-download";
import { buildApiUser } from "@/lib/identity/api-user";
import { attachSessionCookieIfNeeded, prepareSessionForRequest } from "@/lib/identity/session-cookie";
import { cleanupExpiredTempFiles, findLatestRecordForJob, resolveTempRecord } from "@/lib/storage/temp-files";
import { finalizeMasteredWavDelivery } from "@/lib/audio/wav-export-finalize";
import { ensureMasteredMp3ForJob } from "@/lib/audio/mp3-master-export";
import { probeAudioStream } from "@/lib/audio/media-probe";
import { incrementProductMetric } from "@/lib/product-metrics";
import { warnIfUnlockEmailDiffersFromStripeCustomerEmail } from "@/lib/billing/unlock-vs-stripe-customer-email";
import { consumeRateLimit, getClientIp, hashIdentifier, logAbuseGuard, tooManyAttemptsResponse } from "@/lib/security/abuse-guard";
import { isSupabaseConfigured } from "@/lib/supabase/admin";
import { consumeCreditPackMaster, getEntitlementsForUser } from "@/lib/subscriptions/entitlements";
import { isMasterAdminBypassGranted } from "@/lib/subscriptions/master-admin-bypass";
import { isAdminEntitlementOverrideEmail } from "@/lib/subscriptions/admin-entitlement-override";
import { PLAN_DEFINITIONS } from "@/lib/subscriptions/plans";
import type { PlanId } from "@/lib/subscriptions/types";
import {
  FREE_WAV_DOWNLOADS_PER_MONTH,
  resolveFreePlanWavCap,
  shouldEnforceWavDownloadQuota
} from "@/lib/usage/download-quota-policy";
import { tryConsumeLocalBillableDownload } from "@/lib/usage/local-download-usage";
import { hasRecentBillableDownloadForJobFile } from "@/lib/usage/supabase-download-usage";

type DownloadRateKeyType = "user" | "session" | "ip" | "fallback";

function getAuthenticatedUserIdFromRequest(request: NextRequest): string | null {
  const raw =
    request.headers.get("x-authenticated-user-id") ??
    request.headers.get("x-user-id") ??
    request.headers.get("x-auth-user-id");
  const normalized = raw?.trim();
  return normalized ? normalized : null;
}

function resolveFinalDownloadRateIdentity(params: {
  authenticatedUserId: string | null;
  sessionId: string | null;
  clientIp: string;
}): { key: string; keyType: DownloadRateKeyType } {
  if (params.authenticatedUserId) {
    return { key: `user:${params.authenticatedUserId}`, keyType: "user" };
  }
  if (params.sessionId) {
    return { key: `session:${params.sessionId}`, keyType: "session" };
  }
  if (params.clientIp && params.clientIp !== "unknown") {
    return { key: `ip:${params.clientIp}`, keyType: "ip" };
  }
  return { key: "fallback:download-identity-unavailable", keyType: "fallback" };
}

function getFilenameParam(request: NextRequest, fallbackExt = "wav"): string {
  const fallback = `audio-file.${fallbackExt}`;
  const raw = request.nextUrl.searchParams.get("as");
  if (!raw) return fallback;
  return raw.replace(/[^a-zA-Z0-9._-]/g, "_");
}

function wantsMp3MasterFormat(request: NextRequest): boolean {
  return request.nextUrl.searchParams.get("format") === "mp3";
}

function noMastersRemainingPayload(planId: PlanId) {
  const isFree = planId === "free";
  return {
    error: "no_masters_remaining" as const,
    upgrade_url: "/pricing",
    message: isFree
      ? `You've used your ${FREE_WAV_DOWNLOADS_PER_MONTH} free WAV download for this month. Subscribe for more monthly WAV exports, or add a 5-master credit pack for $4.`
      : "No masters remaining. Upgrade or get 5 more for $4."
  };
}

export async function GET(request: NextRequest) {
  try {
    await cleanupExpiredTempFiles();

    const fileId = request.nextUrl.searchParams.get("fileId");
    const jobId = request.nextUrl.searchParams.get("jobId");
    const wantsMp3Master = wantsMp3MasterFormat(request);
    const filename = getFilenameParam(request, wantsMp3Master ? "mp3" : "wav");
    const forceDownload = request.nextUrl.searchParams.get("dl") === "1";

    let record =
      (fileId && !wantsMp3Master ? await resolveTempRecord(fileId) : null) ??
      (jobId ? await findLatestRecordForJob(jobId, wantsMp3Master ? "mastered_mp3" : "mastered") : null);

    if (wantsMp3Master && (!record || record.kind !== "mastered_mp3")) {
      const wavRecord =
        (fileId ? await resolveTempRecord(fileId) : null) ??
        (jobId ? await findLatestRecordForJob(jobId, "mastered") : null);
      if (!wavRecord || wavRecord.kind !== "mastered") {
        return NextResponse.json({ error: "File not found or expired." }, { status: 404 });
      }

      const resolvedJobId = wavRecord.jobId;
      const isAdaptiveMasterJob = resolvedJobId.startsWith("adaptive_");
      let masteredUnlock: MasterJobUnlockRow | null = null;
      if (isSupabaseConfigured()) {
        try {
          masteredUnlock = await getMasterJobUnlock(resolvedJobId);
        } catch (error) {
          const detail = error instanceof Error ? error.message : "Unknown error";
          console.error("[api/download] master_job_unlocks lookup failed", { jobId: resolvedJobId, detail });
          return NextResponse.json({ error: "Download verification failed." }, { status: 500 });
        }
        if (!masteredUnlock || masteredUnlock.fileId !== wavRecord.id) {
          if (isJobUnlocked(resolvedJobId)) {
            masteredUnlock = null;
          } else {
            return NextResponse.json({ error: "Email required before full download." }, { status: 403 });
          }
        }
      } else if (!isJobUnlocked(resolvedJobId)) {
        return NextResponse.json({ error: "Email required before full download." }, { status: 403 });
      }

      const sessionPrep = prepareSessionForRequest(request);
      const user = buildApiUser(request, sessionPrep.sessionId);

      if (forceDownload && isSupabaseConfigured() && masteredUnlock) {
        if (!masteredUnlock.emailVerifiedAt) {
          const clientIp = getClientIp(request);
          logAbuseGuard("unverified_master_download_blocked", {
            endpoint: "/api/download",
            jobId: resolvedJobId,
            fileId: wavRecord.id,
            ipHash: hashIdentifier(clientIp)
          });
          const res = NextResponse.json(
            { error: "Please confirm email access before downloading your master." },
            { status: 403 }
          );
          attachSessionCookieIfNeeded(res, sessionPrep);
          return res;
        }

        try {
          const probe = await probeAudioStream(wavRecord.filePath);
          if (probe.codec_name === "pcm_f32le") {
            await finalizeMasteredWavDelivery({
              jobId: resolvedJobId,
              sourcePath: wavRecord.filePath,
              normalizedEmail: masteredUnlock.normalizedEmail,
              endpoint: "/api/master",
              user,
              emailSource: "verified_cookie"
            });
          }
        } catch (error) {
          const detail = error instanceof Error ? error.message : "Unknown error";
          console.error("[api/download] wav finalize before mp3 export failed", {
            jobId: resolvedJobId,
            fileId: wavRecord.id,
            detail
          });
          return NextResponse.json({ error: "Unable to prepare your master for download." }, { status: 500 });
        }
      }

      try {
        record = await ensureMasteredMp3ForJob({
          jobId: resolvedJobId,
          wavSourcePath: wavRecord.filePath
        });
      } catch (error) {
        const detail = error instanceof Error ? error.message : "Unknown error";
        console.error("[api/download] mp3 master lazy export failed", {
          jobId: resolvedJobId,
          fileId: wavRecord.id,
          detail
        });
        return NextResponse.json({ error: "Unable to prepare MP3 master for download." }, { status: 500 });
      }
    }

    if (!record) {
      return NextResponse.json({ error: "File not found or expired." }, { status: 404 });
    }

    const isMasteredWavAsset = record.kind === "mastered";
    /** Adaptive final WAV uses export-access + billing_entitlements; do not consume standard monthly / credit-pack quota. */
    const isAdaptiveMasterJob = record.jobId.startsWith("adaptive_");
    let masteredUnlock: MasterJobUnlockRow | null = null;
    if (isMasteredWavAsset || record.kind === "mastered_mp3") {
      if (isSupabaseConfigured()) {
        try {
          masteredUnlock = await getMasterJobUnlock(record.jobId);
        } catch (error) {
          const detail = error instanceof Error ? error.message : "Unknown error";
          console.error("[api/download] master_job_unlocks lookup failed", { jobId: record.jobId, detail });
          return NextResponse.json({ error: "Download verification failed." }, { status: 500 });
        }
        if (!masteredUnlock || (isMasteredWavAsset && masteredUnlock.fileId !== record.id)) {
          if (isJobUnlocked(record.jobId)) {
            masteredUnlock = null;
          } else {
            return NextResponse.json({ error: "Email required before full download." }, { status: 403 });
          }
        }
      } else if (!isJobUnlocked(record.jobId)) {
        return NextResponse.json({ error: "Email required before full download." }, { status: 403 });
      }
    }

    const sessionPrep = prepareSessionForRequest(request);
    const clientIp = getClientIp(request);
    const authenticatedUserId = getAuthenticatedUserIdFromRequest(request);
    const rateIdentity = resolveFinalDownloadRateIdentity({
      authenticatedUserId,
      sessionId: sessionPrep.sessionId,
      clientIp
    });
    const user = buildApiUser(request, sessionPrep.sessionId);
    const adminEntitlementBypass = isAdminEntitlementOverrideEmail(masteredUnlock?.normalizedEmail);
    const adminBypass = isMasterAdminBypassGranted(request) || adminEntitlementBypass;
    const freePlanCap = resolveFreePlanWavCap(PLAN_DEFINITIONS.free.monthlyMastersLimit ?? 1);
    const quotaRecord = { kind: record.kind, mime: record.mime };
    const enforceWavQuota = shouldEnforceWavDownloadQuota({
      record: quotaRecord,
      forceDownload,
      isAdaptiveMasterJob,
      adminBypass
    });

    // Only explicit attachment downloads of the final mastered WAV consume plan usage (not MP3 previews or full MP3 masters).
    if (isMasteredWavAsset && forceDownload) {
      const finalDownloadRate = consumeRateLimit({
        bucket: "master_final_download_ip",
        key: rateIdentity.key,
        limit: 10,
        windowMs: 60 * 60 * 1000
      });
      if (process.env.DOWNLOAD_RATE_LIMIT_DEBUG === "true") {
        console.log(
          JSON.stringify({
            scope: "download_rate_limit",
            event: "identity_selected",
            bucket: "master_final_download_ip",
            keyType: rateIdentity.keyType,
            hasClientIp: clientIp !== "unknown",
            hasSessionId: Boolean(sessionPrep.sessionId),
            hasAuthenticatedUser: Boolean(authenticatedUserId)
          })
        );
      }
      if (!finalDownloadRate.allowed) {
        logAbuseGuard("rate_limited", {
          endpoint: "/api/download",
          bucket: "master_final_download_ip",
          ipHash: hashIdentifier(clientIp),
          jobId: record.jobId,
          fileId: record.id,
          retryAfterSec: finalDownloadRate.retryAfterSec
        });
        const res = tooManyAttemptsResponse(finalDownloadRate.retryAfterSec);
        attachSessionCookieIfNeeded(res, sessionPrep);
        return res;
      }

      if (isSupabaseConfigured() && masteredUnlock && !masteredUnlock.emailVerifiedAt) {
        logAbuseGuard("unverified_master_download_blocked", {
          endpoint: "/api/download",
          jobId: record.jobId,
          fileId: record.id,
          ipHash: hashIdentifier(clientIp)
        });
        const res = NextResponse.json(
          { error: "Please confirm email access before downloading your master." },
          { status: 403 }
        );
        attachSessionCookieIfNeeded(res, sessionPrep);
        return res;
      }

      if (isSupabaseConfigured() && masteredUnlock) {
        try {
          const hasRecent = await hasRecentBillableDownloadForJobFile(
            masteredUnlock.normalizedEmail,
            record.jobId,
            record.id
          );
          const skipStandardQuota = isAdaptiveMasterJob;
          if (!hasRecent && enforceWavQuota) {
            if (skipStandardQuota) {
              console.log("[api/download] adaptive final export: skip standard monthly/credit quota", {
                jobId: record.jobId
              });
            } else {
              const entitlements = await getEntitlementsForUser(user, {
                normalizedEmail: masteredUnlock.normalizedEmail
              });
              const compareUnlockToStripeCustomer =
                !entitlements.canDownload || process.env.BILLING_DIAGNOSTIC_LOGS === "1";
              if (compareUnlockToStripeCustomer) {
                await warnIfUnlockEmailDiffersFromStripeCustomerEmail({
                  unlockNormalizedEmail: masteredUnlock.normalizedEmail,
                  stripeCustomerId: entitlements.stripeCustomerId,
                  jobId: record.jobId,
                  fileId: record.id
                });
              }
              if (!entitlements.canDownload) {
                console.log(
                  JSON.stringify({
                    scope: "download_authorization",
                    event: "denied_quota",
                    userId: user.id,
                    userEmail: user.email,
                    unlockEmail: masteredUnlock.normalizedEmail,
                    jobId: record.jobId,
                    fileId: record.id,
                    planId: entitlements.planId,
                    subscriptionStatus: entitlements.subscriptionStatus,
                    stripeCustomerId: entitlements.stripeCustomerId,
                    stripeSubscriptionId: entitlements.stripeSubscriptionId,
                    stripePriceId: entitlements.stripePriceId,
                    mastersUsedThisPeriod: entitlements.mastersUsedThisPeriod,
                    monthlyMastersLimit: entitlements.monthlyMastersLimit,
                    remainingMasters: entitlements.remainingMasters,
                    entitled: false,
                    requiresCheckout:
                      Boolean(masteredUnlock.normalizedEmail) &&
                      !entitlements.canDownload &&
                      (entitlements.planId === "free" || !entitlements.stripeSubscriptionId),
                    reason: "getEntitlementsForUser_returned_canDownload_false"
                  })
                );
                const res = NextResponse.json(noMastersRemainingPayload(entitlements.planId), { status: 403 });
                attachSessionCookieIfNeeded(res, sessionPrep);
                return res;
              }
            }
          }
        } catch (error) {
          const detail = error instanceof Error ? error.message : "Unknown error";
          console.error("[api/download] download entitlement check failed", { jobId: record.jobId, detail });
          return NextResponse.json({ error: "Unable to verify download allowance." }, { status: 500 });
        }
      } else if (isJobUnlocked(record.jobId) && enforceWavQuota) {
        const { allowed } = tryConsumeLocalBillableDownload(
          user.sessionId,
          record.jobId,
          record.id,
          freePlanCap,
          adminBypass
        );
        if (!allowed) {
          const res = NextResponse.json(noMastersRemainingPayload("free"), { status: 403 });
          attachSessionCookieIfNeeded(res, sessionPrep);
          return res;
        }
      }
    }

    const fileStats = await stat(record.filePath);

    if (isMasteredWavAsset && forceDownload && masteredUnlock) {
      try {
        const probe = await probeAudioStream(record.filePath);
        if (probe.codec_name === "pcm_f32le") {
          await finalizeMasteredWavDelivery({
            jobId: record.jobId,
            sourcePath: record.filePath,
            normalizedEmail: masteredUnlock.normalizedEmail,
            endpoint: "/api/master",
            user,
            emailSource: "verified_cookie"
          });
        }
      } catch (error) {
        const detail = error instanceof Error ? error.message : "Unknown error";
        console.error("[api/download] wav delivery finalize fallback failed", {
          jobId: record.jobId,
          fileId: record.id,
          detail
        });
        return NextResponse.json({ error: "Unable to prepare your master for download." }, { status: 500 });
      }
    }

    const refreshedStats = await stat(record.filePath);
    const headers: Record<string, string> = {
      "Content-Type": record.mime,
      "Content-Length": String(refreshedStats.size),
      "Cache-Control": "no-store",
      "Content-Disposition": `${forceDownload ? "attachment" : "inline"}; filename="${filename}"`,
      "Accept-Ranges": "bytes"
    };

    if (isMasteredWavAsset && forceDownload && isSupabaseConfigured() && masteredUnlock) {
      try {
        const recorded = await recordMasteredDownloadAttempt({
          normalizedEmail: masteredUnlock.normalizedEmail,
          originalEmail: masteredUnlock.originalEmail ?? masteredUnlock.normalizedEmail,
          jobId: record.jobId,
          fileId: record.id,
          requestMetadata: {
            userAgent: request.headers.get("user-agent") ?? undefined,
            accept: request.headers.get("accept") ?? undefined,
            dl: forceDownload ? 1 : 0
          }
        });
        if (!adminBypass && recorded.countedUnique && enforceWavQuota) {
          const currentEntitlements = await getEntitlementsForUser(user, {
            normalizedEmail: masteredUnlock.normalizedEmail
          });
          if (
            currentEntitlements.remainingMonthlyMasters !== null &&
            currentEntitlements.remainingMonthlyMasters <= 0
          ) {
            await consumeCreditPackMaster(masteredUnlock.normalizedEmail, {
              jobId: record.jobId,
              fileId: record.id
            });
          }
        }
        if (recorded.countedUnique) {
          await incrementProductMetric("downloads");
        }
      } catch (error) {
        const detail = error instanceof Error ? error.message : "Unknown error";
        console.error("[api/download] record_mastered_download_attempt failed", {
          jobId: record.jobId,
          fileId: record.id,
          detail
        });
        const res = NextResponse.json({ error: "Unable to record download. Please try again." }, { status: 500 });
        attachSessionCookieIfNeeded(res, sessionPrep);
        return res;
      }
    }

    const maxBuffered = 60 * 1024 * 1024;
    if (refreshedStats.size <= maxBuffered) {
      const buffer = await readFile(record.filePath);
      const res = new NextResponse(new Uint8Array(buffer), { headers });
      attachSessionCookieIfNeeded(res, sessionPrep);
      return res;
    }

    const stream = createReadStream(record.filePath);
    const webStream = Readable.toWeb(stream) as ReadableStream;
    const res = new NextResponse(webStream, { headers });
    attachSessionCookieIfNeeded(res, sessionPrep);
    return res;
  } catch (error) {
    const detail = error instanceof Error ? error.message : "Unknown download error.";
    return NextResponse.json({ error: `Unable to download file. ${detail}` }, { status: 500 });
  }
}
