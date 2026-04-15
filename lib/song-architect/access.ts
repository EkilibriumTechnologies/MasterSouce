import type { NextRequest } from "next/server";
import { MASTERSOUCE_BILLING_EMAIL_HEADER } from "@/lib/billing/client-key";
import { normalizeBillingEmail } from "@/lib/billing/email";
import { resolveSongArchitectUsageForEmail, type SongArchitectUsageSnapshot } from "@/lib/song-architect/entitlements";

export type SongArchitectVerifiedContext = {
  normalizedEmail: string;
  usage: SongArchitectUsageSnapshot;
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
): Promise<SongArchitectVerifiedContext | null> {
  const persistedEmailRaw = resolvePersistedBillingEmailContext(input.request, input.billingEmailHint);
  const normalizedEmail = persistedEmailRaw ? normalizeBillingEmail(persistedEmailRaw) : null;
  const foundPersistedVerifiedEmail = Boolean(normalizedEmail);

  console.info("[song-architect] verification_context", {
    sessionId: input.sessionId,
    foundPersistedVerifiedEmail
  });

  if (!normalizedEmail) {
    console.info("[song-architect] verification_required", {
      sessionId: input.sessionId,
      reason: "missing_persisted_verified_email"
    });
    return null;
  }

  const usage = await resolveSongArchitectUsageForEmail(normalizedEmail);
  return { normalizedEmail, usage };
}
