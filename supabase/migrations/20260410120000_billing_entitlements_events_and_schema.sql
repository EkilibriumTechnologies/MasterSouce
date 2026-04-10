-- Billing: entitlements, event audit log, and schema extensions for Stripe sync.
-- Backfills billing_customers with uuid PK + email; widens billing_subscriptions for webhook edge cases.
--
-- FKs to billing_customers(id) are dropped before PK migration so re-runs / partial runs do not hit 2BP01.

-- ---------------------------------------------------------------------------
-- 0) Drop FKs that reference billing_customers(id) (required before DROP pkey)
-- ---------------------------------------------------------------------------
ALTER TABLE public.billing_subscriptions
  DROP CONSTRAINT IF EXISTS billing_subscriptions_billing_customer_id_fkey;

DO $$
BEGIN
  IF to_regclass ('public.billing_entitlements') IS NOT NULL THEN
    ALTER TABLE public.billing_entitlements
      DROP CONSTRAINT IF EXISTS billing_entitlements_billing_customer_id_fkey;
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- billing_customers: add surrogate id + display email; migrate primary key
-- ---------------------------------------------------------------------------
ALTER TABLE public.billing_customers
  ADD COLUMN IF NOT EXISTS id uuid DEFAULT gen_random_uuid(),
  ADD COLUMN IF NOT EXISTS email text;

UPDATE public.billing_customers
SET email = normalized_email
WHERE email IS NULL;

ALTER TABLE public.billing_customers
  ALTER COLUMN email SET NOT NULL;

ALTER TABLE public.billing_customers DROP CONSTRAINT IF EXISTS billing_customers_pkey;

ALTER TABLE public.billing_customers ADD PRIMARY KEY (id);

CREATE UNIQUE INDEX IF NOT EXISTS idx_billing_customers_normalized_email
  ON public.billing_customers (normalized_email);

CREATE INDEX IF NOT EXISTS idx_billing_customers_stripe_customer_id
  ON public.billing_customers (stripe_customer_id);

-- ---------------------------------------------------------------------------
-- billing_subscriptions: relax plan constraint, nullable periods, extra cols
-- (billing_customer_id without inline REFERENCES — FK added below after PK is stable)
-- ---------------------------------------------------------------------------
ALTER TABLE public.billing_subscriptions
  DROP CONSTRAINT IF EXISTS billing_subscriptions_plan_id_check;

ALTER TABLE public.billing_subscriptions
  ADD COLUMN IF NOT EXISTS billing_customer_id uuid,
  ADD COLUMN IF NOT EXISTS stripe_price_id text,
  ADD COLUMN IF NOT EXISTS canceled_at timestamptz,
  ADD COLUMN IF NOT EXISTS trial_start timestamptz,
  ADD COLUMN IF NOT EXISTS trial_end timestamptz,
  ADD COLUMN IF NOT EXISTS raw jsonb NOT NULL DEFAULT '{}'::jsonb;

ALTER TABLE public.billing_subscriptions
  ALTER COLUMN current_period_start DROP NOT NULL,
  ALTER COLUMN current_period_end DROP NOT NULL,
  ALTER COLUMN plan_id DROP NOT NULL;

CREATE INDEX IF NOT EXISTS idx_billing_subscriptions_stripe_customer_id
  ON public.billing_subscriptions (stripe_customer_id);

CREATE INDEX IF NOT EXISTS idx_billing_subscriptions_status
  ON public.billing_subscriptions (status);

UPDATE public.billing_subscriptions bs
SET billing_customer_id = bc.id
FROM public.billing_customers bc
WHERE bs.normalized_email = bc.normalized_email
  AND bs.billing_customer_id IS NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'billing_subscriptions_billing_customer_id_fkey'
  ) THEN
    ALTER TABLE public.billing_subscriptions
      ADD CONSTRAINT billing_subscriptions_billing_customer_id_fkey
      FOREIGN KEY (billing_customer_id) REFERENCES public.billing_customers (id) ON DELETE SET NULL;
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- billing_entitlements: explicit feature flags (e.g. adaptive_access)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.billing_entitlements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid (),
  normalized_email text NOT NULL UNIQUE,
  billing_customer_id uuid,
  entitlement text NOT NULL,
  is_active boolean NOT NULL DEFAULT false,
  source text NOT NULL DEFAULT 'stripe_subscription',
  source_ref text,
  expires_at timestamptz,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now ()
);

CREATE INDEX IF NOT EXISTS idx_billing_entitlements_normalized_email
  ON public.billing_entitlements (normalized_email);

CREATE INDEX IF NOT EXISTS idx_billing_entitlements_is_active
  ON public.billing_entitlements (is_active)
  WHERE is_active = true;

ALTER TABLE public.billing_entitlements ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'billing_entitlements_billing_customer_id_fkey'
  ) THEN
    ALTER TABLE public.billing_entitlements
      ADD CONSTRAINT billing_entitlements_billing_customer_id_fkey
      FOREIGN KEY (billing_customer_id) REFERENCES public.billing_customers (id) ON DELETE CASCADE;
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- billing_events: raw Stripe webhook audit + idempotency
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.billing_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid (),
  stripe_event_id text NOT NULL UNIQUE,
  stripe_event_type text NOT NULL,
  livemode boolean NOT NULL DEFAULT false,
  payload jsonb NOT NULL,
  processed_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now ()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_billing_events_stripe_event_id
  ON public.billing_events (stripe_event_id);

ALTER TABLE public.billing_events ENABLE ROW LEVEL SECURITY;

-- Backfill billing_events from legacy stripe_webhook_events (idempotent)
INSERT INTO public.billing_events (stripe_event_id, stripe_event_type, livemode, payload, processed_at)
SELECT
  e.event_id,
  e.event_type,
  false,
  '{}'::jsonb,
  e.processed_at
FROM public.stripe_webhook_events e
ON CONFLICT (stripe_event_id) DO NOTHING;

-- Touch updated_at on row changes (project had no prior global trigger)
CREATE OR REPLACE FUNCTION public.billing_set_updated_at ()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_billing_customers_updated_at ON public.billing_customers;
CREATE TRIGGER trg_billing_customers_updated_at
BEFORE UPDATE ON public.billing_customers
FOR EACH ROW
EXECUTE PROCEDURE public.billing_set_updated_at ();

DROP TRIGGER IF EXISTS trg_billing_subscriptions_updated_at ON public.billing_subscriptions;
CREATE TRIGGER trg_billing_subscriptions_updated_at
BEFORE UPDATE ON public.billing_subscriptions
FOR EACH ROW
EXECUTE PROCEDURE public.billing_set_updated_at ();

DROP TRIGGER IF EXISTS trg_billing_entitlements_updated_at ON public.billing_entitlements;
CREATE TRIGGER trg_billing_entitlements_updated_at
BEFORE UPDATE ON public.billing_entitlements
FOR EACH ROW
EXECUTE PROCEDURE public.billing_set_updated_at ();
