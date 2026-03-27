import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { attachSessionCookieIfNeeded, prepareSessionForRequest } from "@/lib/identity/session-cookie";
import { upsertLeadInSupabase } from "@/lib/leads/supabase-leads";
import { findLatestRecordForJob, resolveTempRecord } from "@/lib/storage/temp-files";
import { isSupabaseConfigured } from "@/lib/supabase/admin";
import { saveEmailLead } from "@/lib/email/capture-email";

const BodySchema = z.object({
  email: z.string().email(),
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

    if (isSupabaseConfigured()) {
      await upsertLeadInSupabase({
        email: parsed.data.email,
        sessionId: sessionPrep.sessionId
      });
    }
    saveEmailLead(parsed.data.email, parsed.data.jobId);

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
