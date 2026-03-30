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
import { isSupabaseConfigured } from "@/lib/supabase/admin";
import { FREE_MASTERS_PER_MONTH, consumeCreditPackMaster, getEntitlementsForUser } from "@/lib/subscriptions/entitlements";
import { isMasterAdminBypassGranted } from "@/lib/subscriptions/master-admin-bypass";
import { PLAN_DEFINITIONS } from "@/lib/subscriptions/plans";
import { tryConsumeLocalBillableDownload } from "@/lib/usage/local-download-usage";
import { hasRecentBillableDownloadForJobFile } from "@/lib/usage/supabase-download-usage";

function getFilenameParam(request: NextRequest): string {
  const fallback = "audio-file.wav";
  const raw = request.nextUrl.searchParams.get("as");
  if (!raw) return fallback;
  return raw.replace(/[^a-zA-Z0-9._-]/g, "_");
}

export async function GET(request: NextRequest) {
  try {
    await cleanupExpiredTempFiles();

    const fileId = request.nextUrl.searchParams.get("fileId");
    const jobId = request.nextUrl.searchParams.get("jobId");
    const filename = getFilenameParam(request);
    const forceDownload = request.nextUrl.searchParams.get("dl") === "1";

    const record =
      (fileId ? await resolveTempRecord(fileId) : null) ??
      (jobId ? await findLatestRecordForJob(jobId, "mastered") : null);

    if (!record) {
      return NextResponse.json({ error: "File not found or expired." }, { status: 404 });
    }

    const isMasteredAsset = record.kind === "mastered";
    let masteredUnlock: MasterJobUnlockRow | null = null;
    if (isMasteredAsset) {
      if (isSupabaseConfigured()) {
        try {
          masteredUnlock = await getMasterJobUnlock(record.jobId);
        } catch (error) {
          const detail = error instanceof Error ? error.message : "Unknown error";
          console.error("[api/download] master_job_unlocks lookup failed", { jobId: record.jobId, detail });
          return NextResponse.json({ error: "Download verification failed." }, { status: 500 });
        }
        if (!masteredUnlock || masteredUnlock.fileId !== record.id) {
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
    const user = buildApiUser(request, sessionPrep.sessionId);
    const adminBypass = isMasterAdminBypassGranted(request);
    const freePlanCap = Math.min(PLAN_DEFINITIONS.free.monthlyMastersLimit, FREE_MASTERS_PER_MONTH);

    // Only explicit attachment downloads of the final master consume plan usage (not inline playback / previews).
    if (isMasteredAsset && forceDownload) {
      if (isSupabaseConfigured() && masteredUnlock) {
        try {
          const hasRecent = await hasRecentBillableDownloadForJobFile(
            masteredUnlock.normalizedEmail,
            record.jobId,
            record.id
          );
          if (!hasRecent && !adminBypass) {
            const entitlements = await getEntitlementsForUser(user, {
              normalizedEmail: masteredUnlock.normalizedEmail
            });
            if (!entitlements.canDownload) {
              const res = NextResponse.json(
                {
                  error: "no_masters_remaining",
                  upgrade_url: "/pricing"
                },
                { status: 403 }
              );
              attachSessionCookieIfNeeded(res, sessionPrep);
              return res;
            }
          }
        } catch (error) {
          const detail = error instanceof Error ? error.message : "Unknown error";
          console.error("[api/download] download entitlement check failed", { jobId: record.jobId, detail });
          return NextResponse.json({ error: "Unable to verify download allowance." }, { status: 500 });
        }
      } else if (isJobUnlocked(record.jobId)) {
        const { allowed } = tryConsumeLocalBillableDownload(
          user.sessionId,
          record.jobId,
          record.id,
          freePlanCap,
          adminBypass
        );
        if (!allowed) {
          const res = NextResponse.json(
            {
              error: "no_masters_remaining",
              upgrade_url: "/pricing"
            },
            { status: 403 }
          );
          attachSessionCookieIfNeeded(res, sessionPrep);
          return res;
        }
      }
    }

    const fileStats = await stat(record.filePath);
    const headers: Record<string, string> = {
      "Content-Type": record.mime,
      "Content-Length": String(fileStats.size),
      "Cache-Control": "no-store",
      "Content-Disposition": `${forceDownload ? "attachment" : "inline"}; filename="${filename}"`,
      "Accept-Ranges": "bytes"
    };

    if (isMasteredAsset && forceDownload && isSupabaseConfigured() && masteredUnlock) {
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
        if (!adminBypass && recorded.countedUnique) {
          const currentEntitlements = await getEntitlementsForUser(user, {
            normalizedEmail: masteredUnlock.normalizedEmail
          });
          if ((currentEntitlements.remainingMonthlyMasters ?? 0) <= 0) {
            await consumeCreditPackMaster(masteredUnlock.normalizedEmail, {
              jobId: record.jobId,
              fileId: record.id
            });
          }
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
    if (fileStats.size <= maxBuffered) {
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
