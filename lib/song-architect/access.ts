import type { NextRequest } from "next/server";
import { MASTERSOUCE_BILLING_EMAIL_HEADER } from "@/lib/billing/client-key";
import { normalizeBillingEmail } from "@/lib/billing/email";
import { getClientIp, hashIdentifier, logAbuseGuard, maskEmail, shouldChallengeSuspiciousRequest } from "@/lib/security/abuse-guard";
import { validateEmailAddress } from "@/lib/security/validate-email-address";
import { readVerifiedEmailState } from "@/lib/security/verified-email-state";
import {
  ADMIN_ENTITLEMENT_OVERRIDE_EMAIL
} from "@/lib/subscriptions/admin-entitlement-override";
import { isMasterAdminBypassGranted } from "@/lib/subscriptions/master-admin-bypass";
import { resolveSongArchitectUsageForEmail, type SongArchitectUsageSnapshot } from "@/lib/song-architect/entitlements";

export type SongArchitectAccessContext =
  | {
      ok: true;
      normalizedEmail: string;
      identityTrusted: boolean;
      usage: SongArchitectUsageSnapshot;
    }
  | {
      ok: false;
      code: "email_verification_required" | "email_not_allowed";
      message: string;
    };

type ResolveSongArchitectVerifiedContextInput = {
  request: NextRequest;
  sessionId: string;
  billingEmailHint?: string;
};

function resolvePersistedBillingEmailContext(
  request: NextRequest,
  billingEmailHint?: string
): { rawEmail: string; identityTrusted: boolean } {
  if (isMasterAdminBypassGranted(request)) {
    return { rawEmail: ADMIN_ENTITLEMENT_OVERRIDE_EMAIL, identityTrusted: true };
  }
  const verified = readVerifiedEmailState(request)?.normalizedEmail?.trim() ?? "";
  if (verified) {
    return { rawEmail: verified, identityTrusted: true };
  }
  const fromHeader = request.headers.get(MASTERSOUCE_BILLING_EMAIL_HEADER)?.trim() ?? "";
  const fromQuery = request.nextUrl.searchParams.get("email")?.trim() ?? "";
  const fromHint = billingEmailHint?.trim() ?? "";
  return { rawEmail: fromHeader || fromQuery || fromHint, identityTrusted: false };
}

export async function resolveSongArchitectVerifiedContext(
  input: ResolveSongArchitectVerifiedContextInput
): Promise<SongArchitectAccessContext> {
  const emailContext = resolvePersistedBillingEmailContext(input.request, input.billingEmailHint);
  const persistedEmailRaw = emailContext.rawEmail;
  if (!persistedEmailRaw) {
    console.info("[song-architect] verification_required", {
      sessionId: input.sessionId,
      reason: "missing_persisted_verified_email"
    });
    return {
      ok: false,
      code: "email_verification_required",
      message: "Confirm email access to unlock Song Architect generation."
    };
  }

  const emailValidation = validateEmailAddress(persistedEmailRaw);
  if (!emailValidation.allowed || !emailValidation.normalizedEmail) {
    const validationReason = emailValidation.reason ?? "invalid_format";
    if (
      validationReason === "blocked_domain" ||
      validationReason === "disposable_domain" ||
      validationReason === "suspicious_local_part"
    ) {
      const ip = getClientIp(input.request);
      logAbuseGuard(validationReason, {
        endpoint: "/api/song-architect/access",
        ipHash: hashIdentifier(ip),
        emailMasked: maskEmail(persistedEmailRaw),
        challenge: shouldChallengeSuspiciousRequest({
          suspiciousReason: validationReason,
          ip
        })
      });
    }
    console.info("[song-architect] verification_required", {
      sessionId: input.sessionId,
      reason: "abusive_or_invalid_email",
      validationReason
    });
    return {
      ok: false,
      code: "email_not_allowed",
      message: "Please use a real email address (temporary/disposable test inboxes are blocked)."
    };
  }

  const normalizedEmail = normalizeBillingEmail(emailValidation.normalizedEmail);
  const foundPersistedVerifiedEmail = Boolean(normalizedEmail);

  console.info("[song-architect] verification_context", {
    sessionId: input.sessionId,
    foundPersistedVerifiedEmail
  });

  if (!normalizedEmail) {
    return {
      ok: false,
      code: "email_verification_required",
      message: "Confirm email access to unlock Song Architect generation."
    };
  }

  const usage = await resolveSongArchitectUsageForEmail(normalizedEmail, {
    billingLookupAllowed: emailContext.identityTrusted
  });
  return {
    ok: true,
    normalizedEmail,
    identityTrusted: emailContext.identityTrusted,
    usage
  };
}
