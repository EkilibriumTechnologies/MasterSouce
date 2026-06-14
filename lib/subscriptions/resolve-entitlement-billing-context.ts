import type { NextRequest } from "next/server";
import { MASTERSOUCE_BILLING_EMAIL_HEADER } from "@/lib/billing/client-key";
import { normalizeBillingEmail } from "@/lib/billing/email";
import { recordJobExportEncodeResolution } from "@/lib/jobs/job-export-verify";
import type { EntitlementBillingContext } from "@/lib/subscriptions/entitlements";
import { readVerifiedEmailState } from "@/lib/security/verified-email-state";
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
export function resolveEntitlementBillingContext(
  request: NextRequest,
  user: UserProfile
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

  return {
    billingContext: {},
    normalizedEmail: null,
    emailSource: "none"
  };
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
