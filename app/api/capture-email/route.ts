import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { attachSessionCookieIfNeeded, prepareSessionForRequest } from "@/lib/identity/session-cookie";
import { upsertLeadInSupabase } from "@/lib/leads/supabase-leads";
import { findLatestRecordForJob, resolveTempRecord } from "@/lib/storage/temp-files";
import { isSupabaseConfigured } from "@/lib/supabase/admin";

const BodySchema = z.object({
  email: z.string().trim().toLowerCase().email(),
  jobId: z.string().min(4),
  fileId: z.string().min(4)
});

export async function POST(request: NextRequest) {
  try {
    const sessionPrep = prepareSessionForRequest(request);
    const body = await request.json();
    const parsed = BodySchema.safeParse(body);
    if (!parsed.success) {
      const res = NextResponse.json({ error: "Valid email and jobId required." }, { status: 400 });
      attachSessionCookieIfNeeded(res, sessionPrep);
      return res;
    }

    const hintedRecord = await resolveTempRecord(parsed.data.fileId);
    if (!hintedRecord || hintedRecord.jobId !== parsed.data.jobId || hintedRecord.kind !== "mastered") {
      const res = NextResponse.json({ error: "Invalid download token for this job." }, { status: 400 });
      attachSessionCookieIfNeeded(res, sessionPrep);
      return res;
    }

    if (!isSupabaseConfigured()) {
      console.error("[capture-email] Supabase is not configured. Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY.");
      const res = NextResponse.json({ error: "Email capture is temporarily unavailable." }, { status: 500 });
      attachSessionCookieIfNeeded(res, sessionPrep);
      return res;
    }
    try {
      await upsertLeadInSupabase({
        email: parsed.data.email,
        sessionId: sessionPrep.sessionId
      });
    } catch (error) {
      const detail = error instanceof Error ? error.message : "Unknown Supabase error";
      console.error("[capture-email] Failed to upsert lead into public.leads", {
        email: parsed.data.email,
        sessionId: sessionPrep.sessionId,
        detail
      });
      const res = NextResponse.json({ error: "Unable to save email right now. Please try again." }, { status: 500 });
      attachSessionCookieIfNeeded(res, sessionPrep);
      return res;
    }

    const mastered = await findLatestRecordForJob(parsed.data.jobId, "mastered");
    if (!mastered) {
      const res = NextResponse.json({ error: "Mastered file not found for this job." }, { status: 404 });
      attachSessionCookieIfNeeded(res, sessionPrep);
      return res;
    }
    const res = NextResponse.json({
      ok: true,
      downloadUrl: `/api/download?fileId=${mastered.id}&as=mastered.wav&dl=1`
    });
    attachSessionCookieIfNeeded(res, sessionPrep);
    return res;
  } catch (error) {
    const errSession = prepareSessionForRequest(request);
    const detail = error instanceof Error ? error.message : "Unknown error";
    const res = NextResponse.json({ error: `Unable to capture email. ${detail}` }, { status: 500 });
    attachSessionCookieIfNeeded(res, errSession);
    return res;
  }
}
