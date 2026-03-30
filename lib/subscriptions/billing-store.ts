import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { PlanId } from "@/lib/subscriptions/types";

export type BillingSubscription = {
  normalizedEmail: string;
  stripeCustomerId: string;
  stripeSubscriptionId: string;
  planId: PlanId;
  status: string;
  currentPeriodStart: string;
  currentPeriodEnd: string;
  cancelAtPeriodEnd: boolean;
};

export async function getBillingSubscriptionByEmail(normalizedEmail: string): Promise<BillingSubscription | null> {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("billing_subscriptions")
    .select(
      "normalized_email, stripe_customer_id, stripe_subscription_id, plan_id, status, current_period_start, current_period_end, cancel_at_period_end"
    )
    .eq("normalized_email", normalizedEmail)
    .in("status", ["active", "trialing"])
    .gte("current_period_end", new Date().toISOString())
    .order("current_period_end", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(`Supabase billing_subscriptions read failed: ${error.message}`);
  if (!data) return null;
  return {
    normalizedEmail: data.normalized_email,
    stripeCustomerId: data.stripe_customer_id,
    stripeSubscriptionId: data.stripe_subscription_id,
    planId: data.plan_id as PlanId,
    status: data.status,
    currentPeriodStart: data.current_period_start,
    currentPeriodEnd: data.current_period_end,
    cancelAtPeriodEnd: Boolean(data.cancel_at_period_end)
  };
}

export async function upsertBillingCustomer(row: { normalizedEmail: string; stripeCustomerId: string }): Promise<void> {
  const supabase = getSupabaseAdmin();
  const { error } = await supabase.from("billing_customers").upsert(
    {
      normalized_email: row.normalizedEmail,
      stripe_customer_id: row.stripeCustomerId
    },
    { onConflict: "normalized_email" }
  );
  if (error) throw new Error(`Supabase billing_customers upsert failed: ${error.message}`);
}

export async function upsertBillingSubscription(row: BillingSubscription): Promise<void> {
  const supabase = getSupabaseAdmin();
  const { error } = await supabase.from("billing_subscriptions").upsert(
    {
      normalized_email: row.normalizedEmail,
      stripe_customer_id: row.stripeCustomerId,
      stripe_subscription_id: row.stripeSubscriptionId,
      plan_id: row.planId,
      status: row.status,
      current_period_start: row.currentPeriodStart,
      current_period_end: row.currentPeriodEnd,
      cancel_at_period_end: row.cancelAtPeriodEnd
    },
    { onConflict: "stripe_subscription_id" }
  );
  if (error) throw new Error(`Supabase billing_subscriptions upsert failed: ${error.message}`);
}

export async function markBillingSubscriptionCanceled(stripeSubscriptionId: string): Promise<void> {
  const supabase = getSupabaseAdmin();
  const { error } = await supabase
    .from("billing_subscriptions")
    .update({ status: "canceled" })
    .eq("stripe_subscription_id", stripeSubscriptionId);
  if (error) throw new Error(`Supabase billing_subscriptions cancel update failed: ${error.message}`);
}

export async function getCreditPackBalance(normalizedEmail: string): Promise<number> {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("credit_pack_ledger")
    .select("delta")
    .eq("normalized_email", normalizedEmail);
  if (error) throw new Error(`Supabase credit_pack_ledger read failed: ${error.message}`);
  const total = (data ?? []).reduce((acc, row) => acc + (Number(row.delta) || 0), 0);
  return Math.max(total, 0);
}

export async function appendCreditPackLedgerEntry(row: {
  normalizedEmail: string;
  delta: number;
  reason: "credit_pack_purchase" | "credit_pack_consume";
  stripeCheckoutSessionId?: string | null;
  stripePaymentIntentId?: string | null;
  metadata?: Record<string, unknown> | null;
}): Promise<void> {
  const supabase = getSupabaseAdmin();
  const { error } = await supabase.from("credit_pack_ledger").insert({
    normalized_email: row.normalizedEmail,
    delta: row.delta,
    reason: row.reason,
    stripe_checkout_session_id: row.stripeCheckoutSessionId ?? null,
    stripe_payment_intent_id: row.stripePaymentIntentId ?? null,
    metadata: row.metadata ?? null
  });
  if (error) throw new Error(`Supabase credit_pack_ledger insert failed: ${error.message}`);
}

export async function hasProcessedStripeEvent(eventId: string): Promise<boolean> {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("stripe_webhook_events")
    .select("event_id")
    .eq("event_id", eventId)
    .maybeSingle();
  if (error) throw new Error(`Supabase stripe_webhook_events read failed: ${error.message}`);
  return Boolean(data);
}

export async function recordProcessedStripeEvent(eventId: string, eventType: string): Promise<void> {
  const supabase = getSupabaseAdmin();
  const { error } = await supabase.from("stripe_webhook_events").insert({
    event_id: eventId,
    event_type: eventType
  });
  if (error) throw new Error(`Supabase stripe_webhook_events insert failed: ${error.message}`);
}
