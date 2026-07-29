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

