ALTER TABLE public.profiles
ADD COLUMN IF NOT EXISTS display_name TEXT;

ALTER TABLE public.photos
ADD COLUMN IF NOT EXISTS is_public BOOLEAN NOT NULL DEFAULT FALSE;

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
