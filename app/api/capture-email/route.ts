import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { findLatestRecordForJob, resolveTempRecord } from "@/lib/storage/temp-files";
import { saveEmailLead } from "@/lib/email/capture-email";

const BodySchema = z.object({
  email: z.string().email(),
  jobId: z.string().min(4),
  fileId: z.string().min(4)
});

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const parsed = BodySchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "Valid email and jobId required." }, { status: 400 });
    }

    const hintedRecord = await resolveTempRecord(parsed.data.fileId);
    if (!hintedRecord || hintedRecord.jobId !== parsed.data.jobId || hintedRecord.kind !== "mastered") {
      return NextResponse.json({ error: "Invalid download token for this job." }, { status: 400 });
    }

    saveEmailLead(parsed.data.email, parsed.data.jobId);

    const mastered = await findLatestRecordForJob(parsed.data.jobId, "mastered");
    if (!mastered) {
      return NextResponse.json({ error: "Mastered file not found for this job." }, { status: 404 });
    }
    return NextResponse.json({ ok: true, downloadUrl: `/api/download?fileId=${mastered.id}&as=mastered.wav&dl=1` });
  } catch (error) {
    const detail = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: `Unable to capture email. ${detail}` }, { status: 500 });
  }
}
