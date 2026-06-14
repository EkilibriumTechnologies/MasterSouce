import type { NextRequest } from "next/server";
import { MASTERSOUCE_BILLING_EMAIL_HEADER } from "@/lib/billing/client-key";
import { normalizeBillingEmail } from "@/lib/billing/email";
import { recordJobExportEncodeResolution } from "@/lib/jobs/job-export-verify";
import { applyAdminQualityOverride } from "@/lib/subscriptions/admin-quality-override";
import type { EntitlementBillingContext } from "@/lib/subscriptions/entitlements";
import { readVerifiedEmailState } from "@/lib/security/verified-email-state";
import type { PlanQuality } from "@/lib/subscriptions/types";
import type { UserProfile } from "@/lib/users/user-profile";

export type EntitlementEmailSource = "user" | "verified_cookie" | "billing_header" | "none";

export type EntitlementBillingResolution = {
  billingContext: EntitlementBillingContext;
  normalizedEmail: string | null;
  emailSource: EntitlementEmailSource;
};

/**
 * Resolves server-trusted billing email for plan/quality lookup at encode time.
 * Priority: authenticated user email → signed verified cookie → billing email header.
 * Does not accept client planId; subscription lookup remains in getEntitlementsForUser.
 */
export type EntitlementBillingHints = {
  /** Form field or JSON body fallback when custom headers are stripped upstream. */
  billingEmailHint?: string | null;
};

export function resolveEntitlementBillingContext(
  request: NextRequest,
  user: UserProfile,
  hints?: EntitlementBillingHints
): EntitlementBillingResolution {
  const userEmailRaw = user.email?.trim().toLowerCase() ?? "";
  if (userEmailRaw) {
    const normalized = normalizeBillingEmail(userEmailRaw);
    if (normalized) {
      return {
        billingContext: { normalizedEmail: normalized },
        normalizedEmail: normalized,
        emailSource: "user"
      };
    }
  }

  const verified = readVerifiedEmailState(request);
  if (verified?.normalizedEmail) {
    const normalized = normalizeBillingEmail(verified.normalizedEmail);
    if (normalized) {
      return {
        billingContext: { normalizedEmail: normalized },
        normalizedEmail: normalized,
        emailSource: "verified_cookie"
      };
    }
  }

  const headerRaw = request.headers.get(MASTERSOUCE_BILLING_EMAIL_HEADER)?.trim() ?? "";
  if (headerRaw) {
    const normalized = normalizeBillingEmail(headerRaw);
    if (normalized) {
      return {
        billingContext: { normalizedEmail: normalized },
        normalizedEmail: normalized,
        emailSource: "billing_header"
      };
    }
  }

  const hintRaw = hints?.billingEmailHint?.trim() ?? "";
  if (hintRaw) {
    const normalized = normalizeBillingEmail(hintRaw);
    if (normalized) {
      return {
        billingContext: { normalizedEmail: normalized },
        normalizedEmail: normalized,
        emailSource: "billing_header"
      };
    }
  }

  return {
    billingContext: {},
    normalizedEmail: null,
    emailSource: "none"
  };
}

/** Internal archive quality when billing email is unknown at encode time (unlock resolves delivery). */
export const WAV_DELIVERY_DEFERRED_ARCHIVE_QUALITY: PlanQuality = "32bit_float";

export function shouldDeferWavDeliveryCodec(emailSource: EntitlementEmailSource): boolean {
  return emailSource === "none";
}

/**
 * Maps entitlements to the pipeline output quality at encode time.
 * When billing context is missing, archive as float so unlock can mux to the plan codec.
 */
export function resolveMasteringOutputQuality(
  entitlementQuality: PlanQuality,
  emailSource: EntitlementEmailSource
): PlanQuality {
  return shouldDeferWavDeliveryCodec(emailSource) ? WAV_DELIVERY_DEFERRED_ARCHIVE_QUALITY : entitlementQuality;
}

/**
 * Final encode-time output quality for /api/master and /api/master-ai.
 * Applies deferred-archive rules, then the internal QA email override (server-trusted email only).
 */
export function resolveEncodeOutputQuality(
  entitlementQuality: PlanQuality,
  emailSource: EntitlementEmailSource,
  normalizedEmail: string | null
): PlanQuality {
  const base = resolveMasteringOutputQuality(entitlementQuality, emailSource);
  return applyAdminQualityOverride(normalizedEmail, base);
}

export function logWavExportEntitlementResolution(params: {
  endpoint: "/api/master" | "/api/master-ai";
  jobId: string;
  userId: string;
  normalizedEmail: string | null;
  emailSource: EntitlementEmailSource;
  planId: string;
  outputQuality: string;
  outputCodec: string;
}): void {
  void recordJobExportEncodeResolution({
    endpoint: params.endpoint,
    jobId: params.jobId,
    planId: params.planId,
    outputQuality: params.outputQuality,
    outputCodec: params.outputCodec,
    emailSource: params.emailSource,
    normalizedEmail: params.normalizedEmail
  });
}
