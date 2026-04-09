import { NextRequest, NextResponse } from "next/server";
import { buildApiUser } from "@/lib/identity/api-user";
import { attachSessionCookieIfNeeded, prepareSessionForRequest } from "@/lib/identity/session-cookie";
import { getEntitlementsForUser } from "@/lib/subscriptions/entitlements";

function isAdaptiveDevBypassEnabled(): boolean {
  const raw = process.env.ADAPTIVE_DEV_BYPASS?.trim().toLowerCase() ?? "";
  return raw === "1" || raw === "true" || raw === "yes" || raw === "on";
}

export async function GET(request: NextRequest) {
  try {
    const sessionPrep = prepareSessionForRequest(request);
    const user = buildApiUser(request, sessionPrep.sessionId);
    const entitlements = await getEntitlementsForUser(user);
    const isDevBypass = process.env.NODE_ENV !== "production" && isAdaptiveDevBypassEnabled();
    const entitled = isDevBypass || entitlements.planId !== "free";
    if (process.env.NODE_ENV !== "production") {
      console.log("[ADAPTIVE_ACCESS_DEBUG] entitlement check", {
        isDevBypass,
        adaptiveDevBypassRaw: process.env.ADAPTIVE_DEV_BYPASS ?? null,
        planId: entitlements.planId,
        entitled
      });
    }
    const response = NextResponse.json({
      entitled,
      planId: entitlements.planId,
      upgradeUrl: entitled ? null : "/pricing"
    });
    attachSessionCookieIfNeeded(response, sessionPrep);
    return response;
  } catch (error) {
    const detail = error instanceof Error ? error.message : "Unknown entitlement error.";
    return NextResponse.json({ error: `Unable to verify adaptive access. ${detail}` }, { status: 500 });
  }
}
