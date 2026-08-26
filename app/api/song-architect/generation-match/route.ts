import { NextRequest, NextResponse } from "next/server";
import { analyzeTrackWithV2 } from "@/lib/audio/analyze-track-combined";
import { resolveTrackAnalysisV2Enablement } from "@/lib/features/track-analysis-v2";
import { attachSessionCookieIfNeeded, prepareSessionForRequest } from "@/lib/identity/session-cookie";
import { createJobId } from "@/lib/jobs/job-id";
import { consumeRateLimit, getClientIp, hashIdentifier, logAbuseGuard, tooManyAttemptsResponse } from "@/lib/security/abuse-guard";
import { hasTrustedEmailAccess } from "@/lib/security/verified-email-state";
import { resolveSongArchitectVerifiedContext } from "@/lib/song-architect/access";
import { runGenerationMatchFromTrackAnalysis } from "@/lib/song-architect/generation-match-service";
import {
  authorizeGenerationMatchOwnership,
  parseClaimedIdentity,
  parseSongDNAReference,
  rejectUnsupportedResultReference
} from "@/lib/song-architect/generation-match-validate";
import { isMasterAdminBypassGranted } from "@/lib/subscriptions/master-admin-bypass";
import { cleanupExpiredTempFiles, saveTempFile } from "@/lib/storage/temp-files";
import { MAX_UPLOAD_FILE_SIZE_BYTES, MAX_UPLOAD_FILE_SIZE_LABEL } from "@/lib/upload/limits";

export const runtime = "nodejs";

const ACCEPTED_MIME = new Set(["audio/mpeg", "audio/mp3", "audio/wav", "audio/x-wav", "audio/wave"]);
const ACCEPTED_EXT = new Set(["wav", "mp3"]);

function jsonError(
  status: number,
  code: string,
  message: string
): NextResponse {
  return NextResponse.json({ ok: false, error: code, code, message }, { status });
}

function optionalFormString(formData: FormData, key: string, maxLength = 8000): string | undefined {
  const value = formData.get(key);
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  return trimmed.length > maxLength ? trimmed.slice(0, maxLength) : trimmed;
}

export async function POST(request: NextRequest) {
  const sessionPrep = prepareSessionForRequest(request);
  const clientIp = getClientIp(request);
  const ipRate = consumeRateLimit({
    bucket: "song_architect_generation_match_ip",
    key: clientIp,
    limit: 10,
    windowMs: 60 * 60 * 1000
  });
  if (!ipRate.allowed) {
    logAbuseGuard("rate_limited", {
      endpoint: "/api/song-architect/generation-match",
      bucket: "song_architect_generation_match_ip",
      ipHash: hashIdentifier(clientIp),
      retryAfterSec: ipRate.retryAfterSec
    });
    const res = tooManyAttemptsResponse(ipRate.retryAfterSec);
    attachSessionCookieIfNeeded(res, sessionPrep);
    return res;
  }

  try {
    await cleanupExpiredTempFiles();

    let formData: FormData;
    try {
      formData = await request.formData();
    } catch {
      const res = jsonError(400, "invalid_payload", "Expected multipart form data.");
      attachSessionCookieIfNeeded(res, sessionPrep);
      return res;
    }

    const billingEmailHint = optionalFormString(formData, "billingEmail");
    const access = await resolveSongArchitectVerifiedContext({
      request,
      sessionId: sessionPrep.sessionId,
      billingEmailHint
    });
    if (!access.ok) {
      const res = jsonError(403, access.code, access.message);
      attachSessionCookieIfNeeded(res, sessionPrep);
      return res;
    }

    if (!hasTrustedEmailAccess(request, access.normalizedEmail)) {
      logAbuseGuard("unverified_song_architect_output_blocked", {
        endpoint: "/api/song-architect/generation-match",
        ipHash: hashIdentifier(clientIp),
        emailHash: hashIdentifier(access.normalizedEmail)
      });
      const res = jsonError(
        403,
        "email_verification_required",
        "Please confirm email access before running Generation Match."
      );
      attachSessionCookieIfNeeded(res, sessionPrep);
      return res;
    }

    const emailRate = consumeRateLimit({
      bucket: "song_architect_generation_match_email",
      key: access.normalizedEmail,
      limit: 10,
      windowMs: 60 * 60 * 1000
    });
    if (!emailRate.allowed) {
      logAbuseGuard("rate_limited", {
        endpoint: "/api/song-architect/generation-match",
        bucket: "song_architect_generation_match_email",
        ipHash: hashIdentifier(clientIp),
        emailHash: hashIdentifier(access.normalizedEmail),
        retryAfterSec: emailRate.retryAfterSec
      });
      const res = tooManyAttemptsResponse(emailRate.retryAfterSec);
      attachSessionCookieIfNeeded(res, sessionPrep);
      return res;
    }

    const claimed = parseClaimedIdentity({
      ownerEmail: optionalFormString(formData, "ownerEmail"),
      ownerId: optionalFormString(formData, "ownerId"),
      userId: optionalFormString(formData, "userId"),
      resultId: optionalFormString(formData, "resultId"),
      sessionId: optionalFormString(formData, "sessionId")
    });
    const ownership = authorizeGenerationMatchOwnership({
      trustedEmail: access.normalizedEmail,
      claimed
    });
    if (!ownership.ok) {
      const res = jsonError(403, ownership.code, ownership.message);
      attachSessionCookieIfNeeded(res, sessionPrep);
      return res;
    }

    const songDNAField = formData.get("songDNA");
    const dnaResult = parseSongDNAReference(
      typeof songDNAField === "string" ? songDNAField : songDNAField == null ? undefined : String(songDNAField)
    );
    if (!dnaResult.ok) {
      const unsupportedId =
        dnaResult.code === "missing_song_architect_reference"
          ? rejectUnsupportedResultReference(claimed, false)
          : null;
      const failure = unsupportedId ?? dnaResult;
      const status = failure.code === "song_architect_result_not_found" ? 404 : 400;
      const res = jsonError(status, failure.code, failure.message);
      attachSessionCookieIfNeeded(res, sessionPrep);
      return res;
    }

    const audioField = formData.get("audio");
    if (!(audioField instanceof File) || audioField.size <= 0) {
      const res = jsonError(400, "audio_required", "Upload the generated song as a WAV or MP3 file.");
      attachSessionCookieIfNeeded(res, sessionPrep);
      return res;
    }
    if (audioField.size > MAX_UPLOAD_FILE_SIZE_BYTES) {
      const res = jsonError(400, "file_too_large", `File exceeds the maximum upload size of ${MAX_UPLOAD_FILE_SIZE_LABEL}.`);
      attachSessionCookieIfNeeded(res, sessionPrep);
      return res;
    }

    const filename = audioField.name || "generated-track";
    const ext = filename.split(".").pop()?.toLowerCase() ?? "";
    const mimeAccepted = ACCEPTED_MIME.has(audioField.type);
    const extAccepted = ACCEPTED_EXT.has(ext);
    if (!mimeAccepted && !extAccepted) {
      const res = jsonError(400, "unsupported_audio", "Only WAV or MP3 uploads are supported.");
      attachSessionCookieIfNeeded(res, sessionPrep);
      return res;
    }

    const normalizedExt = ext === "wav" || audioField.type.includes("wav") ? "wav" : "mp3";
    const jobId = createJobId("generation-match");
    const buffer = Buffer.from(await audioField.arrayBuffer());
    const uploadRecord = await saveTempFile({
      data: buffer,
      extension: normalizedExt,
      kind: "upload",
      mime: normalizedExt === "wav" ? "audio/wav" : "audio/mpeg",
      jobId
    });

    const enableV2 = resolveTrackAnalysisV2Enablement(() => isMasterAdminBypassGranted(request));
    let analysis;
    let analysisV2;
    try {
      const combined = await analyzeTrackWithV2(uploadRecord.filePath, {
        enableV2,
        onV2Error: (v2Error) => {
          if (process.env.NODE_ENV !== "production") {
            console.warn(
              "[song-architect] generation_match_v2_unavailable",
              v2Error instanceof Error ? v2Error.message : v2Error
            );
          }
        }
      });
      analysis = combined.analysis;
      analysisV2 = combined.analysisV2;
    } catch (analysisError) {
      if (process.env.NODE_ENV !== "production") {
        console.warn("[song-architect] generation_match_analysis_failed", {
          jobId,
          message: analysisError instanceof Error ? analysisError.message : String(analysisError)
        });
      }
      const res = jsonError(
        422,
        "analysis_failed",
        "The generated track could not be analyzed. Please upload a WAV or MP3 export and try again."
      );
      attachSessionCookieIfNeeded(res, sessionPrep);
      return res;
    }

    const evaluated = runGenerationMatchFromTrackAnalysis({
      songDNA: dnaResult.songDNA,
      analysis,
      analysisV2,
      stylePrompt: optionalFormString(formData, "stylePrompt"),
      sunoBlueprint: optionalFormString(formData, "sunoBlueprint")
    });
    if (!evaluated.ok) {
      const res = jsonError(422, evaluated.code, evaluated.message);
      attachSessionCookieIfNeeded(res, sessionPrep);
      return res;
    }

    const res = NextResponse.json({
      ok: true,
      match: evaluated.response.match,
      improvedGenerationPrompt: evaluated.response.improvedGenerationPrompt
    });
    attachSessionCookieIfNeeded(res, sessionPrep);
    return res;
  } catch (error) {
    const detail = error instanceof Error ? error.message : "Unknown Generation Match error";
    console.error("[song-architect] generation_match_failed", { detail: detail.slice(0, 180) });
    const res = jsonError(500, "generation_match_failed", "Generation Match could not be completed right now.");
    attachSessionCookieIfNeeded(res, sessionPrep);
    return res;
  }
}
