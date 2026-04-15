-- Align Song Architect generation event schema with usage recording payload.
-- Ensures plan_id stays NOT NULL and optional metadata columns are available.

ALTER TABLE public.song_architect_generation_events
  ADD COLUMN IF NOT EXISTS plan_id text;

UPDATE public.song_architect_generation_events
SET plan_id = 'free'
WHERE plan_id IS NULL;

ALTER TABLE public.song_architect_generation_events
  ALTER COLUMN plan_id SET DEFAULT 'free',
  ALTER COLUMN plan_id SET NOT NULL;

ALTER TABLE public.song_architect_generation_events
  ADD COLUMN IF NOT EXISTS preset_used text,
  ADD COLUMN IF NOT EXISTS genre text,
  ADD COLUMN IF NOT EXISTS theme text;

CREATE INDEX IF NOT EXISTS idx_song_architect_generation_events_plan_id
  ON public.song_architect_generation_events (plan_id);
