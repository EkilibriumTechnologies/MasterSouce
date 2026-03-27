import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { attachSessionCookieIfNeeded, prepareSessionForRequest } from "@/lib/identity/session-cookie";
import { markJobDownloadUnlocked } from "@/lib/email/capture-email";
import { upsertLeadInSupabase } from "@/lib/leads/supabase-leads";
import { findLatestRecordForJob, resolveTempRecord } from "@/lib/storage/temp-files";
import {
  getSupabaseAdminConfig,
  getSupabaseKeyJwtRole,
  isSupabaseConfigured
} from "@/lib/supabase/admin";

const BodySchema = z.object({
  email: z.string(),
  jobId: z.string().min(4),
  fileId: z.string().min(4)
});

const emailShape = z.string().email();

/**
 * Normalizes plain emails plus accidental markdown / mailto payloads
 * (e.g. `[user@x.com](mailto:user@x.com)` from pasted rich text).
 */
function normalizeCaptureEmail(raw: string): string | null {
  let s = raw.trim();
  const md = /^\[([^\]]*)\]\(mailto:([^)]+)\)$/i.exec(s);
  if (md) {
    s = md[2].trim();
  } else {
    const mdLoose = /\[([^\]]*)\]\(mailto:([^)]+)\)/i.exec(s);
    if (mdLoose) {
      s = mdLoose[2].trim();
    }
  }
  if (/^mailto:/i.test(s)) {
    s = s.replace(/^mailto:/i, "").trim();
  }
  s = s.toLowerCase();
  const parsed = emailShape.safeParse(s);
  return parsed.success ? parsed.data : null;
}

/**
 * GET does not capture email. Browsers get HTML; clients requesting JSON still get JSON.
 */
export async function GET(request: NextRequest) {
  const accept = request.headers.get("accept") ?? "";
  if (accept.includes("text/html")) {
    const html = `<!DOCTYPE html>
<html lang="en">
<head><meta charset="utf-8"/><meta name="viewport" content="width=device-width, initial-scale=1"/><title>Email capture API</title></head>
<body style="font-family:system-ui,sans-serif;max-width:42rem;margin:2rem auto;padding:0 1rem;line-height:1.5;color:#1a1a2e">
<p>This URL is an API endpoint. Email is saved when your app sends a <strong>POST</strong> request with JSON:</p>
<pre style="background:#f4f4f8;padding:1rem;border-radius:8px;overflow:auto">{ "email": "…", "jobId": "…", "fileId": "…" }</pre>
<p>Open your site and use the download form there—do not expect this page to do anything by itself.</p>
</body></html>`;
    return new NextResponse(html, {
      headers: { "Content-Type": "text/html; charset=utf-8" }
    });
  }
  return NextResponse.json({
    message: "Use POST with JSON: { email, jobId, fileId }. GET is not used for email capture."
  });
}

export async function POST(request: NextRequest) {
  console.log("[railway-env] SUPABASE_URL=" + (process.env.SUPABASE_URL ?? "MISSING") + " NEXT_PUBLIC=" + (process.env.NEXT_PUBLIC_SUPABASE_URL ?? "MISSING") + " SERVICE_KEY=" + (process.env.SUPABASE_SERVICE_ROLE_KEY ? "PRESENT" : "MISSING") + " TEST_VAR=" + (process.env.TEST_VAR ?? "MISSING"));
  try {
    const sessionPrep = prepareSessionForRequest(request);
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      const res = NextResponse.json(
        { error: "Expected JSON body.", code: "INVALID_JSON" },
        { status: 400 }
      );
      attachSessionCookieIfNeeded(res, sessionPrep);
      return res;
    }
    const parsed = BodySchema.safeParse(body);
    if (!parsed.success) {
      console.error("[capture-email] Request body validation failed", {
        issues: parsed.error.flatten()
      });
      const res = NextResponse.json(
        { error: "Valid email, jobId, and fileId are required.", code: "VALIDATION_BODY" },
        { status: 400 }
      );
      attachSessionCookieIfNeeded(res, sessionPrep);
      return res;
    }

    const email = normalizeCaptureEmail(parsed.data.email);
    if (!email) {
      console.error("[capture-email] Email rejected after normalization", {
        rawLength: parsed.data.email.length,
        rawPreview: parsed.data.email.slice(0, 160)
      });
      const res = NextResponse.json(
        { error: "Valid email required.", code: "VALIDATION_EMAIL" },
        { status: 400 }
      );
      attachSessionCookieIfNeeded(res, sessionPrep);
      return res;
    }

    if (!isSupabaseConfigured()) {
      const config = getSupabaseAdminConfig();
      console.error("[capture-email] Supabase is not configured. Missing URL or SUPABASE_SERVICE_ROLE_KEY.", {
        hasUrl: Boolean(config.url),
        hasServiceRoleKey: Boolean(config.serviceRoleKey)
      });
      const res = NextResponse.json(
        {
          error: "Email capture is temporarily unavailable.",
          code: "SUPABASE_NOT_CONFIGURED",
          hint:
            "Set SUPABASE_SERVICE_ROLE_KEY and SUPABASE_URL (preferred) on the host. " +
            "NEXT_PUBLIC_SUPABASE_URL is also accepted as the project URL for server bootstrap."
        },
        { status: 500 }
      );
      attachSessionCookieIfNeeded(res, sessionPrep);
      return res;
    }

    const cfg = getSupabaseAdminConfig();
    const jwtRole = getSupabaseKeyJwtRole(cfg.serviceRoleKey);
    if (jwtRole !== null && jwtRole !== "service_role") {
      console.error("[capture-email] SUPABASE_SERVICE_ROLE_KEY is not the service_role secret.", {
        jwtRole,
        hint: "Supabase → Project Settings → API → service_role (secret), not anon."
      });
      const res = NextResponse.json(
        {
          error: "Email capture is misconfigured on the server.",
          code: "SUPABASE_WRONG_JWT_ROLE",
          hint: "Use the service_role key in SUPABASE_SERVICE_ROLE_KEY."
        },
        { status: 500 }
      );
      attachSessionCookieIfNeeded(res, sessionPrep);
      return res;
    }
    try {
      await upsertLeadInSupabase({ email });
    } catch (error) {
      const detail = error instanceof Error ? error.message : "Unknown Supabase error";
      console.error("[capture-email] Failed to upsert lead into public.leads", {
        email,
        detail,
        error
      });
      const res = NextResponse.json(
        {
          error: "Unable to save email right now. Please try again.",
          code: "SUPABASE_UPSERT_FAILED",
          hint: "Check Railway logs for PostgREST details; confirm RLS allows service_role or disable RLS for leads."
        },
        { status: 500 }
      );
      attachSessionCookieIfNeeded(res, sessionPrep);
      return res;
    }

    const hintedRecord = await resolveTempRecord(parsed.data.fileId);
    if (!hintedRecord || hintedRecord.jobId !== parsed.data.jobId || hintedRecord.kind !== "mastered") {
      console.error("[capture-email] Temp file token validation failed", {
        jobId: parsed.data.jobId,
        fileId: parsed.data.fileId,
        resolvedJobId: hintedRecord?.jobId,
        resolvedKind: hintedRecord?.kind,
        hasHintedRecord: Boolean(hintedRecord)
      });
      const res = NextResponse.json(
        { error: "Invalid download token for this job.", code: "INVALID_DOWNLOAD_TOKEN" },
        { status: 400 }
      );
      attachSessionCookieIfNeeded(res, sessionPrep);
      return res;
    }

    const mastered = await findLatestRecordForJob(parsed.data.jobId, "mastered");
    if (!mastered) {
      console.error("[capture-email] Mastered file not found for job after token check", {
        jobId: parsed.data.jobId,
        fileId: parsed.data.fileId
      });
      const res = NextResponse.json(
        { error: "Mastered file not found for this job.", code: "MASTERED_NOT_FOUND" },
        { status: 404 }
      );
      attachSessionCookieIfNeeded(res, sessionPrep);
      return res;
    }
    markJobDownloadUnlocked(parsed.data.jobId);
    const res = NextResponse.json({
      ok: true,
      code: "OK",
      downloadUrl: `/api/download?fileId=${mastered.id}&as=mastered.wav&dl=1`
    });
    attachSessionCookieIfNeeded(res, sessionPrep);
    return res;
  } catch (error) {
    const errSession = prepareSessionForRequest(request);
    const detail = error instanceof Error ? error.message : "Unknown error";
    const res = NextResponse.json(
      { error: `Unable to capture email. ${detail}`, code: "UNHANDLED" },
      { status: 500 }
    );
    attachSessionCookieIfNeeded(res, errSession);
    return res;
  }
}
