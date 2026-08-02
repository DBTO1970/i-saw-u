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
