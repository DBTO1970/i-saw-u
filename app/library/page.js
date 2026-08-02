import { getRecentFanPhotoShows, getUserLibraryPhotos, getUserLikedPhotos, getUserSavedShows } from '../actions/user-library';
import { createClient } from '../../lib/supabase/server';
import { redirect } from 'next/navigation';
import Link from 'next/link';
import UserNav from '../../components/UserNav';
import SavedPhotosPanel from '../../components/SavedPhotosPanel';
import FavoritesPanel from '../../components/FavoritesPanel';
import BookmarkedShowsPanel from '../../components/BookmarkedShowsPanel';
import RecentFanPhotosPanel from '../../components/RecentFanPhotosPanel';

export const dynamic = 'force-dynamic';

const TAB_KEYS = ['saved-photos', 'recent-fan-photos', 'bookmarked-shows', 'favorites'];

export default async function LibraryPage({ searchParams }) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    redirect('/');
  }

  const [
    { photos, error: photosError },
    { shows: savedShows, error: showsError },
    { shows: recentFanPhotoShows, error: recentFanPhotoShowsError },
    { photos: favoritePhotos, error: favoritePhotosError },
  ] = await Promise.all([
    getUserLibraryPhotos(),
    getUserSavedShows(),
    getRecentFanPhotoShows(24),
    getUserLikedPhotos(),
  ]);

  const activeTab = TAB_KEYS.includes(searchParams?.tab) ? searchParams.tab : 'saved-photos';
  const bookmarkedShowDates = (savedShows || []).map((show) => show.show_date).filter(Boolean);

  const tabs = [
    { key: 'saved-photos', label: `Saved Photos (${photos.length})` },
    { key: 'recent-fan-photos', label: `Recent Fan Photos (${recentFanPhotoShows.length})` },
    { key: 'bookmarked-shows', label: `Bookmarked Shows (${savedShows.length})` },
    { key: 'favorites', label: `Favorites (${favoritePhotos.length})` },
  ];

  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top,_rgba(56,189,248,0.16),_transparent_60%)] px-3 py-4 sm:px-4 sm:py-8">
      <div className="mx-auto w-full max-w-6xl space-y-6 rounded-2xl border border-slate-800 bg-slate-900/70 p-4 shadow-2xl shadow-slate-950/40 backdrop-blur sm:rounded-3xl sm:p-6 md:p-10">
        <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-800 pb-6">
          <div className="space-y-1">
            <Link href="/" className="inline-flex items-center text-xs font-semibold uppercase tracking-widest text-cyan-400 hover:underline">
              ← Back to Matcher
            </Link>
            <h1 className="text-2xl font-bold text-white sm:text-3xl">My Personal Library</h1>
          </div>
          <UserNav />
        </div>

        <div className="rounded-2xl border border-slate-800 bg-slate-950/60 p-2">
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
            {tabs.map((tab) => (
              <Link
                key={tab.key}
                href={`/library?tab=${tab.key}`}
                className={`rounded-xl px-3 py-2 text-center text-xs font-semibold transition ${
                  activeTab === tab.key
                    ? 'border border-cyan-500/40 bg-cyan-500/20 text-cyan-200'
                    : 'border border-slate-800 bg-slate-900/70 text-slate-300 hover:border-cyan-500/30 hover:text-cyan-200'
                }`}
              >
                {tab.label}
              </Link>
            ))}
          </div>
        </div>

        {activeTab === 'saved-photos' ? (
          <section className="space-y-4">
            <SavedPhotosPanel photos={photos} photosError={photosError} />
          </section>
        ) : null}

        {activeTab === 'recent-fan-photos' ? (
          <section className="space-y-4">
            <RecentFanPhotosPanel
              shows={recentFanPhotoShows}
              bookmarkedShowDates={bookmarkedShowDates}
              error={recentFanPhotoShowsError}
            />
          </section>
        ) : null}

        {activeTab === 'bookmarked-shows' ? (
          <section className="space-y-4">
            <BookmarkedShowsPanel shows={savedShows} showsError={showsError} />
          </section>
        ) : null}

        {activeTab === 'favorites' ? (
          <section className="space-y-4">
            <FavoritesPanel photos={favoritePhotos} photosError={favoritePhotosError} />
          </section>
        ) : null}
      </div>
    </main>
  );
}
