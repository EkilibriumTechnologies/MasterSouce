import type { NextRequest } from "next/server";
import { MASTERSOUCE_BILLING_EMAIL_HEADER } from "@/lib/billing/client-key";
import { normalizeBillingEmail } from "@/lib/billing/email";
import { recordJobExportEncodeResolution } from "@/lib/jobs/job-export-verify";
import {
  ADMIN_ENTITLEMENT_OVERRIDE_EMAIL,
  applyAdminQualityOverride,
  isAdminEntitlementOverrideEmail
} from "@/lib/subscriptions/admin-entitlement-override";
import type { EntitlementBillingContext } from "@/lib/subscriptions/entitlements";
import { isMasterAdminBypassGranted } from "@/lib/subscriptions/master-admin-bypass";
import { readVerifiedEmailState } from "@/lib/security/verified-email-state";
import type { PlanQuality } from "@/lib/subscriptions/types";
import type { UserProfile } from "@/lib/users/user-profile";

export type EntitlementEmailSource = "user" | "owner_bypass" | "verified_cookie" | "billing_header" | "none";

export type EntitlementBillingResolution = {
  billingContext: EntitlementBillingContext;
  normalizedEmail: string | null;
  emailSource: EntitlementEmailSource;
  adminOverrideAllowed: boolean;
  adminOverrideGranted: boolean;
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
        billingContext: { normalizedEmail: normalized, adminOverrideAllowed: true },
        normalizedEmail: normalized,
        emailSource: "user",
        adminOverrideAllowed: true,
        adminOverrideGranted: isAdminEntitlementOverrideEmail(normalized)
      };
    }
  }

  if (isMasterAdminBypassGranted(request)) {
    return {
      billingContext: {
        normalizedEmail: ADMIN_ENTITLEMENT_OVERRIDE_EMAIL,
        adminOverrideAllowed: true
      },
      normalizedEmail: ADMIN_ENTITLEMENT_OVERRIDE_EMAIL,
      emailSource: "owner_bypass",
      adminOverrideAllowed: true,
      adminOverrideGranted: true
    };
  }

  const verified = readVerifiedEmailState(request);
  if (verified?.normalizedEmail) {
    const normalized = normalizeBillingEmail(verified.normalizedEmail);
    if (normalized) {
      return {
        billingContext: { normalizedEmail: normalized, adminOverrideAllowed: true },
        normalizedEmail: normalized,
        emailSource: "verified_cookie",
        adminOverrideAllowed: true,
        adminOverrideGranted: isAdminEntitlementOverrideEmail(normalized)
      };
    }
  }

  const headerRaw = request.headers.get(MASTERSOUCE_BILLING_EMAIL_HEADER)?.trim() ?? "";
  if (headerRaw) {
    const normalized = normalizeBillingEmail(headerRaw);
    if (normalized) {
      return {
        billingContext: { normalizedEmail: normalized, adminOverrideAllowed: false },
        normalizedEmail: normalized,
        emailSource: "billing_header",
        adminOverrideAllowed: false,
        adminOverrideGranted: false
      };
    }
  }

  const hintRaw = hints?.billingEmailHint?.trim() ?? "";
  if (hintRaw) {
    const normalized = normalizeBillingEmail(hintRaw);
    if (normalized) {
      return {
        billingContext: { normalizedEmail: normalized, adminOverrideAllowed: false },
        normalizedEmail: normalized,
        emailSource: "billing_header",
        adminOverrideAllowed: false,
        adminOverrideGranted: false
      };
    }
  }

  return {
    billingContext: {},
    normalizedEmail: null,
    emailSource: "none",
    adminOverrideAllowed: true,
    adminOverrideGranted: false
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
  normalizedEmail: string | null,
  audit?: { planIdBeforeOverride?: string; billingEmailHint?: string | null; adminOverrideAllowed?: boolean }
): PlanQuality {
  const base = resolveMasteringOutputQuality(entitlementQuality, emailSource);
  return applyAdminQualityOverride(normalizedEmail, base, {
    emailSource,
    planIdBeforeOverride: audit?.planIdBeforeOverride,
    billingEmailHint: audit?.billingEmailHint,
    adminOverrideAllowed: audit?.adminOverrideAllowed
  });
}

/**
 * Final delivery output quality on unlock/download (email is always known).
 * Applies the internal QA email override without changing billing entitlements.
 */
export function resolveDeliveryOutputQuality(
  entitlementQuality: PlanQuality,
  normalizedEmail: string,
  audit?: { planIdBeforeOverride?: string; emailSource?: EntitlementEmailSource }
): PlanQuality {
  return applyAdminQualityOverride(normalizedEmail, entitlementQuality, {
    emailSource: audit?.emailSource ?? "verified_cookie",
    planIdBeforeOverride: audit?.planIdBeforeOverride
  });
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
  adminOverrideGranted?: boolean;
}): void {
  void recordJobExportEncodeResolution({
    endpoint: params.endpoint,
    jobId: params.jobId,
    planId: params.planId,
    outputQuality: params.outputQuality,
    outputCodec: params.outputCodec,
    emailSource: params.emailSource,
    normalizedEmail: params.normalizedEmail,
    adminOverrideGranted: params.adminOverrideGranted === true
  });
}
