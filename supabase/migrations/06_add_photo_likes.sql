-- Photo likes table
CREATE TABLE IF NOT EXISTS public.photo_likes (
  id          UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  photo_id    UUID REFERENCES public.photos(id) ON DELETE CASCADE NOT NULL,
  user_id     UUID REFERENCES auth.users(id)  ON DELETE CASCADE NOT NULL,
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (photo_id, user_id)
);

ALTER TABLE public.photo_likes ENABLE ROW LEVEL SECURITY;

-- Any authenticated user can see like counts
CREATE POLICY "Likes are viewable by authenticated users"
  ON public.photo_likes FOR SELECT
  USING (auth.role() = 'authenticated');

-- Users can add their own likes
CREATE POLICY "Users can like photos"
  ON public.photo_likes FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Users can remove their own likes
CREATE POLICY "Users can unlike photos"
  ON public.photo_likes FOR DELETE
  USING (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS idx_photo_likes_photo_id ON public.photo_likes(photo_id);
CREATE INDEX IF NOT EXISTS idx_photo_likes_user_id  ON public.photo_likes(user_id);
