import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
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
      success_url: successUrl.toString(),
      cancel_url: `${baseUrl}/pricing?checkout=cancel`,
      metadata:
        parsed.data.kind === "subscription"
          ? { product_type: "subscription", plan_id: parsed.data.planId }
          : { product_type: "credit_pack", credits_added: "5" }
    });

    if (!session.url) {
      return NextResponse.json({ error: "Unable to start checkout session." }, { status: 500 });
    }
    return NextResponse.json({ url: session.url });
  } catch (error) {
    const detail = error instanceof Error ? error.message : "Unknown checkout error.";
    return NextResponse.json({ error: detail }, { status: 500 });
  }
}
