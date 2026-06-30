-- Hit Analyzer monthly usage ledger (calendar-month quota checks + report event audit).

CREATE TABLE IF NOT EXISTS public.hit_analyzer_report_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid (),
  email text,
  plan_id text NOT NULL DEFAULT 'free',
  created_at timestamptz NOT NULL DEFAULT now(),
  status text NOT NULL,
  counted boolean NOT NULL DEFAULT false,
  error_code text
);

CREATE INDEX IF NOT EXISTS idx_hit_analyzer_report_events_email_created_at
  ON public.hit_analyzer_report_events (email, created_at DESC)
  WHERE email IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_hit_analyzer_report_events_counted_true
  ON public.hit_analyzer_report_events (email, created_at DESC)
  WHERE counted = true AND email IS NOT NULL;

ALTER TABLE public.hit_analyzer_report_events ENABLE ROW LEVEL SECURITY;
