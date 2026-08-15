-- Extend the storage RLS policy so that thumbnail objects (stored under a
-- "thumbs/" sub-directory) are also readable when the parent photo record is
-- public.  Previously the policy only matched on an exact storage_path, which
-- works for original photos but not for thumbnail paths of the form
-- {userId}/{showDate}/thumbs/{filename}.
--
-- The reverse mapping is:
--   original: {userId}/{showDate}/{filename}
--   thumbnail: {userId}/{showDate}/thumbs/{filename}
--
-- regexp_replace(thumbnail_name, '(.*/)thumbs/([^/]+)$', '\1\2')
-- converts a thumbnail path back to its original path for the existence check.

DROP POLICY IF EXISTS "Users can view public uploaded photos" ON storage.objects;

CREATE POLICY "Users can view public uploaded photos"
  ON storage.objects FOR SELECT
  USING (
    bucket_id = 'user-photos'
    AND EXISTS (
      SELECT 1
      FROM public.photos p
      WHERE (
        p.storage_path = storage.objects.name
        OR p.storage_path = regexp_replace(storage.objects.name, '(.*/)thumbs/([^/]+)$', '\1\2')
      )
      AND p.is_public = true
    )
  );
