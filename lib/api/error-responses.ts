import { NextResponse } from "next/server";
import { hashIdentifier, maskEmail } from "@/lib/security/abuse-guard";

export const API_ERROR_CODES = {
  ffmpegUnavailable: "ffmpeg_unavailable",
  masteringFailed: "mastering_failed",
  adaptiveAiUnavailable: "adaptive_ai_unavailable",
  adaptiveMasteringUnexpected: "adaptive_mastering_unexpected",
  adaptiveMasteringFailed: "adaptive_mastering_failed",
  trackAnalysisFailed: "track_analysis_failed",
  adaptiveExportReconcileFailed: "adaptive_export_reconcile_failed",
  adaptiveExportUnlockFailed: "adaptive_export_unlock_failed",
  adaptiveExportLeadFailed: "adaptive_export_lead_failed",
  downloadVerificationFailed: "download_verification_failed",
  downloadPrepareFailed: "download_prepare_failed",
  downloadEntitlementCheckFailed: "download_entitlement_check_failed",
  downloadRecordFailed: "download_record_failed",
  downloadFailed: "download_failed"
} as const;

export type ApiErrorCode = (typeof API_ERROR_CODES)[keyof typeof API_ERROR_CODES];

const EMAIL_RE = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi;
const FILE_PATH_RE = /(?:[A-Za-z]:[\\/]|\/(?:tmp|var|home|users|app|workspace|mnt)\/)[^\s"',}]+/gi;
const BILLING_ID_RE = /\b(?:cus|sub|price|cs|pi|pm|evt)_[A-Za-z0-9_]+\b/g;
const TEMP_FILE_ID_KEY_RE = /^(?:fileId|file_id|masteredId|originalPreviewId|masteredPreviewId|downloadFileId)$/i;
const PATH_KEY_RE = /(?:path|tempRoot|resolvedPath|executablePath)$/i;
const BILLING_ID_KEY_RE = /(?:stripe.*Id|customerId|subscriptionId|priceId|checkoutSessionId|paymentIntentId)/i;
const RAW_TEXT_KEY_RE = /(?:message|detail|stack|stderr|stdout|payload|requestBody|error)$/i;

function summarizeString(value: string): string {
  return `<redacted:${value.length}:${hashIdentifier(value)}>`;
}

function redactString(value: string): string {
  return value
    .replace(EMAIL_RE, (match) => maskEmail(match))
    .replace(FILE_PATH_RE, "<redacted-path>")
    .replace(BILLING_ID_RE, "<redacted-billing-id>");
}

function sanitizeValue(key: string, value: unknown): unknown {
  if (value === undefined) return undefined;
  if (value === null || typeof value === "number" || typeof value === "boolean") return value;

  if (typeof value === "string") {
    if (TEMP_FILE_ID_KEY_RE.test(key)) return value ? "<redacted-temp-id>" : value;
    if (PATH_KEY_RE.test(key)) return value ? "<redacted-path>" : value;
    if (BILLING_ID_KEY_RE.test(key)) return value ? "<redacted-billing-id>" : value;
    if (RAW_TEXT_KEY_RE.test(key)) return summarizeString(value);
    return redactString(value);
  }

  if (Array.isArray(value)) {
    return value.map((item, index) => sanitizeValue(`${key}.${index}`, item));
  }

  if (typeof value === "object") {
    return sanitizeLogDetails(value as Record<string, unknown>);
  }

  return String(value);
}

export function sanitizeLogDetails(details: Record<string, unknown>): Record<string, unknown> {
  const sanitized: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(details)) {
    const clean = sanitizeValue(key, value);
    if (clean !== undefined) sanitized[key] = clean;
  }
  return sanitized;
}

export function summarizeErrorForLog(error: unknown): Record<string, unknown> {
  if (error instanceof Error) {
    const maybeCode = (error as Error & { code?: unknown }).code;
    return sanitizeLogDetails({
      name: error.name,
      errorCode: typeof maybeCode === "string" ? maybeCode : undefined,
      message: error.message,
      stack: error.stack
    });
  }

  return sanitizeLogDetails({
    name: "NonError",
    message: String(error)
  });
}

export function logApiError(
  scope: string,
  code: ApiErrorCode,
  error: unknown,
  details: Record<string, unknown> = {},
  level: "error" | "warn" | "info" = "error"
): void {
  console[level](`[${scope}] ${code}`, sanitizeLogDetails({ code, ...details, exception: summarizeErrorForLog(error) }));
}

export function apiErrorResponse(params: { status: number; code: ApiErrorCode; message: string }): NextResponse {
  return NextResponse.json(
    {
      error: params.message,
      code: params.code
    },
    { status: params.status }
  );
}
