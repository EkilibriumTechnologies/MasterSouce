import { normalizeBillingEmail } from "@/lib/billing/email";
import { PLAN_DEFINITIONS } from "@/lib/subscriptions/plans";
import type { EntitlementSnapshot, PlanId, PlanQuality } from "@/lib/subscriptions/types";

/** Internal QA account — full platform privileges regardless of subscription state. */
export const ADMIN_ENTITLEMENT_OVERRIDE_EMAIL = "llarod@gmail.com";

/** Strongest plan used for admin entitlement override. */
export const ADMIN_ENTITLEMENT_OVERRIDE_PLAN_ID: PlanId = "pro_studio_monthly";

/** @deprecated Use ADMIN_ENTITLEMENT_OVERRIDE_EMAIL */
export const ADMIN_QUALITY_OVERRIDE_EMAIL = ADMIN_ENTITLEMENT_OVERRIDE_EMAIL;

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

export function normalizeAdminOverrideEmail(email: unknown): string | null {
  if (typeof email !== "string" || !email.trim()) return null;
  return normalizeBillingEmail(email.trim());
}

export function isAdminEntitlementOverrideEmail(email: unknown): boolean {
  const normalized = normalizeAdminOverrideEmail(email);
  return normalized === ADMIN_ENTITLEMENT_OVERRIDE_EMAIL;
}

/** @deprecated Use isAdminEntitlementOverrideEmail */
export const isAdminQualityOverrideEmail = isAdminEntitlementOverrideEmail;

/**
 * Grants full Pro Studio entitlements for the internal QA email.
 * Does not mutate Stripe rows or download accounting.
 */
export function applyAdminEntitlementOverride(
  entitlements: EntitlementSnapshot,
  email: unknown
): EntitlementSnapshot {
  if (!isAdminEntitlementOverrideEmail(email)) {
    return entitlements;
  }

  const proPlan = PLAN_DEFINITIONS[ADMIN_ENTITLEMENT_OVERRIDE_PLAN_ID];

  console.log(
    JSON.stringify({
      event: "admin_entitlement_override_applied",
      normalizedEmail: maskNormalizedEmailForLog(normalizeAdminOverrideEmail(email)!),
      planIdBeforeOverride: entitlements.planId,
      canDownloadBeforeOverride: entitlements.canDownload,
      qualityBeforeOverride: entitlements.quality,
      planId: ADMIN_ENTITLEMENT_OVERRIDE_PLAN_ID,
      quality: proPlan.quality
    })
  );

  return {
    ...entitlements,
    planId: ADMIN_ENTITLEMENT_OVERRIDE_PLAN_ID,
    canMaster: true,
    canDownload: true,
    monthlyMastersLimit: proPlan.monthlyMastersLimit,
    remainingMonthlyMasters: null,
    remainingMasters: null,
    quality: proPlan.quality,
    customerPortalEligible: proPlan.canUseCustomerPortal && Boolean(entitlements.stripeCustomerId)
  };
}

function shouldAuditAdminQualityOverride(
  normalizedEmail: string | null | undefined,
  billingEmailHint?: string | null
): boolean {
  if (isAdminEntitlementOverrideEmail(normalizedEmail)) return true;
  return isAdminEntitlementOverrideEmail(billingEmailHint);
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
      resolvedMatchesAdminConstant: resolvedEmail === ADMIN_ENTITLEMENT_OVERRIDE_EMAIL
    })
  );

  if (!resolvedEmail || resolvedEmail !== ADMIN_ENTITLEMENT_OVERRIDE_EMAIL) {
    console.log(
      JSON.stringify({
        event: "admin_quality_override_skipped",
        reason: !resolvedEmail ? "normalized_email_null_at_encode" : "normalized_email_mismatch",
        normalizedEmail: resolvedEmail,
        expectedEmail: ADMIN_ENTITLEMENT_OVERRIDE_EMAIL,
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
