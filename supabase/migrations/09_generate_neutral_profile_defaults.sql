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

DO $$
DECLARE
  profile_record RECORD;
  generated_username TEXT;
BEGIN
  FOR profile_record IN SELECT id FROM public.profiles LOOP
    generated_username := public.generate_random_profile_username();
    UPDATE public.profiles
    SET username = generated_username,
        display_name = INITCAP(REPLACE(generated_username, '-', ' ')),
        updated_at = NOW()
    WHERE id = profile_record.id;
  END LOOP;
END $$;
