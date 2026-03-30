import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getStripeClient, getStripeCreditPackPriceId, getStripePriceIdForPlan } from "@/lib/stripe/server";

const BodySchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("subscription"),
    planId: z.enum(["creator_monthly", "pro_studio_monthly"]),
    email: z.string().email().optional()
  }),
  z.object({
    kind: z.literal("credit_pack"),
    email: z.string().email().optional()
  })
]);

function resolveBaseUrl(request: NextRequest): string {
  const env = process.env.NEXT_PUBLIC_APP_URL?.trim();
  if (env) return env.replace(/\/+$/, "");
  const origin = request.nextUrl.origin?.trim();
  return origin ? origin.replace(/\/+$/, "") : "http://localhost:3000";
}

export async function POST(request: NextRequest) {
  try {
    const payload = await request.json();
    const parsed = BodySchema.safeParse(payload);
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid checkout payload." }, { status: 400 });
    }
    const baseUrl = resolveBaseUrl(request);
    const stripe = getStripeClient();
    const email = parsed.data.email?.trim().toLowerCase();

    const session = await stripe.checkout.sessions.create({
      mode: parsed.data.kind === "subscription" ? "subscription" : "payment",
      ...(email ? { customer_email: email } : {}),
      line_items: [
        {
          price:
            parsed.data.kind === "subscription"
              ? getStripePriceIdForPlan(parsed.data.planId)
              : getStripeCreditPackPriceId(),
          quantity: 1
        }
      ],
      success_url: `${baseUrl}/pricing?checkout=success`,
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
