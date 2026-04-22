import type { NextRequest } from "next/server";
import { MASTERSOUCE_BILLING_EMAIL_HEADER } from "@/lib/billing/client-key";
import { normalizeBillingEmail } from "@/lib/billing/email";
import { getClientIp, hashIdentifier, logAbuseGuard, maskEmail, shouldChallengeSuspiciousRequest } from "@/lib/security/abuse-guard";
import { validateEmailAddress } from "@/lib/security/validate-email-address";
import { resolveSongArchitectUsageForEmail, type SongArchitectUsageSnapshot } from "@/lib/song-architect/entitlements";

export type SongArchitectAccessContext =
  | {
      ok: true;
      normalizedEmail: string;
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

function resolvePersistedBillingEmailContext(request: NextRequest, billingEmailHint?: string): string {
  const fromHeader = request.headers.get(MASTERSOUCE_BILLING_EMAIL_HEADER)?.trim() ?? "";
  const fromQuery = request.nextUrl.searchParams.get("email")?.trim() ?? "";
  const fromHint = billingEmailHint?.trim() ?? "";
  return fromHeader || fromQuery || fromHint;
}

export async function resolveSongArchitectVerifiedContext(
  input: ResolveSongArchitectVerifiedContextInput
): Promise<SongArchitectAccessContext> {
  const persistedEmailRaw = resolvePersistedBillingEmailContext(input.request, input.billingEmailHint);
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

  const usage = await resolveSongArchitectUsageForEmail(normalizedEmail);
  return { ok: true, normalizedEmail, usage };
}
