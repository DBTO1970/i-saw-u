### Goal
Track the social gallery and show-detail work that is now implemented, plus the remaining deployment and verification steps.

---

### Completed work

#### 1. Public fan gallery for bookmarked shows
- [x] Added a server-side public-photo fetch for the show detail page using the bookmarked show date.
- [x] Added a fan-gallery grid to the show detail view.
- [x] Added a lightbox for viewing gallery images.
- [x] Excluded the signed-in user's own photos from the public gallery.
- [x] Removed creator identity and metadata overlays from gallery cards and the lightbox so the gallery shows only the photo itself.

#### 2. Photo visibility controls
- [x] Added a public/private toggle for photos in the library UI.
- [x] Made the visibility update flow resilient when the live Supabase schema has not yet received the `photos.is_public` column.
- [x] Normalized visibility from either the database field or stored metadata so the UI remains consistent.

#### 3. Storage access for public gallery images
- [x] Added a Supabase storage policy migration to allow public gallery images to be read.
- [x] Wired gallery cards/lightbox to the signed URLs produced by the server action.

---

### Current blockers / follow-up

- [ ] Apply the storage policy migration in the live Supabase project so public gallery images resolve in the deployed app.
- [ ] Verify the experience end-to-end from a signed-in account with at least one public photo for a bookmarked show.

---

### Notes
- The current implementation is ready locally and builds successfully.
- If the live Supabase project is missing the `photos.is_public` column, the app will still fall back gracefully, but the public-gallery workflow will be incomplete until that schema change is applied.
