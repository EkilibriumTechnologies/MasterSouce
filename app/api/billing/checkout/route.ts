import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getAdaptiveEntitlementByEmail } from "@/lib/billing/store";
import { normalizeBillingEmail } from "@/lib/billing/email";
import { getStripeClient, getStripeCreditPackPriceId, getStripePriceIdForPlan } from "@/lib/stripe/server";

const BodySchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("subscription"),
    planId: z.enum(["creator_monthly", "pro_studio_monthly"]),
    email: z.string(),
    returnTo: z.string().optional(),
    intent: z.enum(["adaptive"]).optional()
  }),
  z.object({
    kind: z.literal("credit_pack"),
    email: z.string(),
    returnTo: z.string().optional(),
    intent: z.enum(["adaptive"]).optional()
  })
]);
const BILLING_EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function resolveBaseUrl(request: NextRequest): string {
  const env = process.env.NEXT_PUBLIC_APP_URL?.trim();
  if (env) return env.replace(/\/+$/, "");
  const origin = request.nextUrl.origin?.trim();
  return origin ? origin.replace(/\/+$/, "") : "http://localhost:3000";
}

function resolveSafeReturnPath(rawReturnTo: string | undefined): string {
  const trimmed = rawReturnTo?.trim() ?? "";
  if (!trimmed || !trimmed.startsWith("/") || trimmed.startsWith("//")) return "/";
  return trimmed;
}

/** Stripe replaces `{CHECKOUT_SESSION_ID}`; must not be URL-encoded. */
function appendStripeCheckoutSessionPlaceholder(successUrl: URL): string {
  const base = successUrl.toString();
  const sep = base.includes("?") ? "&" : "?";
  return `${base}${sep}session_id={CHECKOUT_SESSION_ID}`;
}

export async function POST(request: NextRequest) {
  try {
    const payload = await request.json();
    const parsed = BodySchema.safeParse(payload);
    if (!parsed.success) {
      const hasEmailIssue = parsed.error.issues.some((issue) => issue.path[0] === "email");
      if (hasEmailIssue) {
        return NextResponse.json(
          { error: "invalid_billing_email", message: "Enter a valid email address." },
          { status: 400 }
        );
      }
      return NextResponse.json({ error: "Invalid checkout payload." }, { status: 400 });
    }
    const baseUrl = resolveBaseUrl(request);
    const stripe = getStripeClient();
    const email = parsed.data.email.trim().toLowerCase();
    if (!BILLING_EMAIL_REGEX.test(email)) {
      return NextResponse.json(
        { error: "invalid_billing_email", message: "Enter a valid email address." },
        { status: 400 }
      );
    }

    if (parsed.data.kind === "subscription" && parsed.data.intent === "adaptive") {
      const normalized = normalizeBillingEmail(email);
      const row = normalized ? await getAdaptiveEntitlementByEmail(normalized) : null;
      if (row?.isActive) {
        console.log("[billing-checkout] adaptive: skip checkout, billing_entitlements active", { email: normalized });
        return NextResponse.json(
          {
            alreadyEntitled: true,
            message: "You already have access to Adaptive mastering for this billing email."
          },
          { status: 200 }
        );
      }
    }

    const returnPath = resolveSafeReturnPath(parsed.data.returnTo);
    const successUrl = new URL(returnPath, `${baseUrl}/`);
    successUrl.searchParams.set("checkout", "success");
    successUrl.searchParams.set("kind", parsed.data.kind === "subscription" ? "subscription" : "credit_pack");
    if (parsed.data.kind === "subscription" && parsed.data.intent === "adaptive") {
      successUrl.searchParams.set("upgraded", "1");
      successUrl.searchParams.set("intent", "adaptive");
    }

    const session = await stripe.checkout.sessions.create({
      mode: parsed.data.kind === "subscription" ? "subscription" : "payment",
      customer_email: email,
      line_items: [
        {
          price:
            parsed.data.kind === "subscription"
              ? getStripePriceIdForPlan(parsed.data.planId)
              : getStripeCreditPackPriceId(),
          quantity: 1
        }
      ],
      success_url:
        parsed.data.kind === "subscription" ? appendStripeCheckoutSessionPlaceholder(successUrl) : successUrl.toString(),
      cancel_url: `${baseUrl}/pricing?checkout=cancel`,
      metadata:
        parsed.data.kind === "subscription"
          ? { product_type: "subscription", plan_id: parsed.data.planId }
          : { product_type: "credit_pack", credits_added: "5" },
      subscription_data:
        parsed.data.kind === "subscription"
          ? {
              metadata: {
                plan_id: parsed.data.planId,
                product_type: "subscription"
              }
            }
          : undefined
    });

    if (!session.url) {
      return NextResponse.json({ error: "Unable to start checkout session." }, { status: 500 });
    }
    if (parsed.data.kind === "subscription" && parsed.data.intent === "adaptive") {
      console.log("[billing-checkout] adaptive: Stripe checkout session created (user explicitly started checkout)");
    }
    return NextResponse.json({ url: session.url });
  } catch (error) {
    const detail = error instanceof Error ? error.message : "Unknown checkout error.";
    return NextResponse.json({ error: detail }, { status: 500 });
  }
}
