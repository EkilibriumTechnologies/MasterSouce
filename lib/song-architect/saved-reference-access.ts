import type { NextRequest } from "next/server";
import { resolveSongArchitectVerifiedContext } from "@/lib/song-architect/access";
import { hasTrustedEmailAccess, readVerifiedEmailState } from "@/lib/security/verified-email-state";

export type SavedReferenceAccessContext =
  | { ok: true; normalizedEmail: string }
  | {
      ok: false;
      code: "email_verification_required" | "email_not_allowed";
      message: string;
    };

/**
 * Reuses Song Architect trusted-email identity. Ownership is the verified cookie email,
 * never a client-supplied ownerEmail / userId / ownerId.
 */
export async function resolveSavedReferenceOwner(input: {
  request: NextRequest;
  sessionId: string;
}): Promise<SavedReferenceAccessContext> {
  const cookieState = readVerifiedEmailState(input.request);
  const access = await resolveSongArchitectVerifiedContext({
    request: input.request,
    sessionId: input.sessionId,
    billingEmailHint: cookieState?.normalizedEmail
  });
  if (!access.ok) {
    return access;
  }
  if (!hasTrustedEmailAccess(input.request, access.normalizedEmail)) {
    return {
      ok: false,
      code: "email_verification_required",
      message: "Please confirm email access before managing saved references."
    };
  }
  return { ok: true, normalizedEmail: access.normalizedEmail };
}
