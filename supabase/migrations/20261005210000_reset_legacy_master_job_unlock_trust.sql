-- P0 trust-boundary hardening:
-- Historical master_job_unlocks.email_verified_at values were backfilled from created_at
-- by an earlier migration, so they cannot prove billing identity.
UPDATE public.master_job_unlocks
SET email_verified_at = NULL
WHERE email_verified_at IS NOT NULL;

-- New code writes email_verified_at explicitly only after a trusted server-side proof.
-- Remove the legacy default so future inserts cannot become trusted implicitly.
ALTER TABLE public.master_job_unlocks
ALTER COLUMN email_verified_at DROP DEFAULT;

COMMENT ON COLUMN public.master_job_unlocks.email_verified_at IS
'Set explicitly only after current server-side trusted billing identity proof; legacy values were cleared during P0 hardening.';
