-- ==========================================
-- i-saw-u Database Schema & RLS Setup
-- ==========================================

-- 1. Profiles Table (extends auth.users)
CREATE TABLE IF NOT EXISTS public.profiles (
  id UUID REFERENCES auth.users(id) ON DELETE CASCADE PRIMARY KEY,
  username TEXT UNIQUE,
  avatar_url TEXT,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Profiles are viewable by authenticated users" 
  ON public.profiles FOR SELECT USING (auth.role() = 'authenticated');

CREATE POLICY "Users can update their own profile" 
  ON public.profiles FOR UPDATE USING (auth.uid() = id);

-- Trigger to automatically create profile on signup/OAuth login
CREATE OR REPLACE FUNCTION public.handle_new_user() 
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, username, avatar_url)
  VALUES (
    new.id, 
    COALESCE(new.raw_user_meta_data->>'full_name', new.raw_user_meta_data->>'name', new.raw_user_meta_data->>'user_name', new.email),
    new.raw_user_meta_data->>'avatar_url'
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- 2. User Photos Table
CREATE TABLE IF NOT EXISTS public.photos (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  storage_path TEXT NOT NULL,
  file_name TEXT NOT NULL,
  file_size BIGINT NOT NULL,
  mime_type TEXT DEFAULT 'image/webp',
  date_taken DATE,
  time_taken TIME,
  gps_latitude DOUBLE PRECISION,
  gps_longitude DOUBLE PRECISION,
  raw_exif JSONB DEFAULT '{}'::jsonb,
  photo_hash TEXT,
  matched_show_date VARCHAR(10),
  show_start_time TIME,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.photos ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage their own photos"
  ON public.photos FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS idx_photos_user_id ON public.photos(user_id);
CREATE INDEX IF NOT EXISTS idx_photos_date_taken ON public.photos(date_taken);
CREATE UNIQUE INDEX IF NOT EXISTS idx_photos_user_photo_hash_unique
  ON public.photos(user_id, photo_hash)
  WHERE photo_hash IS NOT NULL;
ALTER TABLE public.photos
ADD CONSTRAINT photos_photo_hash_hex_check
CHECK (photo_hash IS NULL OR photo_hash ~ '^[a-f0-9]{64}$');

-- 3. User Saved Shows Table
CREATE TABLE IF NOT EXISTS public.saved_shows (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  show_date VARCHAR(10) NOT NULL,
  venue_name TEXT,
  location TEXT,
  show_data JSONB DEFAULT '{}'::jsonb,
  user_notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (user_id, show_date)
);

ALTER TABLE public.saved_shows ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage their saved shows"
  ON public.saved_shows FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS idx_saved_shows_user_id ON public.saved_shows(user_id);

-- 4. Storage Bucket Setup (Execute in SQL Editor or via Supabase dashboard)
-- Note: Ensure private storage bucket 'user-photos' exists.
INSERT INTO storage.buckets (id, name, public) 
VALUES ('user-photos', 'user-photos', false)
ON CONFLICT (id) DO NOTHING;

-- Storage RLS Policies
CREATE POLICY "Authenticated users can upload photos to their folder" 
  ON storage.objects FOR INSERT 
  WITH CHECK (
    bucket_id = 'user-photos' 
    AND auth.role() = 'authenticated' 
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

CREATE POLICY "Users can view their own uploaded photos" 
  ON storage.objects FOR SELECT 
  USING (
    bucket_id = 'user-photos' 
    AND auth.uid()::text = (storage.foldername(name))[1]
  );

CREATE POLICY "Users can delete their own uploaded photos" 
  ON storage.objects FOR DELETE 
  USING (
    bucket_id = 'user-photos' 
    AND auth.uid()::text = (storage.foldername(name))[1]
  );
