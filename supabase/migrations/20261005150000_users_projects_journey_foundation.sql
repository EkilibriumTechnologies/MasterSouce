-- MasterSauce Accounts + Song Projects foundation.
-- Durable user/project ownership required before Journey Engine handoffs.
-- Server routes use service_role; RLS stays enabled with no browser policies in this milestone.

CREATE TABLE IF NOT EXISTS public.users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  auth_user_id uuid UNIQUE,
  normalized_email text NOT NULL UNIQUE,
  email text NOT NULL,
  stripe_customer_id text UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_users_auth_user_id
  ON public.users (auth_user_id)
  WHERE auth_user_id IS NOT NULL;

-- Paid customers are the safest historical identity anchor. Free users are created
-- only after a verified Supabase Auth magic-link login.
INSERT INTO public.users (normalized_email, email, stripe_customer_id)
SELECT
  lower(trim(normalized_email)),
  lower(trim(normalized_email)),
  stripe_customer_id
FROM public.billing_customers
WHERE normalized_email IS NOT NULL
  AND trim(normalized_email) <> ''
ON CONFLICT (normalized_email) DO UPDATE
SET stripe_customer_id = COALESCE(public.users.stripe_customer_id, EXCLUDED.stripe_customer_id),
    updated_at = now();

ALTER TABLE public.billing_customers
  ADD COLUMN IF NOT EXISTS user_id uuid REFERENCES public.users(id) ON DELETE SET NULL;
ALTER TABLE public.billing_subscriptions
  ADD COLUMN IF NOT EXISTS user_id uuid REFERENCES public.users(id) ON DELETE SET NULL;
ALTER TABLE public.credit_pack_ledger
  ADD COLUMN IF NOT EXISTS user_id uuid REFERENCES public.users(id) ON DELETE SET NULL;
ALTER TABLE public.song_architect_generation_events
  ADD COLUMN IF NOT EXISTS user_id uuid REFERENCES public.users(id) ON DELETE SET NULL;
ALTER TABLE public.hit_analyzer_report_events
  ADD COLUMN IF NOT EXISTS user_id uuid REFERENCES public.users(id) ON DELETE SET NULL;
ALTER TABLE public.song_architect_reference_tracks
  ADD COLUMN IF NOT EXISTS user_id uuid REFERENCES public.users(id) ON DELETE SET NULL;
ALTER TABLE public.master_job_unlocks
  ADD COLUMN IF NOT EXISTS user_id uuid REFERENCES public.users(id) ON DELETE SET NULL;
ALTER TABLE public.mastered_download_events
  ADD COLUMN IF NOT EXISTS user_id uuid REFERENCES public.users(id) ON DELETE SET NULL;

UPDATE public.billing_customers bc
SET user_id = u.id
FROM public.users u
WHERE bc.user_id IS NULL
  AND u.normalized_email = lower(trim(bc.normalized_email));

UPDATE public.billing_subscriptions bs
SET user_id = u.id
FROM public.users u
WHERE bs.user_id IS NULL
  AND u.normalized_email = lower(trim(bs.normalized_email));

UPDATE public.credit_pack_ledger cpl
SET user_id = u.id
FROM public.users u
WHERE cpl.user_id IS NULL
  AND u.normalized_email = lower(trim(cpl.normalized_email));

UPDATE public.song_architect_generation_events sage
SET user_id = u.id
FROM public.users u
WHERE sage.user_id IS NULL
  AND u.normalized_email = lower(trim(sage.email));

UPDATE public.hit_analyzer_report_events hare
SET user_id = u.id
FROM public.users u
WHERE hare.user_id IS NULL
  AND hare.email IS NOT NULL
  AND u.normalized_email = lower(trim(hare.email));

UPDATE public.song_architect_reference_tracks sart
SET user_id = u.id
FROM public.users u
WHERE sart.user_id IS NULL
  AND u.normalized_email = lower(trim(sart.owner_email));

UPDATE public.master_job_unlocks mju
SET user_id = u.id
FROM public.users u
WHERE mju.user_id IS NULL
  AND u.normalized_email = lower(trim(mju.normalized_email));

UPDATE public.mastered_download_events mde
SET user_id = u.id
FROM public.users u
WHERE mde.user_id IS NULL
  AND u.normalized_email = lower(trim(mde.normalized_email));

CREATE INDEX IF NOT EXISTS idx_billing_customers_user_id ON public.billing_customers (user_id);
CREATE INDEX IF NOT EXISTS idx_billing_subscriptions_user_id ON public.billing_subscriptions (user_id);
CREATE INDEX IF NOT EXISTS idx_credit_pack_ledger_user_id ON public.credit_pack_ledger (user_id);
CREATE INDEX IF NOT EXISTS idx_song_architect_generation_events_user_id ON public.song_architect_generation_events (user_id);
CREATE INDEX IF NOT EXISTS idx_hit_analyzer_report_events_user_id ON public.hit_analyzer_report_events (user_id);
CREATE INDEX IF NOT EXISTS idx_song_architect_reference_tracks_user_id ON public.song_architect_reference_tracks (user_id);
CREATE INDEX IF NOT EXISTS idx_master_job_unlocks_user_id ON public.master_job_unlocks (user_id);
CREATE INDEX IF NOT EXISTS idx_mastered_download_events_user_id ON public.mastered_download_events (user_id);

CREATE TABLE IF NOT EXISTS public.projects (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  title text NOT NULL DEFAULT 'Untitled Song',
  status text NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'archived', 'complete')),
  current_stage text NOT NULL DEFAULT 'idea'
    CHECK (current_stage IN (
      'idea',
      'song_dna',
      'lyrics',
      'suno_prompt',
      'generation',
      'analyze_refine',
      'selected_generation',
      'master',
      'export',
      'complete'
    )),
  selected_generation_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_projects_user_updated
  ON public.projects (user_id, updated_at DESC);

CREATE TABLE IF NOT EXISTS public.project_artifacts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  kind text NOT NULL
    CHECK (kind IN (
      'idea',
      'song_dna',
      'lyrics',
      'arrangement',
      'suno_prompt',
      'generation_match',
      'hit_analysis',
      'master_readiness',
      'master_settings',
      'export'
    )),
  version integer NOT NULL CHECK (version > 0),
  payload jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT project_artifacts_project_kind_version_key
    UNIQUE (project_id, kind, version)
);

CREATE INDEX IF NOT EXISTS idx_project_artifacts_project_kind_created
  ON public.project_artifacts (project_id, kind, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_project_artifacts_user_created
  ON public.project_artifacts (user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS public.project_generations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  source text NOT NULL DEFAULT 'suno',
  external_id text,
  external_url text,
  label text,
  selected boolean NOT NULL DEFAULT false,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_project_generations_project_created
  ON public.project_generations (project_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_project_generations_selected
  ON public.project_generations (project_id, selected)
  WHERE selected = true;

ALTER TABLE public.projects
  ADD CONSTRAINT projects_selected_generation_fk
  FOREIGN KEY (selected_generation_id)
  REFERENCES public.project_generations(id)
  ON DELETE SET NULL;

ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.project_artifacts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.project_generations ENABLE ROW LEVEL SECURITY;

-- These tables are intentionally server-only in this milestone. Supabase is moving
-- new public-schema tables to explicit Data API grants, so grant only service_role.
REVOKE ALL ON TABLE public.users FROM anon, authenticated;
REVOKE ALL ON TABLE public.projects FROM anon, authenticated;
REVOKE ALL ON TABLE public.project_artifacts FROM anon, authenticated;
REVOKE ALL ON TABLE public.project_generations FROM anon, authenticated;

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.users TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.projects TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.project_artifacts TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.project_generations TO service_role;

COMMENT ON TABLE public.users IS
  'Stable MasterSauce account identity. auth_user_id is linked only after verified Supabase Auth.';
COMMENT ON TABLE public.projects IS
  'Durable Song Project container for the end-to-end MasterSauce Journey.';
COMMENT ON TABLE public.project_artifacts IS
  'Versioned Journey artifacts such as Song DNA, lyrics, Suno prompts, analyses, and mastering decisions.';
COMMENT ON TABLE public.project_generations IS
  'External/generated song candidates attached to a Project; audio durability is a later milestone.';
