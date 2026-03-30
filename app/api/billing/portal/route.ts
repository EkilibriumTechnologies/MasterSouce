import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getStripeClient } from "@/lib/stripe/server";
import { getBillingSubscriptionByEmail } from "@/lib/subscriptions/billing-store";

const BodySchema = z.object({
  email: z.string()
});

const BILLING_EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

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
      return NextResponse.json(
        { error: "invalid_billing_email", message: "Enter a valid email address." },
        { status: 400 }
      );
    }

    const normalizedEmail = parsed.data.email.trim().toLowerCase();
    if (!BILLING_EMAIL_REGEX.test(normalizedEmail)) {
      return NextResponse.json(
        { error: "invalid_billing_email", message: "Enter a valid email address." },
        { status: 400 }
      );
    }

    const activeSubscription = await getBillingSubscriptionByEmail(normalizedEmail);
    if (!activeSubscription) {
      return NextResponse.json(
        {
          error: "subscription_not_found",
          message: "We couldn\u2019t find an active subscription for that email."
        },
        { status: 404 }
      );
    }

    const stripe = getStripeClient();
    const baseUrl = resolveBaseUrl(request);
    const portalSession = await stripe.billingPortal.sessions.create({
      customer: activeSubscription.stripeCustomerId,
      return_url: `${baseUrl}/pricing`
    });

    if (!portalSession.url) {
      return NextResponse.json({ error: "Unable to create billing portal session." }, { status: 500 });
    }

    return NextResponse.json({ url: portalSession.url });
  } catch (error) {
    const detail = error instanceof Error ? error.message : "Unknown billing portal error.";
    return NextResponse.json({ error: detail }, { status: 500 });
  }
}
