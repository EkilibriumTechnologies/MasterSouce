import { NextRequest, NextResponse } from "next/server";
import type { EmailOtpType } from "@supabase/supabase-js";
import { attachAppSession } from "@/lib/auth/app-session";
import {
  consumeRateLimit,
  getClientIp,
  hashIdentifier,
  logAbuseGuard
} from "@/lib/security/abuse-guard";
import { attachTrustedEmailAccessState } from "@/lib/security/verified-email-state";
import { createSupabaseAuthServerClient } from "@/lib/supabase/public-server";
import { upsertVerifiedMasterSauceUser } from "@/lib/users/store";

// Magic-link (and first-time sign-up confirmation) token hashes only. Recovery, invite and
// email-change links are not sign-in proofs for MasterSauce.
const ALLOWED_OTP_TYPES: readonly EmailOtpType[] = ["email", "magiclink", "signup"];
const MAX_TOKEN_HASH_LENGTH = 512;

export const dynamic = "force-dynamic";

function redirectTo(path: string): NextResponse {
  return new NextResponse(null, {
    status: 303,
    headers: {
      // Relative so the browser stays on the host that receives the cookies (www vs apex).
      Location: path,
      "Cache-Control": "no-store",
      "Referrer-Policy": "no-referrer"
    }
  });
}

function isAllowedOtpType(value: string): value is EmailOtpType {
  return (ALLOWED_OTP_TYPES as readonly string[]).includes(value);
}

/**
 * Server-side magic-link confirmation (Supabase token_hash flow for server-rendered apps).
 * Supabase proves mailbox ownership; MasterSauce then links the stable public.users.id and
 * issues its own signed HTTP-only `ms_account` session. Supabase tokens never reach the browser.
 */
export async function GET(request: NextRequest) {
  const tokenHash = request.nextUrl.searchParams.get("token_hash")?.trim() ?? "";
  const type = request.nextUrl.searchParams.get("type")?.trim() ?? "";
  if (!tokenHash || tokenHash.length > MAX_TOKEN_HASH_LENGTH || !isAllowedOtpType(type)) {
    return redirectTo("/projects?auth_error=invalid_link");
  }

  const clientIp = getClientIp(request);
  const ipRate = consumeRateLimit({
    bucket: "account_magic_link_confirm_ip",
    key: clientIp,
    limit: 30,
    windowMs: 60 * 60 * 1000
  });
  if (!ipRate.allowed) {
    logAbuseGuard("rate_limited", {
      endpoint: "/auth/confirm",
      bucket: "account_magic_link_confirm_ip",
      ipHash: hashIdentifier(clientIp),
      retryAfterSec: ipRate.retryAfterSec
    });
    return redirectTo("/projects?auth_error=rate_limited");
  }

  const supabase = createSupabaseAuthServerClient();
  const { data, error } = await supabase.auth.verifyOtp({ token_hash: tokenHash, type });
  const authUser = data?.user ?? null;

  if (
    error ||
    !authUser?.id ||
    !authUser.email ||
    !authUser.email_confirmed_at ||
    authUser.is_anonymous
  ) {
    console.warn("[auth] magic_link_verify_failed", {
      status: error?.status ?? null,
      code: error?.code ?? null,
      hasUser: Boolean(authUser?.id),
      emailConfirmed: Boolean(authUser?.email_confirmed_at)
    });
    return redirectTo("/projects?auth_error=invalid_link");
  }

  try {
    const { user, historyLink } = await upsertVerifiedMasterSauceUser({
      authUserId: authUser.id,
      email: authUser.email
    });
    if (!historyLink.ok) {
      console.error("[auth] history_link_incomplete", {
        userId: user.id,
        failedTables: historyLink.failedTables
      });
    }

    const res = redirectTo("/projects");
    attachAppSession(res, {
      userId: user.id,
      authUserId: authUser.id,
      normalizedEmail: user.normalizedEmail
    });
    // A verified mailbox is the strongest billing identity proof MasterSauce has.
    attachTrustedEmailAccessState(res, user.normalizedEmail, "authenticated_user");
    return res;
  } catch (linkError) {
    console.error("[auth] account_link_failed", {
      authUserIdHash: hashIdentifier(authUser.id),
      message: linkError instanceof Error ? linkError.message : String(linkError)
    });
    return redirectTo("/projects?auth_error=account_unavailable");
  } finally {
    // MasterSauce never uses the Supabase session itself; revoke its refresh token.
    await supabase.auth.signOut({ scope: "local" }).catch(() => undefined);
  }
}
