/**
 * Option A — Adaptive: free preview via POST /api/master-ai; paid export gated here.
 *
 * Audit (pre-change behavior, for reference):
 * - Preview was gated in POST /api/master-ai (billing email + resolveAdaptiveEntitlementForEmail) and in
 *   components/upload-form.tsx (“Unlock Adaptive” → GET /api/adaptive-access → redirect to /pricing).
 * - Checkout was triggered from that pre-preview path and from /pricing (POST /api/billing/checkout).
 * - Standard final WAV: POST /api/capture-email → master_job_unlocks → GET /api/download?...&dl=1
 *   (app/api/download/route.ts + components/email-capture-form.tsx).
 * - Adaptive final used the same download path after master-ai returned download.fileId; unlock was not
 *   separated from standard email capture until this route + AdaptiveExportGate.
 */
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { resolveAdaptiveEntitlementForEmail } from "@/lib/billing/adaptive-resolve";
import { isAdaptiveDevBypassEnabled } from "@/lib/billing/adaptive-dev-bypass";
import { normalizeBillingEmail } from "@/lib/billing/email";
import { reconcileCheckoutSessionForAdaptiveRecheck } from "@/lib/billing/reconcile-from-checkout-session";
import { markJobDownloadUnlocked } from "@/lib/email/capture-email";
import { normalizeCaptureEmail } from "@/lib/email/normalize-capture-email";
import { upsertMasterJobUnlock } from "@/lib/downloads/master-job-unlocks";
import { upsertLeadInSupabase } from "@/lib/leads/supabase-leads";
import { attachSessionCookieIfNeeded, prepareSessionForRequest } from "@/lib/identity/session-cookie";
import { resolveTempRecord } from "@/lib/storage/temp-files";
import {
  getSupabaseAdminConfig,
  getSupabaseKeyJwtRole,
  isSupabaseConfigured
} from "@/lib/supabase/admin";

const BodySchema = z.object({
  email: z.string(),
  jobId: z.string().min(4),
  fileId: z.string().min(4),
  /** When true, may reconcile Stripe checkout session (if id + email match) then re-check entitlements. Never creates checkout. */
  recheck: z.boolean().optional(),
  /** Stripe Checkout Session id (`cs_...`) from success URL; only used when `recheck` is true. */
  checkoutSessionId: z.string().optional()
});

function buildAdaptiveDownloadUrl(fileId: string): string {
  return `/api/download?fileId=${fileId}&as=adaptive-master.wav&dl=1`;
}

export async function POST(request: NextRequest) {
  const sessionPrep = prepareSessionForRequest(request);
  const isDevBypass = process.env.NODE_ENV !== "production" && isAdaptiveDevBypassEnabled();

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    const res = NextResponse.json(
      { error: "Expected JSON body.", entitled: false, requiresCheckout: true, status: "invalid_json" },
      { status: 400 }
    );
    attachSessionCookieIfNeeded(res, sessionPrep);
    return res;
  }

  const parsed = BodySchema.safeParse(body);
  if (!parsed.success) {
    const res = NextResponse.json(
      {
        error: "Valid email, jobId, and fileId are required.",
        entitled: false,
        requiresCheckout: true,
        status: "validation_error"
      },
      { status: 400 }
    );
    attachSessionCookieIfNeeded(res, sessionPrep);
    return res;
  }

  console.log("[adaptive-export] adaptive export requested", {
    jobId: parsed.data.jobId,
    fileId: parsed.data.fileId
  });

  if (!parsed.data.jobId.startsWith("adaptive_")) {
    console.log("[adaptive-export] rejected: not an adaptive job", { jobId: parsed.data.jobId });
    const res = NextResponse.json(
      {
        error: "Invalid adaptive export job.",
        entitled: false,
        requiresCheckout: false,
        status: "invalid_job"
      },
      { status: 400 }
    );
    attachSessionCookieIfNeeded(res, sessionPrep);
    return res;
  }

  const hintedRecord = await resolveTempRecord(parsed.data.fileId);
  if (!hintedRecord || hintedRecord.jobId !== parsed.data.jobId || hintedRecord.kind !== "mastered") {
    console.log("[adaptive-export] rejected: temp token mismatch", {
      jobId: parsed.data.jobId,
      fileId: parsed.data.fileId
    });
    const res = NextResponse.json(
      {
        error: "Invalid or expired adaptive master. Run Adaptive preview again.",
        entitled: false,
        requiresCheckout: false,
        status: "invalid_file"
      },
      { status: 400 }
    );
    attachSessionCookieIfNeeded(res, sessionPrep);
    return res;
  }

  const emailNorm = normalizeCaptureEmail(parsed.data.email);
  if (!emailNorm) {
    const res = NextResponse.json(
      {
        error: "Valid billing email required.",
        entitled: false,
        requiresCheckout: true,
        status: "invalid_email"
      },
      { status: 400 }
    );
    attachSessionCookieIfNeeded(res, sessionPrep);
    return res;
  }

  const recheckRequested = parsed.data.recheck === true;
  const submittedBillingKey = normalizeBillingEmail(emailNorm) ?? emailNorm;
  let syncAttempted = false;

  if (recheckRequested) {
    const sessionId = parsed.data.checkoutSessionId?.trim();
    console.log("[adaptive-export] re-check requested", {
      jobId: parsed.data.jobId,
      hasCheckoutSessionId: Boolean(sessionId?.startsWith("cs_"))
    });

    if (sessionId?.startsWith("cs_")) {
      try {
        const syncResult = await reconcileCheckoutSessionForAdaptiveRecheck(sessionId, submittedBillingKey);
        syncAttempted = true;
        if (syncResult.reconciled) {
          console.log("[adaptive-export] billing sync attempted during re-check", { reconciled: true });
        } else if (syncResult.syncSkippedReason === "email_mismatch") {
          console.log(
            "[adaptive-export] re-check: skipped Stripe sync (checkout session email does not match billing email)"
          );
        } else {
          console.log("[adaptive-export] billing sync during re-check skipped", {
            reason: syncResult.syncSkippedReason ?? "unknown"
          });
        }
      } catch (error) {
        const detail = error instanceof Error ? error.message : "unknown";
        console.error("[adaptive-export] re-check: billing sync failed", { detail });
      }
    }
  }

  const resolved = await resolveAdaptiveEntitlementForEmail(emailNorm);
  const entitled = isDevBypass || resolved.entitled;

  console.log("[adaptive-export] adaptive export entitlement check", {
    jobId: parsed.data.jobId,
    entitled,
    reason: resolved.reason
  });

  if (isDevBypass) {
    console.log("[adaptive-export] dev bypass: treating as entitled");
  }

  if (!entitled) {
    if (recheckRequested) {
      console.log("[adaptive-export] entitlement still missing after re-check", { reason: resolved.reason });
    } else {
      console.log("[adaptive-export] adaptive export requires checkout", { reason: resolved.reason });
    }
    const res = NextResponse.json({
      entitled: false,
      requiresCheckout: true,
      canRetry: true,
      downloadUrl: null as string | null,
      checkoutUrl: null as string | null,
      status: "checkout_required",
      reason: resolved.reason,
      ...(recheckRequested ? { syncAttempted } : {})
    });
    attachSessionCookieIfNeeded(res, sessionPrep);
    return res;
  }

  if (recheckRequested) {
    console.log("[adaptive-export] entitlement found after re-check", { jobId: parsed.data.jobId });
  }

  console.log("[adaptive-export] adaptive export already entitled; unlocking", { jobId: parsed.data.jobId });

  const isLocalDev = process.env.NODE_ENV !== "production";
  const masteredFileId = hintedRecord.id;
  const originalEmailTrimmed = parsed.data.email.trim();

  if (!isSupabaseConfigured()) {
    if (isLocalDev) {
      markJobDownloadUnlocked(parsed.data.jobId);
      const res = NextResponse.json({
        entitled: true,
        requiresCheckout: false,
        downloadUrl: buildAdaptiveDownloadUrl(masteredFileId),
        checkoutUrl: null as string | null,
        status: "unlocked",
        reason: isDevBypass ? "dev_bypass" : "adaptive_entitlement_active"
      });
      attachSessionCookieIfNeeded(res, sessionPrep);
      return res;
    }
    const res = NextResponse.json(
      {
        error: "Export unlock is temporarily unavailable.",
        entitled: false,
        requiresCheckout: false,
        checkoutUrl: null as string | null,
        status: "supabase_unconfigured"
      },
      { status: 500 }
    );
    attachSessionCookieIfNeeded(res, sessionPrep);
    return res;
  }

  const cfg = getSupabaseAdminConfig();
  const jwtRole = getSupabaseKeyJwtRole(cfg.serviceRoleKey);
  if (jwtRole !== null && jwtRole !== "service_role") {
    const res = NextResponse.json(
      {
        error: "Server misconfiguration.",
        entitled: false,
        requiresCheckout: false,
        checkoutUrl: null as string | null,
        status: "misconfigured"
      },
      { status: 500 }
    );
    attachSessionCookieIfNeeded(res, sessionPrep);
    return res;
  }

  try {
    await upsertMasterJobUnlock({
      jobId: parsed.data.jobId,
      fileId: masteredFileId,
      normalizedEmail: emailNorm,
      originalEmail: originalEmailTrimmed || emailNorm
    });
  } catch (error) {
    const detail = error instanceof Error ? error.message : "Unknown error";
    console.error("[adaptive-export] master_job_unlocks upsert failed", { detail });
    if (isLocalDev) {
      markJobDownloadUnlocked(parsed.data.jobId);
      const res = NextResponse.json({
        entitled: true,
        requiresCheckout: false,
        downloadUrl: buildAdaptiveDownloadUrl(masteredFileId),
        checkoutUrl: null as string | null,
        status: "unlocked",
        reason: "local_fallback_db_error",
        warning: "Local dev: unlock fell back to in-memory because Supabase upsert failed."
      });
      attachSessionCookieIfNeeded(res, sessionPrep);
      return res;
    }
    const res = NextResponse.json(
      {
        error: "Unable to unlock export right now. Please try again.",
        entitled: false,
        requiresCheckout: false,
        checkoutUrl: null as string | null,
        status: "unlock_failed"
      },
      { status: 500 }
    );
    attachSessionCookieIfNeeded(res, sessionPrep);
    return res;
  }

  try {
    await upsertLeadInSupabase({ email: emailNorm });
  } catch (error) {
    const detail = error instanceof Error ? error.message : "Unknown error";
    console.error("[adaptive-export] lead upsert failed", { detail });
    if (!isLocalDev) {
      const res = NextResponse.json(
        {
          error: "Unable to save email right now. Please try again.",
          entitled: false,
          requiresCheckout: false,
          checkoutUrl: null as string | null,
          status: "lead_failed"
        },
        { status: 500 }
      );
      attachSessionCookieIfNeeded(res, sessionPrep);
      return res;
    }
  }

  markJobDownloadUnlocked(parsed.data.jobId);
  console.log("[adaptive-export] adaptive export unlocked after entitlement success", { jobId: parsed.data.jobId });

  const res = NextResponse.json({
    entitled: true,
    requiresCheckout: false,
    downloadUrl: buildAdaptiveDownloadUrl(masteredFileId),
    checkoutUrl: null as string | null,
    status: "unlocked",
    reason: isDevBypass ? "dev_bypass" : "adaptive_entitlement_active"
  });
  attachSessionCookieIfNeeded(res, sessionPrep);
  return res;
}
