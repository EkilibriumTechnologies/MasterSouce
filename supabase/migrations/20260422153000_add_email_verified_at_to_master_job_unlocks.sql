ALTER TABLE public.master_job_unlocks
ADD COLUMN IF NOT EXISTS email_verified_at timestamptz;

UPDATE public.master_job_unlocks
SET email_verified_at = COALESCE(email_verified_at, created_at);

ALTER TABLE public.master_job_unlocks
ALTER COLUMN email_verified_at SET DEFAULT now();

COMMENT ON COLUMN public.master_job_unlocks.email_verified_at IS
'Timestamp when unlock email access was confirmed by server-side anti-abuse checks (not inbox ownership proof).';
