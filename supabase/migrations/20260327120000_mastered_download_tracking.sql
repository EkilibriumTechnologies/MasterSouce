-- Mastered full-file download analytics: one "unique" count per (email, job, file) per rolling 30 days.
-- Full attempt history is stored; concurrent requests are serialized per dedupe key via pg_advisory_xact_lock.

CREATE TABLE public.master_job_unlocks (
  job_id text PRIMARY KEY,
  file_id text NOT NULL,
  normalized_email text NOT NULL,
  original_email text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_master_job_unlocks_normalized_email ON public.master_job_unlocks (normalized_email);

ALTER TABLE public.master_job_unlocks ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.mastered_download_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  normalized_email text NOT NULL,
  original_email text,
  job_id text NOT NULL,
  file_id text NOT NULL,
  lead_id uuid,
  counted_unique boolean NOT NULL DEFAULT false,
  downloaded_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  request_metadata jsonb,
  attempt_type text NOT NULL CHECK (attempt_type IN ('unique', 'repeat'))
);

CREATE INDEX idx_mastered_download_events_lookup
  ON public.mastered_download_events (normalized_email, job_id, file_id, downloaded_at DESC)
  WHERE counted_unique = true;

CREATE INDEX idx_mastered_download_events_job
  ON public.mastered_download_events (job_id, downloaded_at DESC);

ALTER TABLE public.mastered_download_events ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.record_mastered_download_attempt(
  p_normalized_email text,
  p_original_email text,
  p_job_id text,
  p_file_id text,
  p_lead_id uuid DEFAULT NULL,
  p_request_metadata jsonb DEFAULT NULL
)
RETURNS TABLE (counted_unique boolean, attempt_type text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_has_recent boolean;
BEGIN
  PERFORM pg_advisory_xact_lock(
    hashtext(lower(trim(p_normalized_email)) || chr(31) || p_job_id || chr(31) || p_file_id)
  );

  SELECT EXISTS (
    SELECT 1
    FROM public.mastered_download_events e
    WHERE e.normalized_email = lower(trim(p_normalized_email))
      AND e.job_id = p_job_id
      AND e.file_id = p_file_id
      AND e.counted_unique = true
      AND e.downloaded_at > (now() - interval '30 days')
  )
  INTO v_has_recent;

  IF v_has_recent THEN
    INSERT INTO public.mastered_download_events (
      normalized_email,
      original_email,
      job_id,
      file_id,
      lead_id,
      counted_unique,
      attempt_type,
      request_metadata
    ) VALUES (
      lower(trim(p_normalized_email)),
      NULLIF(trim(p_original_email), ''),
      p_job_id,
      p_file_id,
      p_lead_id,
      false,
      'repeat',
      p_request_metadata
    );
    RETURN QUERY SELECT false::boolean, 'repeat'::text;
  ELSE
    INSERT INTO public.mastered_download_events (
      normalized_email,
      original_email,
      job_id,
      file_id,
      lead_id,
      counted_unique,
      attempt_type,
      request_metadata
    ) VALUES (
      lower(trim(p_normalized_email)),
      NULLIF(trim(p_original_email), ''),
      p_job_id,
      p_file_id,
      p_lead_id,
      true,
      'unique',
      p_request_metadata
    );
    RETURN QUERY SELECT true::boolean, 'unique'::text;
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.record_mastered_download_attempt(text, text, text, text, uuid, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.record_mastered_download_attempt(text, text, text, text, uuid, jsonb) TO service_role;

COMMENT ON TABLE public.master_job_unlocks IS 'Authoritative unlock for mastered file download; ties job/file to normalized email for gating and analytics.';
COMMENT ON TABLE public.mastered_download_events IS 'Every mastered download attempt; counted_unique drives the primary unique metric (30-day rolling per email+job+file).';
COMMENT ON FUNCTION public.record_mastered_download_attempt IS 'Serialized per dedupe key; inserts history row and sets counted_unique only when none in prior 30 days.';
