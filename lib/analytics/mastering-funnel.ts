import { trackEvent, type AbEventParams } from "@/lib/analytics/ab-comparison";
import { normalizeBillingEmail } from "@/lib/billing/email";
import { maskEmail } from "@/lib/security/abuse-guard";
import type { PlanId } from "@/lib/subscriptions/types";

export const MASTERING_SOURCE_FLOW = "mastering" as const;

export type MasteringFunnelClientEvent =
  | "mastering_upload_started"
  | "mastering_upload_succeeded"
  | "mastering_upload_failed"
  | "mastering_preview_started"
  | "mastering_preview_succeeded"
  | "mastering_preview_failed"
  | "mastering_ab_viewed"
  | "mastering_preview_played"
  | "mastering_download_clicked"
  | "mastering_export_gate_viewed"
  | "mastering_credit_pack_cta_viewed"
  | "mastering_credit_pack_cta_clicked"
  | "mastering_subscription_cta_viewed"
  | "mastering_subscription_cta_clicked"
  | "mastering_checkout_started";

export type MasteringFunnelServerEvent =
  | "mastering_preview_api_started"
  | "mastering_preview_api_succeeded"
  | "mastering_preview_api_failed"
  | "mastering_download_allowed"
  | "mastering_download_blocked"
  | "mastering_checkout_session_created"
  | "mastering_credit_pack_purchase_completed"
  | "mastering_credit_consumed"
  | "mastering_subscription_detected"
  | "mastering_user_has_unused_credits";

export type MasteringFunnelMetadata = {
  source_component?: string;
  source_flow?: string;
  plan_id?: PlanId | string;
  normalized_email?: string;
  has_active_subscription?: boolean;
  has_credit_balance?: boolean;
  credit_balance?: number;
  export_format?: "mp3" | "wav";
  export_quality?: string;
  gate_reason?: string;
  error_code?: string;
  job_id?: string;
  file_id?: string;
  mastering_mode?: string;
  page_path?: string;
};

const FORBIDDEN_LOG_KEYS = new Set([
  "audioUrl",
  "audio_url",
  "downloadUrl",
  "download_url",
  "filePath",
  "file_path",
  "stripePayload",
  "payment_intent",
  "clientSecret",
  "cookie",
  "sessionToken",
  "ip",
  "ipAddress"
]);

const URL_LIKE_KEY = /url|path|payload|secret|token|cookie/i;

function resolvePagePath(): string | undefined {
  if (typeof window === "undefined") return undefined;
  return `${window.location.pathname}${window.location.search || ""}`;
}

/** Safe email for funnel logs — trim + lowercase, omitted when invalid. */
export function normalizeEmailForFunnelLog(email: string | null | undefined): string | undefined {
  if (!email) return undefined;
  return normalizeBillingEmail(email) ?? undefined;
}

export function masteringFunnelBillingSnapshot(input: {
  planId: PlanId | string;
  subscriptionStatus?: string | null;
  creditPackBalance?: number | null;
}): Pick<MasteringFunnelMetadata, "plan_id" | "has_active_subscription" | "has_credit_balance" | "credit_balance"> {
  const creditBalance = input.creditPackBalance ?? 0;
  const hasPaidPlan = input.planId !== "free";
  return {
    plan_id: input.planId,
    has_active_subscription: hasPaidPlan && input.subscriptionStatus === "active",
    has_credit_balance: creditBalance > 0,
    credit_balance: creditBalance
  };
}

function toTrackParams(params: MasteringFunnelMetadata): AbEventParams {
  return {
    source_component: params.source_component ?? "mastering_funnel",
    source_flow: params.source_flow ?? MASTERING_SOURCE_FLOW,
    page_path: params.page_path ?? resolvePagePath(),
    plan_id: params.plan_id,
    format: params.export_format,
    job_id: params.job_id,
    file_id: params.file_id,
    mastering_mode: params.mastering_mode,
    ...(params.has_active_subscription !== undefined
      ? { has_active_subscription: params.has_active_subscription }
      : {}),
    ...(params.has_credit_balance !== undefined ? { has_credit_balance: params.has_credit_balance } : {}),
    ...(params.credit_balance !== undefined ? { credit_balance: params.credit_balance } : {}),
    ...(params.export_quality ? { export_quality: params.export_quality } : {}),
    ...(params.gate_reason ? { gate_reason: params.gate_reason } : {}),
    ...(params.error_code ? { error_code: params.error_code } : {})
  } as AbEventParams;
}

export function trackMasteringFunnelEvent(
  eventName: MasteringFunnelClientEvent,
  params: MasteringFunnelMetadata = {}
): void {
  trackEvent(eventName, toTrackParams(params));
}

function sanitizeServerLogDetails(details: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(details)) {
    if (FORBIDDEN_LOG_KEYS.has(key)) continue;
    if (URL_LIKE_KEY.test(key) && typeof value === "string" && (value.includes("/api/download") || value.startsWith("http"))) {
      continue;
    }
    if (key === "normalized_email" && typeof value === "string") {
      const normalized = normalizeEmailForFunnelLog(value);
      if (normalized) out.normalized_email = maskEmail(normalized);
      continue;
    }
    if (key === "file_id" && typeof value === "string") {
      out.file_id = "<redacted-temp-id>";
      continue;
    }
    if (value !== undefined) out[key] = value;
  }
  return out;
}

export function logMasteringFunnelEvent(
  eventName: MasteringFunnelServerEvent,
  details: Record<string, unknown> = {}
): void {
  console.info("[mastering] funnel_event", {
    event: eventName,
    source_flow: MASTERING_SOURCE_FLOW,
    ...sanitizeServerLogDetails(details)
  });
}
