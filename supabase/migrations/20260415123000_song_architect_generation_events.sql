-- Song Architect usage ledger (calendar-month quota checks + generation event audit).
-- Keeps the schema aligned with app expectations:
--   email, created_at, status, counted

CREATE TABLE IF NOT EXISTS public.song_architect_generation_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid (),
  email text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  status text NOT NULL,
  counted boolean NOT NULL DEFAULT false
);

CREATE INDEX IF NOT EXISTS idx_song_architect_generation_events_email_created_at
  ON public.song_architect_generation_events (email, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_song_architect_generation_events_counted_true
  ON public.song_architect_generation_events (email, created_at DESC)
  WHERE counted = true;

ALTER TABLE public.song_architect_generation_events ENABLE ROW LEVEL SECURITY;
