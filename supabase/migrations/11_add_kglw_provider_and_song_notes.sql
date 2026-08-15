DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_enum
    WHERE enumlabel = 'kglw'
      AND enumtypid = 'public.show_provider'::regtype
  ) THEN
    ALTER TYPE public.show_provider ADD VALUE 'kglw';
  END IF;
END
$$;

ALTER TABLE public.songs
  ADD COLUMN IF NOT EXISTS notes TEXT;
