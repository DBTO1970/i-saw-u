ALTER TABLE public.profiles
ADD COLUMN IF NOT EXISTS display_name TEXT;

ALTER TABLE public.photos
ADD COLUMN IF NOT EXISTS is_public BOOLEAN NOT NULL DEFAULT FALSE;

UPDATE public.profiles
SET display_name = COALESCE(display_name, username)
WHERE display_name IS NULL;

CREATE OR REPLACE FUNCTION public.generate_random_profile_username()
RETURNS TEXT AS $$
DECLARE
  adjective_options TEXT[] := ARRAY['cosmic','luminous','golden','velvet','electric','silver','neon','groovy','sonic','midnight','radiant','stellar','dreamy','sunset','aurora'];
  noun_options TEXT[] := ARRAY['otter','panther','falcon','echo','groove','comet','voyager','rhythm','wave','ember','prism','pulse','sparrow','fox','drifter'];
  candidate TEXT;
BEGIN
  LOOP
    candidate := lower(
      adjective_options[1 + floor(random() * array_length(adjective_options, 1))::INT]
      || '-' ||
      noun_options[1 + floor(random() * array_length(noun_options, 1))::INT]
      || lpad((floor(random() * 1000)::INT)::TEXT, 3, '0')
    );
    EXIT WHEN NOT EXISTS (
      SELECT 1
      FROM public.profiles p
      WHERE p.username = candidate
    );
  END LOOP;
  RETURN candidate;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
DECLARE
  generated_username TEXT;
BEGIN
  LOOP
    generated_username := public.generate_random_profile_username();
    BEGIN
      INSERT INTO public.profiles (id, username, display_name, avatar_url)
      VALUES (
        NEW.id,
        generated_username,
        INITCAP(REPLACE(generated_username, '-', ' ')),
        NEW.raw_user_meta_data->>'avatar_url'
      )
      ON CONFLICT (id) DO NOTHING;
      EXIT;
    EXCEPTION
      WHEN unique_violation THEN
        -- Retry if a concurrent signup picked the same username.
    END;
  END LOOP;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP POLICY IF EXISTS "Public photos are viewable by anyone" ON public.photos;
CREATE POLICY "Public photos are viewable by anyone"
  ON public.photos FOR SELECT
  USING (auth.uid() = user_id OR is_public = true);
