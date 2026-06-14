import type { PlanQuality } from "@/lib/subscriptions/types";

/** Internal QA account — encode-time quality only; does not change billing or download limits. */
export const ADMIN_QUALITY_OVERRIDE_EMAIL = "llarod01@gmail.com";

/** Log label for Pro Studio export tier (not a Stripe plan id). */
export const ADMIN_QUALITY_OVERRIDE_PLAN_ID = "pro_studio";

export const ADMIN_QUALITY_OVERRIDE_QUALITY: PlanQuality = "32bit_float";

export function maskNormalizedEmailForLog(email: string): string {
  const at = email.indexOf("@");
  if (at <= 0) return "***";
  return `${email[0]}***${email.slice(at)}`;
}

/**
 * Forces Pro Studio float WAV encode for the internal QA email.
 * Does not mutate entitlements, Stripe rows, or download accounting.
 */
export function applyAdminQualityOverride(
  normalizedEmail: string | null | undefined,
  outputQuality: PlanQuality
): PlanQuality {
  if (!normalizedEmail || normalizedEmail !== ADMIN_QUALITY_OVERRIDE_EMAIL) {
    return outputQuality;
  }

  console.log(
    JSON.stringify({
      event: "admin_quality_override",
      normalizedEmail: maskNormalizedEmailForLog(normalizedEmail),
      planId: ADMIN_QUALITY_OVERRIDE_PLAN_ID,
      quality: ADMIN_QUALITY_OVERRIDE_QUALITY
    })
  );

  return ADMIN_QUALITY_OVERRIDE_QUALITY;
}
