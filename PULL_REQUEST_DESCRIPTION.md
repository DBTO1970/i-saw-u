# Pull request description

This PR restores the full image uploader and implements photo visibility controls across the upload and edit flows.

- Adds a Public/Private switch to the upload UI and includes isPublic in the save payload.
- Updates server action updateUserLibraryPhotoMetadata to accept and persist visibility (isPublic / is_public), writing visibility into raw_exif as fallback when the DB schema lacks photos.is_public.
- Makes PhotoVisibilityToggle controllable (optional isPublic/onChange props) and wires it into LibraryPhotoDetailEditor so the top immediate toggle and the inline editor toggle stay in sync without requiring a full refetch.
- Ensures Save metadata includes isPublic so visibility can be updated together with other metadata in one action.

Testing checklist:

- Upload flow
  - Upload a photo and toggle Visibility to Public and Private; inspect network request to /api/library/save-photo and verify form field isPublic is present ('true' or 'false').
  - Confirm DB row has is_public updated (if the column exists) and raw_exif contains is_public/isPublic/visibility.
- Edit flow
  - Open a photo in the editor — both the top immediate visibility switch and the inline Metadata visibility switch should reflect the same state.
  - Toggle visibility using the top immediate switch and observe that the inline switch updates immediately (no page reload required).
  - Toggle visibility using the inline switch and Save metadata — verify the server persisted is_public and raw_exif.
- Fallback
  - If photos.is_public column is absent, verify that raw_exif includes is_public/isPublic/visibility and the fallback path returns success.
- Public lists
  - Mark a photo Public and confirm it appears in views that filter for is_public = true (may require reload depending on caching).

