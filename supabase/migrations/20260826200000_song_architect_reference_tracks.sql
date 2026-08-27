-- Song Architect saved Reference Style Blueprints (private, owner-scoped).
-- Ownership key is the verified/trusted email already used by Song Architect.
-- Do not apply this migration to production automatically from local/dev workflows.

CREATE TABLE IF NOT EXISTS public.song_architect_reference_tracks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid (),
  owner_email text NOT NULL,
  spotify_track_id text NOT NULL,
  source_title text NOT NULL,
  source_artists text[] NOT NULL,
  source_album text,
  artwork_url text,
  spotify_url text,
  blueprint jsonb NOT NULL,
  analysis_type text NOT NULL DEFAULT 'metadata_reference_interpretation'
    CHECK (analysis_type = 'metadata_reference_interpretation'),
  blueprint_version integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT song_architect_reference_tracks_owner_track_version_key
    UNIQUE (owner_email, spotify_track_id, blueprint_version)
);

CREATE INDEX IF NOT EXISTS idx_song_architect_reference_tracks_owner_updated_at
  ON public.song_architect_reference_tracks (owner_email, updated_at DESC);

ALTER TABLE public.song_architect_reference_tracks ENABLE ROW LEVEL SECURITY;
