-- Additive billing primitives for Stripe-backed subscriptions and one-time credit packs.

CREATE TABLE IF NOT EXISTS public.billing_customers (
  normalized_email text PRIMARY KEY,
  stripe_customer_id text NOT NULL UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.billing_subscriptions (
  stripe_subscription_id text PRIMARY KEY,
  stripe_customer_id text NOT NULL,
  normalized_email text NOT NULL,
  plan_id text NOT NULL CHECK (plan_id IN ('free', 'creator_monthly', 'pro_studio_monthly')),
  status text NOT NULL,
  current_period_start timestamptz NOT NULL,
  current_period_end timestamptz NOT NULL,
  cancel_at_period_end boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_billing_subscriptions_email
  ON public.billing_subscriptions (normalized_email, current_period_end DESC);

CREATE TABLE IF NOT EXISTS public.credit_pack_ledger (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  normalized_email text NOT NULL,
  delta integer NOT NULL,
  reason text NOT NULL CHECK (reason IN ('credit_pack_purchase', 'credit_pack_consume')),
  stripe_checkout_session_id text,
  stripe_payment_intent_id text,
  metadata jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_credit_pack_ledger_email_created
  ON public.credit_pack_ledger (normalized_email, created_at DESC);

CREATE UNIQUE INDEX IF NOT EXISTS idx_credit_pack_ledger_session_purchase_once
  ON public.credit_pack_ledger (stripe_checkout_session_id)
  WHERE reason = 'credit_pack_purchase' AND stripe_checkout_session_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.stripe_webhook_events (
  event_id text PRIMARY KEY,
  event_type text NOT NULL,
  processed_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.billing_customers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.billing_subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.credit_pack_ledger ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.stripe_webhook_events ENABLE ROW LEVEL SECURITY;
