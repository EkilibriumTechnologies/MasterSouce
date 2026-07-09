import "server-only";

import { maskEmail } from "@/lib/security/abuse-guard";
import {
  MASTERING_SOURCE_FLOW,
  masteringFunnelBillingSnapshot,
  normalizeEmailForFunnelLog
} from "@/lib/analytics/mastering-funnel";

// Re-export the client-safe funnel helpers server consumers rely on so a single
// import from this server module covers both tracking metadata and server logging.
export { masteringFunnelBillingSnapshot, normalizeEmailForFunnelLog };

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
