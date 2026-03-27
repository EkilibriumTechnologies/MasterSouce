import { createReadStream } from "node:fs";
import { readFile, stat } from "node:fs/promises";
import { Readable } from "node:stream";
import { NextRequest, NextResponse } from "next/server";
import { isJobUnlocked } from "@/lib/email/capture-email";
import { cleanupExpiredTempFiles, findLatestRecordForJob, resolveTempRecord } from "@/lib/storage/temp-files";

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
    if (isMasteredAsset && !isJobUnlocked(record.jobId)) {
      return NextResponse.json({ error: "Email required before full download." }, { status: 403 });
    }

    const fileStats = await stat(record.filePath);
    const headers: Record<string, string> = {
      "Content-Type": record.mime,
      "Content-Length": String(fileStats.size),
      "Cache-Control": "no-store",
      "Content-Disposition": `${forceDownload ? "attachment" : "inline"}; filename="${filename}"`,
      // Helps some browsers treat the response as seekable media.
      "Accept-Ranges": "bytes"
    };

    // Buffer whole file for typical MVP sizes: <audio> + WebView players often break on Node web streams.
    const maxBuffered = 60 * 1024 * 1024;
    if (fileStats.size <= maxBuffered) {
      const buffer = await readFile(record.filePath);
      return new NextResponse(new Uint8Array(buffer), { headers });
    }

    const stream = createReadStream(record.filePath);
    const webStream = Readable.toWeb(stream) as ReadableStream;
    return new NextResponse(webStream, { headers });
  } catch (error) {
    const detail = error instanceof Error ? error.message : "Unknown download error.";
    return NextResponse.json({ error: `Unable to download file. ${detail}` }, { status: 500 });
  }
}
