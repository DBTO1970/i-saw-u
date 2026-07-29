### Goal
Allow users to toggle their saved show photos as "Public." Users who have bookmarked/saved the same show can view a public gallery of other fans' photos from that show, alongside creator avatars and basic user stats.

---

### Task 1: Database Schema & Row Level Security (Supabase / Postgres)
* **Photo Visibility Toggle:** 
  * Add an `is_public` boolean column (default `false`) to the `user_photos` table.
* **User Profile / Stats Table:**
  * Ensure a `profiles` or `users` table exists containing: `id`, `username`, `avatar_url`, and `display_name`.
  * Add a computed/aggregated query or helper function to return basic fan stats (e.g., `total_shows_attended`, `total_public_photos`).
* **Update RLS Policies:**
  * Update SELECT policy on `user_photos`: Allow a user to read photos if `auth.uid() = user_id` OR if `is_public = true`.

---

### Task 2: Server Actions / Data Fetching
* **Toggle Visibility Server Action:**
  * Create/update a server action `togglePhotoVisibility(photoId: string, isPublic: boolean)` that updates `is_public` for the authenticated owner.
* **Fetch Community Show Gallery Action:**
  * Create a server action `getPublicPhotosForShow(showDate: string)` or `(showId: string)`:
    * Fetch all photos where `matched_show_date = showDate` AND `is_public = true`.
    * Join with `profiles` to attach creator details (`username`, `avatar_url`).
    * Exclude or highlight the current logged-in user's own photos if desired.

---

### Task 3: UI Implementation
* **Photo Detail / Card Toggle Component:**
  * Add a "Public / Private" toggle switch (using Hero UI or Tailwind) on the user's saved photo card so they can control visibility instantly.
* **Show Community Gallery Section:**
  * On the Show Detail page (`/shows/[date]`), add a **"Fan Gallery"** section below the main show details.
  * Render a grid of public user photos.
  * For each photo, render a sleek overlay or header showing:
    * Avatar image (with fallback initials if missing).
    * Username / Display name.
    * Optional stat badge (e.g., "12 Shows Saved").
* **Image Modal / Lightbox:**
  * Clicking a fan photo opens a lightweight preview modal maintaining intrinsic aspect ratio (`w-full h-auto` / `object-contain`) with photo EXIF time and creator credits.