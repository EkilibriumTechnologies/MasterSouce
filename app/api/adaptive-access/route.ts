import { NextRequest, NextResponse } from "next/server";
import { resolveAdaptiveEntitlementForEmail } from "@/lib/billing/adaptive-resolve";
import { isAdaptiveDevBypassEnabled } from "@/lib/billing/adaptive-dev-bypass";
import { buildApiUser } from "@/lib/identity/api-user";
import { attachSessionCookieIfNeeded, prepareSessionForRequest } from "@/lib/identity/session-cookie";

export async function GET(request: NextRequest) {
  try {
    const sessionPrep = prepareSessionForRequest(request);
    const user = buildApiUser(request, sessionPrep.sessionId);

    const headerRaw = request.headers.get("x-mastersouce-billing-email")?.trim() ?? "";
    const queryRaw = request.nextUrl.searchParams.get("email")?.trim() ?? "";
    const sessionEmail = user.email?.trim().toLowerCase() ?? "";
    const rawBillingEmail = headerRaw || queryRaw || sessionEmail;

    const resolved = await resolveAdaptiveEntitlementForEmail(rawBillingEmail || undefined, {
      stripeEmailFallback: true
    });

    const isDevBypass = process.env.NODE_ENV !== "production" && isAdaptiveDevBypassEnabled();
    const entitled = isDevBypass || resolved.entitled;

    console.log(
      JSON.stringify({
        scope: "adaptive_access",
        event: "entitlement_check",
        isDevBypass,
        hasBillingEmailHint: Boolean(rawBillingEmail),
        resolvedReason: resolved.reason,
        entitled,
        stripeEmailSyncAttempted: resolved.stripeEmailSyncAttempted,
        stripeEmailSyncRecovered: resolved.stripeEmailSyncRecovered
      })
    );

    const response = NextResponse.json({
      entitled,
      requiresCheckout: !entitled,
      reason: isDevBypass ? "dev_bypass" : resolved.reason,
      planId: resolved.planId,
      subscriptionStatus: resolved.subscriptionStatus,
      entitlementActive: resolved.entitlementActive,
      upgradeUrl: entitled ? null : "/pricing",
      /** Checkout is started client-side (e.g. Adaptive export gate); not a redirect URL from this GET. */
      checkoutUrl: null as string | null
    });
    attachSessionCookieIfNeeded(response, sessionPrep);
    return response;
  } catch (error) {
    const detail = error instanceof Error ? error.message : "Unknown entitlement error.";
    return NextResponse.json({ error: `Unable to verify adaptive access. ${detail}` }, { status: 500 });
  }
}
