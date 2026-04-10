import { getSupabaseAdmin } from "@/lib/supabase/admin";
import type { PlanId } from "@/lib/subscriptions/types";
import { ADAPTIVE_ENTITLEMENT } from "./constants";
import { normalizeBillingEmail } from "./email";

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

export type BillingSubscriptionUpsert = BillingSubscription & {
  billingCustomerId: string | null;
  stripePriceId: string | null;
  canceledAt: string | null;
  trialStart: string | null;
  trialEnd: string | null;
  raw: Record<string, unknown>;
};

export async function getBillingSubscriptionByEmail(normalizedEmail: string): Promise<BillingSubscription | null> {
  const supabase = getSupabaseAdmin();
  const nowMs = Date.now();
  const nowIso = new Date().toISOString();
  const { data: rows, error } = await supabase
    .from("billing_subscriptions")
    .select(
      "normalized_email, stripe_customer_id, stripe_subscription_id, plan_id, status, current_period_start, current_period_end, cancel_at_period_end"
    )
    .eq("normalized_email", normalizedEmail)
    .in("status", ["active", "trialing"])
    .order("current_period_end", { ascending: false, nullsFirst: true })
    .limit(8);
  if (error) throw new Error(`Supabase billing_subscriptions read failed: ${error.message}`);
  const row = (rows ?? []).find((r) => {
    if (r.current_period_end == null) return true;
    const endMs = new Date(String(r.current_period_end)).getTime();
    return Number.isFinite(endMs) && endMs >= nowMs;
  });
  if (!row) return null;
  const planId = (row.plan_id ?? "creator_monthly") as PlanId;
  return {
    normalizedEmail: row.normalized_email,
    stripeCustomerId: row.stripe_customer_id,
    stripeSubscriptionId: row.stripe_subscription_id,
    planId,
    status: row.status,
    currentPeriodStart: row.current_period_start ?? nowIso,
    currentPeriodEnd: row.current_period_end ?? nowIso,
    cancelAtPeriodEnd: Boolean(row.cancel_at_period_end)
  };
}

export async function upsertBillingCustomer(row: {
  email: string;
  normalizedEmail: string;
  stripeCustomerId: string;
}): Promise<string> {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("billing_customers")
    .upsert(
      {
        email: row.email,
        normalized_email: row.normalizedEmail,
        stripe_customer_id: row.stripeCustomerId
      },
      { onConflict: "normalized_email" }
    )
    .select("id")
    .single();
  if (error) throw new Error(`Supabase billing_customers upsert failed: ${error.message}`);
  if (!data?.id) throw new Error("Supabase billing_customers upsert returned no id.");
  return data.id as string;
}

export async function upsertBillingSubscription(row: BillingSubscriptionUpsert): Promise<void> {
  const supabase = getSupabaseAdmin();
  const { error } = await supabase.from("billing_subscriptions").upsert(
    {
      normalized_email: row.normalizedEmail,
      stripe_customer_id: row.stripeCustomerId,
      stripe_subscription_id: row.stripeSubscriptionId,
      billing_customer_id: row.billingCustomerId,
      plan_id: row.planId,
      status: row.status,
      current_period_start: row.currentPeriodStart,
      current_period_end: row.currentPeriodEnd,
      cancel_at_period_end: row.cancelAtPeriodEnd,
      stripe_price_id: row.stripePriceId,
      canceled_at: row.canceledAt,
      trial_start: row.trialStart,
      trial_end: row.trialEnd,
      raw: row.raw
    },
    { onConflict: "stripe_subscription_id" }
  );
  if (error) throw new Error(`Supabase billing_subscriptions upsert failed: ${error.message}`);
}

export async function markBillingSubscriptionCanceled(stripeSubscriptionId: string): Promise<void> {
  const supabase = getSupabaseAdmin();
  const { data: existing, error: readErr } = await supabase
    .from("billing_subscriptions")
    .select("normalized_email, billing_customer_id")
    .eq("stripe_subscription_id", stripeSubscriptionId)
    .maybeSingle();
  if (readErr) throw new Error(`Supabase billing_subscriptions read failed: ${readErr.message}`);

  const { error } = await supabase
    .from("billing_subscriptions")
    .update({
      status: "canceled",
      canceled_at: new Date().toISOString()
    })
    .eq("stripe_subscription_id", stripeSubscriptionId);
  if (error) throw new Error(`Supabase billing_subscriptions cancel update failed: ${error.message}`);

  if (existing?.normalized_email) {
    const customerId = existing.billing_customer_id as string | null;
    await upsertAdaptiveEntitlement({
      normalizedEmail: existing.normalized_email,
      billingCustomerId: customerId,
      isActive: false,
      sourceRef: stripeSubscriptionId,
      expiresAt: null,
      metadata: { reason: "subscription_deleted" }
    });
  }
}

export async function getCreditPackBalance(normalizedEmail: string): Promise<number> {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase.from("credit_pack_ledger").select("delta").eq("normalized_email", normalizedEmail);
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
  const { data, error } = await supabase.from("billing_events").select("id").eq("stripe_event_id", eventId).maybeSingle();
  if (error) throw new Error(`Supabase billing_events read failed: ${error.message}`);
  return Boolean(data);
}

export async function persistStripeBillingEvent(eventId: string, eventType: string, payload: Record<string, unknown>): Promise<void> {
  const supabase = getSupabaseAdmin();
  const { error } = await supabase.from("billing_events").insert({
    stripe_event_id: eventId,
    stripe_event_type: eventType,
    livemode: Boolean(payload.livemode),
    payload
  });
  if (error) {
    if (error.code === "23505") return;
    throw new Error(`Supabase billing_events insert failed: ${error.message}`);
  }
}

export async function upsertAdaptiveEntitlement(row: {
  normalizedEmail: string;
  billingCustomerId: string | null;
  isActive: boolean;
  sourceRef: string | null;
  expiresAt: string | null;
  metadata?: Record<string, unknown>;
}): Promise<void> {
  const supabase = getSupabaseAdmin();
  const { error } = await supabase.from("billing_entitlements").upsert(
    {
      normalized_email: row.normalizedEmail,
      billing_customer_id: row.billingCustomerId,
      entitlement: ADAPTIVE_ENTITLEMENT,
      is_active: row.isActive,
      source: "stripe_subscription",
      source_ref: row.sourceRef,
      expires_at: row.expiresAt,
      metadata: row.metadata ?? {}
    },
    { onConflict: "normalized_email" }
  );
  if (error) throw new Error(`Supabase billing_entitlements upsert failed: ${error.message}`);
}

export async function getAdaptiveEntitlementByEmail(normalizedEmail: string): Promise<{
  isActive: boolean;
  sourceRef: string | null;
  expiresAt: string | null;
  metadata: Record<string, unknown>;
} | null> {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("billing_entitlements")
    .select("is_active, source_ref, expires_at, metadata, entitlement")
    .eq("normalized_email", normalizedEmail)
    .eq("entitlement", ADAPTIVE_ENTITLEMENT)
    .maybeSingle();
  if (error) throw new Error(`Supabase billing_entitlements read failed: ${error.message}`);
  if (!data) return null;
  return {
    isActive: Boolean(data.is_active),
    sourceRef: typeof data.source_ref === "string" ? data.source_ref : null,
    expiresAt: typeof data.expires_at === "string" ? data.expires_at : null,
    metadata: (data.metadata as Record<string, unknown>) ?? {}
  };
}

/** True if `billing_entitlements.adaptive_access` is active (same rule as export gate / checkout short-circuit). */
export async function userHasAdaptiveAccessByEmail(email: string): Promise<boolean> {
  const normalized = normalizeBillingEmail(email);
  if (!normalized) return false;
  const ent = await getAdaptiveEntitlementByEmail(normalized);
  return Boolean(ent?.isActive);
}
