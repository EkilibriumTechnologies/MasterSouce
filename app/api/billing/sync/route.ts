import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { normalizeBillingEmail } from "@/lib/billing/email";
import { reconcileFromCheckoutSession } from "@/lib/billing/reconcile-from-checkout-session";

const BodySchema = z.object({
  checkoutSessionId: z.string().min(10).optional(),
  email: z.string().optional()
});

/**
 * Lightweight reconcile after redirect from Stripe (webhooks remain source of truth).
 * Call with `checkoutSessionId` to pull subscription state from Stripe into Supabase.
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const parsed = BodySchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid body." }, { status: 400 });
    }

    if (parsed.data.checkoutSessionId) {
      const result = await reconcileFromCheckoutSession(parsed.data.checkoutSessionId);
      if (result.reconciledSubscription) {
        console.log("[billing-sync] reconciled from checkout session", {
          sessionId: parsed.data.checkoutSessionId
        });
      }
      return NextResponse.json({
        ok: true,
        email: result.emailRaw,
        normalizedEmail: result.normalizedSessionEmail
      });
    }

    if (parsed.data.email) {
      const normalized = normalizeBillingEmail(parsed.data.email);
      if (!normalized) {
        return NextResponse.json({ error: "invalid_billing_email" }, { status: 400 });
      }
      return NextResponse.json({
        ok: true,
        email: parsed.data.email.trim(),
        normalizedEmail: normalized
      });
    }

    return NextResponse.json({ error: "checkoutSessionId or email required." }, { status: 400 });
  } catch (error) {
    const detail = error instanceof Error ? error.message : "sync failed";
    console.error("[billing-sync] error", { detail });
    return NextResponse.json({ error: detail }, { status: 500 });
  }
}
