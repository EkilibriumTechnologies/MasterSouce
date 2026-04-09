import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { analyzeTrack } from "@/lib/audio/analyze-track";
import { evaluateTrackReadiness } from "@/lib/audio/readiness";
import { createJobId } from "@/lib/jobs/job-id";
import { cleanupExpiredTempFiles, saveTempFile } from "@/lib/storage/temp-files";
import { MAX_UPLOAD_FILE_SIZE_BYTES, MAX_UPLOAD_FILE_SIZE_LABEL } from "@/lib/upload/limits";

const ACCEPTED_MIME = new Set(["audio/mpeg", "audio/mp3", "audio/wav", "audio/x-wav", "audio/wave"]);
const ACCEPTED_EXT = new Set(["wav", "mp3"]);

const InputSchema = z.object({
  genre: z.enum(["pop", "hiphop", "edm", "rock", "reggaeton", "rnb", "lofi"]).optional(),
  loudnessMode: z.enum(["clean", "balanced", "loud"]).optional()
});

export async function POST(request: NextRequest) {
  try {
    await cleanupExpiredTempFiles();

    const formData = await request.formData();
    const file = formData.get("audio");
    const genre = formData.get("genre");
    const loudnessMode = formData.get("loudnessMode");

    const parsed = InputSchema.safeParse({ genre, loudnessMode });
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid genre or loudness mode." }, { status: 400 });
    }

    if (!(file instanceof File)) {
      return NextResponse.json({ error: "Audio file is required." }, { status: 400 });
    }
    if (file.size > MAX_UPLOAD_FILE_SIZE_BYTES) {
      return NextResponse.json(
        { error: `File exceeds the maximum upload size of ${MAX_UPLOAD_FILE_SIZE_LABEL}.` },
        { status: 400 }
      );
    }

    const filename = file.name || "track";
    const ext = filename.split(".").pop()?.toLowerCase() ?? "";
    const mimeAccepted = ACCEPTED_MIME.has(file.type);
    const extAccepted = ACCEPTED_EXT.has(ext);
    if (!mimeAccepted && !extAccepted) {
      return NextResponse.json({ error: "Only WAV or MP3 are supported for MVP." }, { status: 400 });
    }

    const normalizedExt = ext === "wav" || file.type.includes("wav") ? "wav" : "mp3";
    const jobId = createJobId("analysis");

    const buffer = Buffer.from(await file.arrayBuffer());
    const uploadRecord = await saveTempFile({
      data: buffer,
      extension: normalizedExt,
      kind: "upload",
      mime: normalizedExt === "wav" ? "audio/wav" : "audio/mpeg",
      jobId
    });

    const analysis = await analyzeTrack(uploadRecord.filePath);
    const readiness = evaluateTrackReadiness(analysis);
    const debug =
      process.env.NODE_ENV !== "production"
        ? {
            filename,
            fileSize: file.size,
            rawMetrics: {
              integratedLufs: analysis.integratedLufs,
              peakDb: analysis.peakDb,
              crestDb: analysis.crestDb
            }
          }
        : undefined;

    if (process.env.NODE_ENV !== "production") {
      console.log("[PREMASTER_DEBUG] /api/analyze-track response", {
        filename,
        fileSize: file.size,
        integratedLufs: analysis.integratedLufs,
        peakDb: analysis.peakDb,
        crestDb: analysis.crestDb,
        verdict: readiness.verdict,
        loudness: readiness.loudness,
        peakSafety: readiness.peakSafety,
        dynamicControl: readiness.dynamicControl,
        recommendation: readiness.recommendation,
        ...(debug ?? {})
      });
    }

    return NextResponse.json({
      analysis: readiness,
      ...(debug ? { debug } : {})
    });
  } catch (error) {
    const detail = error instanceof Error ? error.message : "Unknown analysis error.";
    return NextResponse.json(
      {
        error: `Track analysis failed. Detail: ${detail}`
      },
      { status: 500 }
    );
  }
}
