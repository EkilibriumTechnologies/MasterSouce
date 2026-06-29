import { normalizeBillingEmail } from "@/lib/billing/email";
import type { PlanQuality } from "@/lib/subscriptions/types";

/** Internal QA account — encode-time quality only; does not change billing or download limits. */
export const ADMIN_QUALITY_OVERRIDE_EMAIL = "llarod@gmail.com";

/** Log label for Pro Studio export tier (not a Stripe plan id). */
export const ADMIN_QUALITY_OVERRIDE_PLAN_ID = "pro_studio";

export const ADMIN_QUALITY_OVERRIDE_QUALITY: PlanQuality = "32bit_float";

export type AdminQualityOverrideAudit = {
  emailSource?: "user" | "verified_cookie" | "billing_header" | "none";
  planIdBeforeOverride?: string;
  billingEmailHint?: string | null;
};

export function maskNormalizedEmailForLog(email: string): string {
  const at = email.indexOf("@");
  if (at <= 0) return "***";
  return `${email[0]}***${email.slice(at)}`;
}

function normalizeAdminOverrideEmail(email: string | null | undefined): string | null {
  if (!email?.trim()) return null;
  return normalizeBillingEmail(email.trim());
}

export function isAdminQualityOverrideEmail(email: string | null | undefined): boolean {
  const normalized = normalizeAdminOverrideEmail(email);
  return normalized === ADMIN_QUALITY_OVERRIDE_EMAIL;
}

function shouldAuditAdminQualityOverride(
  normalizedEmail: string | null | undefined,
  billingEmailHint?: string | null
): boolean {
  if (isAdminQualityOverrideEmail(normalizedEmail)) return true;
  return isAdminQualityOverrideEmail(billingEmailHint);
}

/**
 * Forces Pro Studio float WAV encode for the internal QA email.
 * Does not mutate entitlements, Stripe rows, or download accounting.
 */
export function applyAdminQualityOverride(
  normalizedEmail: string | null | undefined,
  outputQuality: PlanQuality,
  audit?: AdminQualityOverrideAudit
): PlanQuality {
  if (!shouldAuditAdminQualityOverride(normalizedEmail, audit?.billingEmailHint)) {
    return outputQuality;
  }

  const resolvedEmail = normalizeAdminOverrideEmail(normalizedEmail);
  const hintNormalized = normalizeAdminOverrideEmail(audit?.billingEmailHint);
  const qualityBeforeOverride = outputQuality;

  console.log(
    JSON.stringify({
      event: "admin_quality_override_attempt",
      normalizedEmail: resolvedEmail,
      emailSource: audit?.emailSource ?? null,
      planIdBeforeOverride: audit?.planIdBeforeOverride ?? null,
      qualityBeforeOverride,
      billingEmailHintNormalized: hintNormalized,
      resolvedMatchesAdminConstant: resolvedEmail === ADMIN_QUALITY_OVERRIDE_EMAIL
    })
  );

  if (!resolvedEmail || resolvedEmail !== ADMIN_QUALITY_OVERRIDE_EMAIL) {
    console.log(
      JSON.stringify({
        event: "admin_quality_override_skipped",
        reason: !resolvedEmail ? "normalized_email_null_at_encode" : "normalized_email_mismatch",
        normalizedEmail: resolvedEmail,
        expectedEmail: ADMIN_QUALITY_OVERRIDE_EMAIL,
        qualityBeforeOverride,
        finalOutputQuality: outputQuality,
        finalOutputCodec:
          outputQuality === "32bit_float" ? "pcm_f32le" : outputQuality === "24bit" ? "pcm_s24le" : "pcm_s16le"
      })
    );
    return outputQuality;
  }

  console.log(
    JSON.stringify({
      event: "admin_quality_override_applied",
      normalizedEmail: maskNormalizedEmailForLog(resolvedEmail),
      emailSource: audit?.emailSource ?? null,
      planIdBeforeOverride: audit?.planIdBeforeOverride ?? null,
      qualityBeforeOverride,
      planId: ADMIN_QUALITY_OVERRIDE_PLAN_ID,
      finalOutputQuality: ADMIN_QUALITY_OVERRIDE_QUALITY,
      finalOutputCodec: "pcm_f32le"
    })
  );

  return ADMIN_QUALITY_OVERRIDE_QUALITY;
}
