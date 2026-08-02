import { getRecentFanPhotoShows, getUserLibraryPhotos, getUserLikedPhotos, getUserSavedShows } from '../actions/user-library';
import { createClient } from '../../lib/supabase/server';
import { redirect } from 'next/navigation';
import Link from 'next/link';
import UserNav from '../../components/UserNav';
import PhotoLikeButton from '../../components/PhotoLikeButton';
import SavedPhotosPanel from '../../components/SavedPhotosPanel';
import { groupPhotosByYearAndShow } from '../../lib/photo-grouping';

export const dynamic = 'force-dynamic';

const TAB_KEYS = ['saved-photos', 'recent-fan-photos', 'bookmarked-shows', 'favorites'];

function formatRecentFanPhotoTimestamp(timestamp) {
  if (!timestamp) return 'recently';
  const parsed = new Date(timestamp);
  if (Number.isNaN(parsed.getTime())) return 'recently';
  return parsed.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function groupShowsByYear(shows) {
  const grouped = new Map();
  (shows || []).forEach((show) => {
    const year = String(show?.show_date || '').slice(0, 4) || 'Unknown Year';
    if (!grouped.has(year)) grouped.set(year, []);
    grouped.get(year).push(show);
  });

  return Array.from(grouped.entries())
    .map(([year, yearShows]) => [
      year,
      yearShows.sort((left, right) => String(right.show_date || '').localeCompare(String(left.show_date || ''))),
    ])
    .sort(([leftYear], [rightYear]) => {
      if (leftYear === 'Unknown Year') return 1;
      if (rightYear === 'Unknown Year') return -1;
      return Number(rightYear) - Number(leftYear);
    });
}

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
  const groupedSavedShows = groupShowsByYear(savedShows);
  const groupedFavoritePhotos = groupPhotosByYearAndShow(favoritePhotos);
  const groupedRecentFanShows = groupShowsByYear(recentFanPhotoShows);
  const bookmarkedShowDates = new Set((savedShows || []).map((show) => show.show_date).filter(Boolean));

  const defaultRecentFanYear = groupedRecentFanShows[0]?.[0] || null;
  const defaultBookmarkedYear = groupedSavedShows[0]?.[0] || null;
  const defaultFavoritesYear = groupedFavoritePhotos[0]?.year || null;

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
            {recentFanPhotoShowsError ? (
              <div className="rounded-2xl border border-dashed border-slate-800 p-8 text-center text-slate-400">{recentFanPhotoShowsError}</div>
            ) : groupedRecentFanShows.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-slate-800 p-8 text-center text-slate-400">
                No public fan photos from other users yet.
              </div>
            ) : (
              <div className="space-y-4">
                {groupedRecentFanShows.map(([year, yearShows]) => (
                  <details key={year} open={year === defaultRecentFanYear} className="overflow-hidden rounded-2xl border border-slate-800 bg-slate-950/60">
                    <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 text-left">
                      <div>
                        <p className="text-sm font-semibold text-white">{year}</p>
                        <p className="text-xs text-slate-400">{yearShows.length} show{yearShows.length === 1 ? '' : 's'}</p>
                      </div>
                    </summary>
                    <div className="grid grid-cols-1 gap-4 border-t border-slate-800 p-4 sm:grid-cols-2">
                      {yearShows.map((show) => {
                        const isBookmarked = bookmarkedShowDates.has(show.show_date);
                        return (
                          <Link key={show.show_date} href={`/library/show/${show.show_date}`} className="block rounded-2xl border border-slate-800 bg-slate-900/70 p-4 transition-all hover:border-cyan-500/40">
                            <div className="flex items-start justify-between gap-3">
                              <div className="min-w-0">
                                <div className="flex flex-wrap items-center gap-2">
                                  <p className="text-xs font-bold text-cyan-400">{show.show_date || 'Unknown date'}</p>
                                  {isBookmarked ? (
                                    <span className="inline-flex items-center gap-1 rounded-full border border-emerald-500/40 bg-emerald-500/10 px-2 py-0.5 text-[10px] font-semibold text-emerald-300">
                                      Bookmarked
                                    </span>
                                  ) : null}
                                </div>
                                <p className="mt-0.5 truncate text-base font-semibold text-white">{show.venue_name || 'Venue Unknown'}</p>
                                {show.location ? <p className="truncate text-xs text-slate-400">{show.location}</p> : null}
                              </div>
                              <span className="shrink-0 rounded-full border border-cyan-500/40 bg-cyan-500/10 px-2.5 py-1 text-[11px] font-semibold text-cyan-200">
                                +{show.new_public_photo_count} {show.new_public_photo_count === 1 ? 'photo' : 'photos'}
                              </span>
                            </div>
                            <p className="mt-2 text-xs text-slate-400">Latest: {formatRecentFanPhotoTimestamp(show.latest_public_photo_at)}</p>
                          </Link>
                        );
                      })}
                    </div>
                  </details>
                ))}
              </div>
            )}
          </section>
        ) : null}

        {activeTab === 'bookmarked-shows' ? (
          <section className="space-y-4">
            {showsError ? (
              <div className="rounded-2xl border border-dashed border-slate-800 p-8 text-center text-slate-400">{showsError}</div>
            ) : groupedSavedShows.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-slate-800 p-8 text-center text-slate-400">
                No bookmarked shows yet. Click "Bookmark Show" when viewing matching show entries.
              </div>
            ) : (
              <div className="space-y-4">
                {groupedSavedShows.map(([year, yearShows]) => (
                  <details key={year} open={year === defaultBookmarkedYear} className="overflow-hidden rounded-2xl border border-slate-800 bg-slate-950/60">
                    <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 text-left">
                      <div>
                        <p className="text-sm font-semibold text-white">{year}</p>
                        <p className="text-xs text-slate-400">{yearShows.length} show{yearShows.length === 1 ? '' : 's'}</p>
                      </div>
                    </summary>
                    <div className="grid grid-cols-1 gap-4 border-t border-slate-800 p-4 sm:grid-cols-2">
                      {yearShows.map((show) => {
                        const phishNetUrl =
                          show.show_data?.phishNetUrl ||
                          (show.show_date
                            ? `https://phish.net/setlists/?d=${encodeURIComponent(show.show_date)}`
                            : null);
                        return (
                          <div key={show.id} className="overflow-hidden rounded-2xl border border-slate-800 bg-slate-900/70 transition-all hover:border-cyan-500/40">
                            <Link href={`/library/show/${show.show_date}`} className="block p-5">
                              <div className="flex items-start justify-between gap-3">
                                <div>
                                  <span className="text-xs font-bold text-cyan-400">{show.show_date}</span>
                                  <h3 className="mt-0.5 text-lg font-semibold text-white">{show.venue_name || 'Venue Unknown'}</h3>
                                  <p className="text-xs text-slate-400">{show.location || ''}</p>
                                </div>
                                <div className={`shrink-0 rounded-full border px-2.5 py-1 text-[11px] font-semibold ${show.public_photo_count > 0 ? 'border-cyan-500/40 bg-cyan-500/10 text-cyan-200' : 'border-slate-700 bg-slate-900 text-slate-400'}`}>
                                  📸 {show.public_photo_count} {show.public_photo_count === 1 ? 'photo' : 'photos'}
                                </div>
                              </div>
                              {show.user_notes ? (
                                <p className="mt-3 rounded-xl bg-slate-900/90 p-3 text-xs italic text-slate-300">
                                  "{show.user_notes}"
                                </p>
                              ) : null}
                            </Link>
                            {phishNetUrl ? (
                              <div className="border-t border-slate-800 px-5 py-3">
                                <a href={phishNetUrl} target="_blank" rel="noreferrer" className="text-xs font-medium text-cyan-400 underline hover:text-cyan-300">
                                  Open on phish.net ↗
                                </a>
                              </div>
                            ) : null}
                          </div>
                        );
                      })}
                    </div>
                  </details>
                ))}
              </div>
            )}
          </section>
        ) : null}

        {activeTab === 'favorites' ? (
          <section className="space-y-4">
            {favoritePhotosError ? (
              <div className="rounded-2xl border border-dashed border-slate-800 p-8 text-center text-slate-400">{favoritePhotosError}</div>
            ) : groupedFavoritePhotos.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-slate-800 p-8 text-center text-slate-400">
                No liked photos yet.
              </div>
            ) : (
              <div className="space-y-4">
                {groupedFavoritePhotos.map((yearGroup) => (
                  <details key={yearGroup.year} open={yearGroup.year === defaultFavoritesYear} className="overflow-hidden rounded-2xl border border-slate-800 bg-slate-950/60">
                    <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 text-left">
                      <div>
                        <p className="text-sm font-semibold text-white">{yearGroup.year}</p>
                        <p className="text-xs text-slate-400">{yearGroup.groups.length} grouping{yearGroup.groups.length === 1 ? '' : 's'}</p>
                      </div>
                    </summary>
                    <div className="space-y-4 border-t border-slate-800 p-4">
                      {yearGroup.groups.map((group) => (
                        <div key={`${yearGroup.year}-${group.key}`} className="rounded-2xl border border-slate-800 bg-slate-900/70 p-4">
                          <div className="mb-3 flex items-center justify-between gap-2">
                            <div>
                              <p className="text-sm font-semibold text-white">{group.label}</p>
                              {group.showDate ? (
                                <p className="text-xs text-slate-400">
                                  {group.venueName || 'Unknown venue'}
                                  {group.location ? ` • ${group.location}` : ''}
                                </p>
                              ) : (
                                <p className="text-xs text-slate-400">Photos not matched to a show date</p>
                              )}
                            </div>
                            {group.showDate ? (
                              <Link href={`/library/show/${group.showDate}`} className="text-xs font-medium text-cyan-400 underline hover:text-cyan-300">
                                Open show →
                              </Link>
                            ) : null}
                          </div>
                          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                            {group.photos.map((photo) => {
                              const creatorName = photo.creator?.display_name || photo.creator?.username || 'Anonymous';
                              return (
                                <div key={photo.id} className="overflow-hidden rounded-2xl border border-slate-800 bg-slate-950/60 transition-all hover:border-rose-500/30">
                                  {photo.url ? (
                                    <div className="relative aspect-square w-full overflow-hidden bg-slate-900">
                                      <img src={photo.url} alt={photo.file_name || 'Fan photo'} className="h-full w-full object-cover" />
                                    </div>
                                  ) : (
                                    <div className="flex aspect-square w-full items-center justify-center bg-slate-900 text-xs text-slate-500">
                                      Photo unavailable
                                    </div>
                                  )}
                                  <div className="space-y-2 p-4">
                                    <p className="truncate text-xs font-medium text-cyan-300">
                                      🎵 {photo.currentSong || 'Unknown'}
                                    </p>
                                    {photo.timeContextLabel ? (
                                      <p className="truncate text-[11px] text-slate-500">Context: {photo.timeContextLabel}</p>
                                    ) : null}
                                    <div className="flex items-center justify-between gap-3">
                                      <p className="truncate text-xs text-slate-400">By {creatorName}</p>
                                      <PhotoLikeButton
                                        photoId={photo.id}
                                        initialLikeCount={photo.like_count}
                                        initialLikedByMe={true}
                                        size="sm"
                                      />
                                    </div>
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      ))}
                    </div>
                  </details>
                ))}
              </div>
            )}
          </section>
        ) : null}
      </div>
    </main>
  );
}
