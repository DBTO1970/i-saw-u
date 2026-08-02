ALTER TABLE public.photos
ADD COLUMN IF NOT EXISTS photo_hash TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS idx_photos_user_photo_hash_unique
  ON public.photos (user_id, photo_hash)
  WHERE photo_hash IS NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'photos_photo_hash_hex_check'
  ) THEN
    ALTER TABLE public.photos
    ADD CONSTRAINT photos_photo_hash_hex_check
      CHECK (photo_hash IS NULL OR photo_hash ~ '^[a-f0-9]{64}$');
  END IF;
END $$;
