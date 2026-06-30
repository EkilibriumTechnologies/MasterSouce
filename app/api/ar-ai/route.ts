import { NextRequest, NextResponse } from "next/server";
import { resolveHitAnalyzerAccess } from "@/lib/ar-ai/access";
import { normalizeArAiReport } from "@/lib/ar-ai/normalize-output";
import { ArAiOpenAIError, requestArAiEvaluationFromOpenAI } from "@/lib/ar-ai/openai";
import { trackAnalysisToTechnicalMetrics } from "@/lib/ar-ai/prompts";
import { recordHitAnalyzerReportEvent } from "@/lib/ar-ai/usage";
import { AR_AI_DEFAULT_GENRE } from "@/lib/ar-ai/types";
import { analyzeTrack } from "@/lib/audio/analyze-track";
import { attachSessionCookieIfNeeded, prepareSessionForRequest } from "@/lib/identity/session-cookie";
import { createJobId } from "@/lib/jobs/job-id";
import { attachTrustedEmailAccessState } from "@/lib/security/verified-email-state";
import { consumeRateLimit, getClientIp, hashIdentifier, logAbuseGuard, tooManyAttemptsResponse } from "@/lib/security/abuse-guard";
import { cleanupExpiredTempFiles, saveTempFile } from "@/lib/storage/temp-files";
import { MAX_UPLOAD_FILE_SIZE_BYTES, MAX_UPLOAD_FILE_SIZE_LABEL } from "@/lib/upload/limits";

export const runtime = "nodejs";

const ACCEPTED_MIME = new Set(["audio/mpeg", "audio/mp3", "audio/wav", "audio/x-wav", "audio/wave"]);
const ACCEPTED_EXT = new Set(["wav", "mp3"]);

const MAX_LYRICS_LENGTH = 12000;
const MAX_FIELD_LENGTH = 700;

function trimOptionalField(value: FormDataEntryValue | null): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  return trimmed.length > MAX_FIELD_LENGTH ? trimmed.slice(0, MAX_FIELD_LENGTH) : trimmed;
}

function trimLyrics(value: FormDataEntryValue | null): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  return trimmed.length > MAX_LYRICS_LENGTH ? trimmed.slice(0, MAX_LYRICS_LENGTH) : trimmed;
}

export async function POST(request: NextRequest) {
  const requestStartedAt = Date.now();
  const sessionPrep = prepareSessionForRequest(request);

  try {
    await cleanupExpiredTempFiles();

    const clientIp = getClientIp(request);
    const ipRate = consumeRateLimit({
      bucket: "ar_ai_ip",
      key: clientIp,
      limit: 8,
      windowMs: 60 * 60 * 1000
    });
    if (!ipRate.allowed) {
      logAbuseGuard("rate_limited", {
        endpoint: "/api/ar-ai",
        bucket: "ar_ai_ip",
        ipHash: hashIdentifier(clientIp),
        retryAfterSec: ipRate.retryAfterSec
      });
      const res = tooManyAttemptsResponse(ipRate.retryAfterSec);
      attachSessionCookieIfNeeded(res, sessionPrep);
      return res;
    }

    let formData: FormData;
    try {
      formData = await request.formData();
    } catch {
      const res = NextResponse.json({ error: "Invalid multipart form data." }, { status: 400 });
      attachSessionCookieIfNeeded(res, sessionPrep);
      return res;
    }

    const billingEmailHint = trimOptionalField(formData.get("billingEmail"));
    const access = await resolveHitAnalyzerAccess({ request, billingEmailHint });
    if (!access.ok) {
      if (access.code === "email_not_allowed") {
        const blockedAttemptsRate = consumeRateLimit({
          bucket: "blocked_email_attempts_ip",
          key: clientIp,
          limit: 10,
          windowMs: 60 * 60 * 1000
        });
        if (!blockedAttemptsRate.allowed) {
          logAbuseGuard("rate_limited", {
            endpoint: "/api/ar-ai",
            bucket: "blocked_email_attempts_ip",
            ipHash: hashIdentifier(clientIp),
            retryAfterSec: blockedAttemptsRate.retryAfterSec
          });
          const limited = tooManyAttemptsResponse(blockedAttemptsRate.retryAfterSec);
          attachSessionCookieIfNeeded(limited, sessionPrep);
          return limited;
        }
      }

      const status =
        access.code === "hit_analyzer_quota_exhausted"
          ? 403
          : access.code === "email_verification_required"
            ? 403
            : 403;
      const res = NextResponse.json(
        {
          ok: false,
          code: access.code,
          message: access.message,
          upgradeRequired: access.upgradeRequired ?? false,
          limit: access.limit,
          remaining: access.remaining
        },
        { status }
      );
      attachSessionCookieIfNeeded(res, sessionPrep);
      return res;
    }

    if (access.normalizedEmail) {
      const emailRate = consumeRateLimit({
        bucket: "ar_ai_report_email",
        key: access.normalizedEmail,
        limit: access.launchActive ? 12 : 10,
        windowMs: 60 * 60 * 1000
      });
      if (!emailRate.allowed) {
        logAbuseGuard("rate_limited", {
          endpoint: "/api/ar-ai",
          bucket: "ar_ai_report_email",
          ipHash: hashIdentifier(clientIp),
          emailHash: hashIdentifier(access.normalizedEmail),
          retryAfterSec: emailRate.retryAfterSec
        });
        const res = tooManyAttemptsResponse(emailRate.retryAfterSec);
        attachSessionCookieIfNeeded(res, sessionPrep);
        return res;
      }
    }

    const audioField = formData.get("audio");
    if (!(audioField instanceof File) || audioField.size <= 0) {
      const res = NextResponse.json({ error: "Audio file is required." }, { status: 400 });
      attachSessionCookieIfNeeded(res, sessionPrep);
      return res;
    }

    const file = audioField;
    if (file.size > MAX_UPLOAD_FILE_SIZE_BYTES) {
      const res = NextResponse.json(
        { error: `File exceeds the maximum upload size of ${MAX_UPLOAD_FILE_SIZE_LABEL}.` },
        { status: 400 }
      );
      attachSessionCookieIfNeeded(res, sessionPrep);
      return res;
    }

    const filename = file.name || "track";
    const ext = filename.split(".").pop()?.toLowerCase() ?? "";
    const mimeAccepted = ACCEPTED_MIME.has(file.type);
    const extAccepted = ACCEPTED_EXT.has(ext);
    if (!mimeAccepted && !extAccepted) {
      const res = NextResponse.json({ error: "Only WAV or MP3 uploads are supported." }, { status: 400 });
      attachSessionCookieIfNeeded(res, sessionPrep);
      return res;
    }

    const intendedGenreRaw = formData.get("intendedGenre");
    const intendedGenre =
      typeof intendedGenreRaw === "string" && intendedGenreRaw.trim()
        ? intendedGenreRaw.trim().slice(0, MAX_FIELD_LENGTH)
        : AR_AI_DEFAULT_GENRE;

    const targetAudience = trimOptionalField(formData.get("targetAudience"));
    const lyrics = trimLyrics(formData.get("lyrics"));
    const references = trimOptionalField(formData.get("references"));
    const releaseIntent = trimOptionalField(formData.get("releaseIntent"));

    const normalizedExt = ext === "wav" || file.type.includes("wav") ? "wav" : "mp3";
    const jobId = createJobId("ar-ai");
    const buffer = Buffer.from(await file.arrayBuffer());

    const uploadRecord = await saveTempFile({
      data: buffer,
      extension: normalizedExt,
      kind: "upload",
      mime: normalizedExt === "wav" ? "audio/wav" : "audio/mpeg",
      jobId
    });

    let technicalMetrics = null;
    try {
      const analysis = await analyzeTrack(uploadRecord.filePath);
      technicalMetrics = trackAnalysisToTechnicalMetrics(analysis);
    } catch (analysisError) {
      if (process.env.NODE_ENV !== "production") {
        console.warn("[ar-ai] technical_analysis_failed", {
          jobId,
          message: analysisError instanceof Error ? analysisError.message : String(analysisError)
        });
      }
    }

    const evaluationInput = {
      fileName: filename,
      intendedGenre,
      targetAudience,
      releaseIntent,
      references,
      lyrics,
      technicalMetrics
    };

    let rawOutput: unknown;
    let model: string;
    try {
      const openAiResult = await requestArAiEvaluationFromOpenAI(evaluationInput);
      rawOutput = openAiResult.rawOutput;
      model = openAiResult.model;
    } catch (openAiError) {
      if (access.normalizedEmail) {
        await recordHitAnalyzerReportEvent({
          normalizedEmail: access.normalizedEmail,
          planId: access.planId,
          status: "openai_failed",
          counted: false,
          errorCode: openAiError instanceof ArAiOpenAIError ? openAiError.code : "unknown"
        }).catch((recordError) => {
          if (process.env.NODE_ENV !== "production") {
            console.warn("[ar-ai] usage_event_record_failed", {
              message: recordError instanceof Error ? recordError.message : String(recordError)
            });
          }
        });
      }
      throw openAiError;
    }

    const report = normalizeArAiReport(rawOutput, evaluationInput);

    const shouldCountUsage = Boolean(access.normalizedEmail) && !access.launchActive && !access.unlimited;
    if (access.normalizedEmail) {
      await recordHitAnalyzerReportEvent({
        normalizedEmail: access.normalizedEmail,
        planId: access.planId,
        status: "success",
        counted: shouldCountUsage
      }).catch((recordError) => {
        if (process.env.NODE_ENV !== "production") {
          console.warn("[ar-ai] usage_event_record_failed", {
            message: recordError instanceof Error ? recordError.message : String(recordError)
          });
        }
      });
    }

    if (process.env.NODE_ENV !== "production") {
      console.info("[ar-ai] evaluation_complete", {
        jobId,
        model,
        elapsedMs: Date.now() - requestStartedAt,
        overallRating: report.overallRating.score,
        hasTechnicalMetrics: Boolean(technicalMetrics),
        launchActive: access.launchActive,
        countedUsage: shouldCountUsage
      });
    }

    const res = NextResponse.json(report, { status: 200 });
    if (access.normalizedEmail) {
      attachTrustedEmailAccessState(res, access.normalizedEmail);
    }
    attachSessionCookieIfNeeded(res, sessionPrep);
    return res;
  } catch (error) {
    if (error instanceof ArAiOpenAIError) {
      if (process.env.NODE_ENV !== "production") {
        console.error("[ar-ai] openai_error", { code: error.code, message: error.message });
      }
      const res = NextResponse.json(
        {
          error: "ar_ai_unavailable",
          message: "A&R AI evaluation is temporarily unavailable. Please retry.",
          detail: error.code
        },
        { status: error.code === "rate_limit" ? 429 : 503 }
      );
      attachSessionCookieIfNeeded(res, sessionPrep);
      return res;
    }

    const detail = error instanceof Error ? error.message : "Unknown A&R AI error.";
    if (process.env.NODE_ENV !== "production") {
      console.error("[ar-ai] evaluation_failed", detail);
    }

    const res = NextResponse.json(
      {
        error: "ar_ai_evaluation_failed",
        message: "A&R AI evaluation failed."
      },
      { status: 500 }
    );
    attachSessionCookieIfNeeded(res, sessionPrep);
    return res;
  }
}
