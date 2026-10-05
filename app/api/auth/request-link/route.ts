import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import {
  consumeRateLimit,
  getClientIp,
  hashIdentifier,
  logAbuseGuard,
  tooManyAttemptsResponse
} from "@/lib/security/abuse-guard";
import { validateEmailAddress } from "@/lib/security/validate-email-address";
import { resolveAuthRedirectBaseUrl } from "@/lib/auth/redirect";
import { createSupabaseAuthServerClient } from "@/lib/supabase/public-server";

const BodySchema = z.object({ email: z.string().min(3).max(320) });

export async function POST(request: NextRequest) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Expected JSON body." }, { status: 400 });
  }

  const parsed = BodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Enter a valid email address." }, { status: 400 });
  }

  const validation = validateEmailAddress(parsed.data.email);
  if (!validation.allowed || !validation.normalizedEmail) {
    return NextResponse.json(
      { error: "Please use your regular email address." },
      { status: 400 }
    );
  }

  const clientIp = getClientIp(request);
  const ipRate = consumeRateLimit({
    bucket: "account_magic_link_ip",
    key: clientIp,
    limit: 8,
    windowMs: 60 * 60 * 1000
  });
  if (!ipRate.allowed) {
    logAbuseGuard("rate_limited", {
      endpoint: "/api/auth/request-link",
      bucket: "account_magic_link_ip",
      ipHash: hashIdentifier(clientIp),
      retryAfterSec: ipRate.retryAfterSec
    });
    return tooManyAttemptsResponse(ipRate.retryAfterSec);
  }

  const emailRate = consumeRateLimit({
    bucket: "account_magic_link_email",
    key: validation.normalizedEmail,
    limit: 5,
    windowMs: 60 * 60 * 1000
  });
  if (!emailRate.allowed) {
    return tooManyAttemptsResponse(emailRate.retryAfterSec);
  }

  const supabase = createSupabaseAuthServerClient();
  const { error } = await supabase.auth.signInWithOtp({
    email: validation.normalizedEmail,
    options: {
      shouldCreateUser: true,
      // Must be on the Supabase Auth redirect allow list. The email template links to
      // /auth/confirm?token_hash=...&type=email, which verifies the link server-side.
      emailRedirectTo: `${resolveAuthRedirectBaseUrl(request)}/auth/confirm`
    }
  });

  if (error) {
    console.error("[auth] magic_link_request_failed", {
      message: error.message,
      status: error.status ?? null
    });
    return NextResponse.json(
      { error: "Unable to send the sign-in link right now." },
      { status: 502 }
    );
  }

  return NextResponse.json({
    ok: true,
    message: "Check your email for your MasterSauce sign-in link."
  });
}
