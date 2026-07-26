import { getUserLibraryPhotos, getUserSavedShows } from '../actions/user-library';
import { createClient } from '../../lib/supabase/server';
import { redirect } from 'next/navigation';
import Link from 'next/link';
import UserNav from '../../components/UserNav';
import LibraryPhotoDeleteButton from '../../components/LibraryPhotoDeleteButton';

export const dynamic = 'force-dynamic';

export default async function LibraryPage() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    redirect('/');
  }

  const { photos, error: photosError } = await getUserLibraryPhotos();
  const { shows, error: showsError } = await getUserSavedShows();

  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top,_rgba(56,189,248,0.16),_transparent_60%)] px-3 py-4 sm:px-4 sm:py-8">
      <div className="mx-auto w-full max-w-6xl space-y-8 rounded-2xl border border-slate-800 bg-slate-900/70 p-4 shadow-2xl shadow-slate-950/40 backdrop-blur sm:rounded-3xl sm:p-6 md:p-10">
        
        {/* Navigation Header */}
        <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-800 pb-6">
          <div className="space-y-1">
            <Link href="/" className="inline-flex items-center text-xs font-semibold uppercase tracking-widest text-cyan-400 hover:underline">
              ← Back to Matcher
            </Link>
            <h1 className="text-2xl font-bold text-white sm:text-3xl">My Personal Library</h1>
          </div>
          <UserNav />
        </div>

        {/* Section 1: Saved Photos */}
        <section className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-semibold text-white">Saved Photos ({photos.length})</h2>
            <span className="text-xs text-cyan-400 font-medium">Optimized WebP Format</span>
          </div>

          {photos.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-slate-800 p-8 text-center text-slate-400">
              No saved photos yet. Upload a photo on the home page and click "Save to Library".
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {photos.map((photo) => (
                <div
                  key={photo.id}
                  className="group relative overflow-hidden rounded-2xl border border-slate-800 bg-slate-950/60 p-4 transition-all hover:border-cyan-500/40"
                >
                  <Link href={`/library/photo/${photo.id}`} className="block">
                    {photo.url ? (
                      <div className="relative mb-3 aspect-video w-full overflow-hidden rounded-xl bg-slate-900">
                        <img
                          src={photo.url}
                          alt={photo.file_name}
                          className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
                        />
                      </div>
                    ) : (
                      <div className="mb-3 flex aspect-video w-full items-center justify-center rounded-xl bg-slate-900 text-xs text-slate-500">
                        Photo Unavailable
                      </div>
                    )}

                    <div className="space-y-1 text-xs text-slate-300">
                      <p className="font-semibold text-white truncate">{photo.file_name}</p>
                      <div className="flex items-center space-x-2 text-slate-400">
                        <span>Date Taken: {photo.date_taken || 'Unknown'}</span>
                        {photo.time_taken && <span>• {photo.time_taken}</span>}
                        {photo.show_start_time && <span>• Show start: {photo.show_start_time}</span>}
                      </div>
                      {photo.matched_show_date && (
                        <p className="text-cyan-400">Matched Show: {photo.matched_show_date}</p>
                      )}
                      {photo.gps_latitude && photo.gps_longitude && (
                        <p className="text-[11px] text-slate-500">
                          GPS: {photo.gps_latitude.toFixed(4)}, {photo.gps_longitude.toFixed(4)}
                        </p>
                      )}
                      <p className="pt-1 text-[11px] font-semibold text-cyan-300">Tap to open details & edit metadata →</p>
                    </div>
                  </Link>
                  <div className="mt-3 border-t border-slate-800 pt-3">
                    <LibraryPhotoDeleteButton
                      photoId={photo.id}
                      storagePath={photo.storage_path}
                      label="Delete photo"
                      className="rounded-lg border border-red-500/50 bg-red-500/10 px-3 py-1.5 text-xs font-semibold text-red-200 transition hover:bg-red-500/20 disabled:opacity-60"
                    />
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* Section 2: Bookmarked Shows */}
        <section className="space-y-4 pt-4 border-t border-slate-800">
          <h2 className="text-xl font-semibold text-white">Bookmarked Shows ({shows.length})</h2>

          {shows.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-slate-800 p-8 text-center text-slate-400">
              No bookmarked shows yet. Click "Bookmark Show" when viewing matching show entries.
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              {shows.map((show) => (
                <div key={show.id} className="rounded-2xl border border-slate-800 bg-slate-950/60 p-5 transition-all hover:border-cyan-500/40">
                  <div className="flex items-start justify-between">
                    <div>
                      <span className="text-xs font-bold text-cyan-400">{show.show_date}</span>
                      <h3 className="text-lg font-semibold text-white">{show.venue_name || 'Venue Unknown'}</h3>
                      <p className="text-xs text-slate-400">{show.location || ''}</p>
                    </div>
                  </div>
                  {show.user_notes && (
                    <p className="mt-3 rounded-xl bg-slate-900/90 p-3 text-xs italic text-slate-300">
                      "{show.user_notes}"
                    </p>
                  )}
                </div>
              ))}
            </div>
          )}
        </section>

      </div>
    </main>
  );
}
