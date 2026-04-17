-- Public aggregate counters for homepage social proof (real events only; increments via RPC from server).

CREATE TABLE public.product_metrics (
  id text PRIMARY KEY,
  count integer NOT NULL DEFAULT 0 CHECK (count >= 0),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.product_metrics ENABLE ROW LEVEL SECURITY;

INSERT INTO public.product_metrics (id, count) VALUES
  ('downloads', 1001),
  ('previews', 1568),
  ('prompts', 487)
ON CONFLICT (id) DO NOTHING;

CREATE OR REPLACE FUNCTION public.increment_product_metric(p_id text)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count integer;
BEGIN
  UPDATE public.product_metrics
  SET count = public.product_metrics.count + 1,
      updated_at = now()
  WHERE id = p_id
  RETURNING count INTO v_count;

  IF v_count IS NULL THEN
    INSERT INTO public.product_metrics (id, count)
    VALUES (p_id, 1)
    ON CONFLICT (id) DO UPDATE
      SET count = public.product_metrics.count + 1,
          updated_at = now()
    RETURNING count INTO v_count;
  END IF;

  RETURN v_count;
END;
$$;

REVOKE ALL ON FUNCTION public.increment_product_metric(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.increment_product_metric(text) TO service_role;

COMMENT ON TABLE public.product_metrics IS 'Marketing counters; updated only from application server (service role) on real product events.';
COMMENT ON FUNCTION public.increment_product_metric(text) IS 'Atomically increments one counter row by id; safe for concurrent calls.';
