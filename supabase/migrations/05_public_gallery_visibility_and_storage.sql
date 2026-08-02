ALTER TABLE public.profiles
ADD COLUMN IF NOT EXISTS display_name TEXT;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'photos'
      AND column_name = 'is_public'
  ) THEN
    ALTER TABLE public.photos
    ADD COLUMN is_public BOOLEAN;
  END IF;
END $$;

UPDATE public.photos
SET is_public = FALSE
WHERE is_public IS NULL;

ALTER TABLE public.photos
ALTER COLUMN is_public SET DEFAULT FALSE,
ALTER COLUMN is_public SET NOT NULL;

UPDATE public.profiles
SET display_name = COALESCE(display_name, username)
WHERE display_name IS NULL;

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, username, display_name, avatar_url)
  VALUES (
    NEW.id,
    CONCAT('fan_', SUBSTRING(REPLACE(NEW.id::text, '-', '') FROM 1 FOR 12)),
    CONCAT('Fan ', UPPER(SUBSTRING(REPLACE(NEW.id::text, '-', '') FROM 1 FOR 4))),
    NEW.raw_user_meta_data->>'avatar_url'
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP POLICY IF EXISTS "Public photos are viewable by anyone" ON public.photos;
CREATE POLICY "Public photos are viewable by anyone"
  ON public.photos FOR SELECT
  USING (auth.uid() = user_id OR is_public = true);

DROP POLICY IF EXISTS "Users can view public uploaded photos" ON storage.objects;
CREATE POLICY "Users can view public uploaded photos"
  ON storage.objects FOR SELECT
  USING (
    bucket_id = 'user-photos'
    AND EXISTS (
      SELECT 1
      FROM public.photos p
      WHERE p.storage_path = storage.objects.name
        AND p.is_public = true
    )
  );
