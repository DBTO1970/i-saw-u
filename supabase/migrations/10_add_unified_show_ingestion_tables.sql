DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'show_provider') THEN
    CREATE TYPE public.show_provider AS ENUM ('phishnet', 'elgoose', 'relisten', 'bmfsdb', 'setlistfm');
  END IF;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'set_type') THEN
    CREATE TYPE public.set_type AS ENUM ('set_1', 'set_2', 'encore', 'other');
  END IF;
END
$$;

CREATE TABLE IF NOT EXISTS public.shows (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  artist_name TEXT NOT NULL,
  provider public.show_provider NOT NULL,
  external_show_id TEXT NOT NULL,
  show_date DATE NOT NULL,
  venue_name TEXT,
  city TEXT,
  state TEXT,
  country TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.shows
  ADD COLUMN IF NOT EXISTS artist_name TEXT,
  ADD COLUMN IF NOT EXISTS provider public.show_provider,
  ADD COLUMN IF NOT EXISTS external_show_id TEXT,
  ADD COLUMN IF NOT EXISTS show_date DATE,
  ADD COLUMN IF NOT EXISTS venue_name TEXT,
  ADD COLUMN IF NOT EXISTS city TEXT,
  ADD COLUMN IF NOT EXISTS state TEXT,
  ADD COLUMN IF NOT EXISTS country TEXT,
  ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW(),
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

CREATE UNIQUE INDEX IF NOT EXISTS idx_shows_provider_external_id
  ON public.shows(provider, external_show_id);
CREATE INDEX IF NOT EXISTS idx_shows_artist_name
  ON public.shows(artist_name);
CREATE INDEX IF NOT EXISTS idx_shows_show_date
  ON public.shows(show_date);

ALTER TABLE public.shows
  ALTER COLUMN artist_name SET NOT NULL,
  ALTER COLUMN provider SET NOT NULL,
  ALTER COLUMN external_show_id SET NOT NULL,
  ALTER COLUMN show_date SET NOT NULL;

CREATE TABLE IF NOT EXISTS public.setlists (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  show_id UUID NOT NULL REFERENCES public.shows(id) ON DELETE CASCADE,
  set_name TEXT NOT NULL,
  set_type public.set_type NOT NULL DEFAULT 'other',
  position INTEGER NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (show_id, position)
);

ALTER TABLE public.setlists
  ADD COLUMN IF NOT EXISTS show_id UUID REFERENCES public.shows(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS set_name TEXT,
  ADD COLUMN IF NOT EXISTS set_type public.set_type DEFAULT 'other',
  ADD COLUMN IF NOT EXISTS position INTEGER DEFAULT 1,
  ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW();

CREATE INDEX IF NOT EXISTS idx_setlists_show_id
  ON public.setlists(show_id);

ALTER TABLE public.setlists
  ALTER COLUMN show_id SET NOT NULL,
  ALTER COLUMN set_name SET NOT NULL,
  ALTER COLUMN set_type SET NOT NULL,
  ALTER COLUMN position SET NOT NULL;

CREATE TABLE IF NOT EXISTS public.songs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  setlist_id UUID NOT NULL REFERENCES public.setlists(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  position INTEGER NOT NULL DEFAULT 1,
  duration_seconds INTEGER,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (setlist_id, position)
);

ALTER TABLE public.songs
  ADD COLUMN IF NOT EXISTS setlist_id UUID REFERENCES public.setlists(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS title TEXT,
  ADD COLUMN IF NOT EXISTS position INTEGER DEFAULT 1,
  ADD COLUMN IF NOT EXISTS duration_seconds INTEGER,
  ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW();

CREATE INDEX IF NOT EXISTS idx_songs_setlist_id
  ON public.songs(setlist_id);

ALTER TABLE public.songs
  ALTER COLUMN setlist_id SET NOT NULL,
  ALTER COLUMN title SET NOT NULL,
  ALTER COLUMN position SET NOT NULL;

ALTER TABLE public.shows ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.setlists ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.songs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Shows readable by authenticated users" ON public.shows;
CREATE POLICY "Shows readable by authenticated users"
  ON public.shows
  FOR SELECT
  USING (auth.role() = 'authenticated');

DROP POLICY IF EXISTS "Setlists readable by authenticated users" ON public.setlists;
CREATE POLICY "Setlists readable by authenticated users"
  ON public.setlists
  FOR SELECT
  USING (auth.role() = 'authenticated');

DROP POLICY IF EXISTS "Songs readable by authenticated users" ON public.songs;
CREATE POLICY "Songs readable by authenticated users"
  ON public.songs
  FOR SELECT
  USING (auth.role() = 'authenticated');
