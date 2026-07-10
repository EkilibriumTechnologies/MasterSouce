import { NextRequest, NextResponse } from "next/server";
import { getJobExportVerifyRecord } from "@/lib/jobs/job-export-verify";

export const dynamic = "force-dynamic";

function isAuthorized(request: NextRequest): boolean {
  const expected = process.env.INTERNAL_DIAGNOSTICS_TOKEN?.trim();
  if (!expected) {
    return false;
  }
  const provided =
    request.headers.get("x-internal-token")?.trim() ??
    request.nextUrl.searchParams.get("token")?.trim() ??
    "";
  return provided === expected;
}

export async function GET(request: NextRequest) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: "Not found." }, { status: 404 });
  }

  const jobId = request.nextUrl.searchParams.get("jobId")?.trim() ?? "";
  if (!jobId) {
    return NextResponse.json({ error: "Missing jobId query parameter." }, { status: 400 });
  }

  const record = await getJobExportVerifyRecord(jobId);
  if (!record) {
    return NextResponse.json({ error: "Job export verify record not found or expired." }, { status: 404 });
  }

  return NextResponse.json(
    {
      jobId: record.jobId,
      planId: record.planId,
      outputQuality: record.outputQuality,
      outputCodec: record.outputCodec,
      emailSource: record.emailSource,
      trustedIdentitySource: record.trustedIdentitySource,
      adminOverrideGranted: record.adminOverrideGranted,
      codecVerifiedAfterExport: record.codecVerifiedAfterExport,
      maskedEmail: record.maskedEmail,
      endpoint: record.endpoint,
      recordedAt: record.recordedAt,
      verifiedAt: record.verifiedAt
    },
    {
      headers: {
        "Cache-Control": "no-store"
      }
    }
  );
}
