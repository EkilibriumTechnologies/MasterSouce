import { NextRequest, NextResponse } from "next/server";
import { attachSessionCookieIfNeeded, prepareSessionForRequest } from "@/lib/identity/session-cookie";
import { consumeRateLimit, getClientIp, hashIdentifier, logAbuseGuard, tooManyAttemptsResponse } from "@/lib/security/abuse-guard";
import { attachTrustedEmailAccessState } from "@/lib/security/verified-email-state";
import { buildHitAnalyzerLaunchCountdown, resolveHitAnalyzerAccess } from "@/lib/ar-ai/access";

export async function GET(request: NextRequest) {
  const sessionPrep = prepareSessionForRequest(request);
  const clientIp = getClientIp(request);
  const accessRate = consumeRateLimit({
    bucket: "ar_ai_access_ip",
    key: clientIp,
    limit: 20,
    windowMs: 60 * 60 * 1000
  });
  if (!accessRate.allowed) {
    logAbuseGuard("rate_limited", {
      endpoint: "/api/ar-ai/access",
      bucket: "ar_ai_access_ip",
      ipHash: hashIdentifier(clientIp),
      retryAfterSec: accessRate.retryAfterSec
    });
    const res = tooManyAttemptsResponse(accessRate.retryAfterSec);
    attachSessionCookieIfNeeded(res, sessionPrep);
    return res;
  }

  try {
    const billingEmailHint = request.nextUrl.searchParams.get("email")?.trim() ?? undefined;
    const access = await resolveHitAnalyzerAccess({ request, billingEmailHint });
    const launch = buildHitAnalyzerLaunchCountdown();

    if (!access.ok) {
      if (access.code === "email_not_allowed") {
        const blockedAttemptsRate = consumeRateLimit({
          bucket: "blocked_email_attempts_ip",
          key: clientIp,
          limit: 10,
          windowMs: 60 * 60 * 1000
        });
        if (!blockedAttemptsRate.allowed) {
          logAbuseGuard("rate_limited", {
            endpoint: "/api/ar-ai/access",
            bucket: "blocked_email_attempts_ip",
            ipHash: hashIdentifier(clientIp),
            retryAfterSec: blockedAttemptsRate.retryAfterSec
          });
          const limited = tooManyAttemptsResponse(blockedAttemptsRate.retryAfterSec);
          attachSessionCookieIfNeeded(limited, sessionPrep);
          return limited;
        }
      }

      const res = NextResponse.json(
        {
          ok: false,
          code: access.code,
          message: access.message,
          launch,
          emailRequired: !launch.launchActive
        },
        { status: access.code === "email_verification_required" ? 403 : 403 }
      );
      attachSessionCookieIfNeeded(res, sessionPrep);
      return res;
    }

    const res = NextResponse.json({
      ok: true,
      launch,
      emailRequired: !launch.launchActive,
      usage: access.usage,
      planId: access.planId,
      unlimited: access.unlimited
    });
    if (access.normalizedEmail) {
      attachTrustedEmailAccessState(res, access.normalizedEmail);
    }
    attachSessionCookieIfNeeded(res, sessionPrep);
    return res;
  } catch (error) {
    const detail = error instanceof Error ? error.message : "Unknown Hit Analyzer access error";
    console.error("[ar-ai] access_failed", { detail });
    const res = NextResponse.json(
      {
        ok: false,
        code: "hit_analyzer_access_failed",
        message: "Unable to confirm Hit Analyzer access right now."
      },
      { status: 500 }
    );
    attachSessionCookieIfNeeded(res, sessionPrep);
    return res;
  }
}
