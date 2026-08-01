import { getRecentFanPhotoShows, getUserLibraryPhotos, getUserSavedShows } from '../actions/user-library';
import { createClient } from '../../lib/supabase/server';
import { redirect } from 'next/navigation';
import Link from 'next/link';
import UserNav from '../../components/UserNav';
import LibraryPhotoDeleteButton from '../../components/LibraryPhotoDeleteButton';
import PhotoVisibilityToggle from '../../components/PhotoVisibilityToggle';

export const dynamic = 'force-dynamic';

function getSavedShowMetadata(photo) {
  const rawExif = photo?.raw_exif;
  if (!rawExif || typeof rawExif !== 'object' || Array.isArray(rawExif)) {
    return null;
  }

  const showMetadata = rawExif.showMetadata;
  if (!showMetadata || typeof showMetadata !== 'object' || Array.isArray(showMetadata)) {
    return null;
  }

  return showMetadata;
}

function groupShowsByYear(shows) {
  const grouped = new Map();

  (shows || []).forEach((show) => {
    const year = String(show?.show_date || '').slice(0, 4);
    if (!year) {
      return;
    }

    if (!grouped.has(year)) {
      grouped.set(year, []);
    }

    grouped.get(year).push(show);
  });

  return Array.from(grouped.entries())
    .map(([year, yearShows]) => [year, yearShows.sort((left, right) => String(right.show_date).localeCompare(String(left.show_date)))])
    .sort(([leftYear], [rightYear]) => Number(rightYear) - Number(leftYear));
}

function formatRecentFanPhotoTimestamp(timestamp) {
  if (!timestamp) {
    return 'recently';
  }

  const parsed = new Date(timestamp);
  if (Number.isNaN(parsed.getTime())) {
    return 'recently';
  }

  return parsed.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

export default async function LibraryPage() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    redirect('/');
  }

  const { photos, error: photosError } = await getUserLibraryPhotos();
  const { shows, error: showsError } = await getUserSavedShows();
  const { shows: recentFanPhotoShows, error: recentFanPhotoShowsError } = await getRecentFanPhotoShows(12);
  const groupedShows = groupShowsByYear(shows);
  const defaultOpenYear = groupedShows[0]?.[0] || null;

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
              {photos.map((photo) => {
                const savedShowMetadata = getSavedShowMetadata(photo);
                const showDate = savedShowMetadata?.matchedShowDate || photo.matched_show_date || null;
                const venueName = savedShowMetadata?.venueName || savedShowMetadata?.showData?.venueName || 'Unknown venue';
                const currentSong = savedShowMetadata?.currentSong || null;
                const calibrationSource = savedShowMetadata?.timingCalibration?.source || savedShowMetadata?.calibrationSource || null;
                const calibrationConfidence = savedShowMetadata?.timingCalibration?.confidence || savedShowMetadata?.calibrationConfidence || null;

                return (
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
                      <p className="text-cyan-300">
                        Show: {showDate || 'Unknown date'}
                      </p>
                      <p className="text-slate-400 truncate">Venue: {venueName}</p>
                      <p className="text-slate-400 truncate">Current song: {currentSong || 'Unknown'}</p>
                      {(calibrationSource || calibrationConfidence) ? (
                        <p className="text-[11px] text-amber-300 truncate">
                          Timing calibration: {calibrationSource || 'unknown source'}{calibrationConfidence ? ` (${calibrationConfidence} confidence)` : ''}
                        </p>
                      ) : null}
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
                      <div className="pt-1">
                        <span className={`inline-flex rounded-full border px-2 py-1 text-[10px] font-semibold uppercase tracking-wider ${
                          photo.is_public
                            ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300'
                            : 'border-slate-700 bg-slate-900 text-slate-400'
                        }`}>
                          {photo.is_public ? 'Public' : 'Private'}
                        </span>
                      </div>
                      <p className="pt-1 text-[11px] font-semibold text-cyan-300">Tap to open details & edit metadata →</p>
                    </div>
                    </Link>
                    <div className="mt-3 flex flex-wrap items-center justify-between gap-3 border-t border-slate-800 pt-3">
                      <PhotoVisibilityToggle photoId={photo.id} initialIsPublic={!!photo.is_public} />
                      <LibraryPhotoDeleteButton
                        photoId={photo.id}
                        storagePath={photo.storage_path}
                        label="Delete photo"
                        className="rounded-lg border border-red-500/50 bg-red-500/10 px-3 py-1.5 text-xs font-semibold text-red-200 transition hover:bg-red-500/20 disabled:opacity-60"
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>

        {/* Section 2: Recent Fan Photos */}
        <section className="space-y-4 pt-4 border-t border-slate-800">
          <details open className="overflow-hidden rounded-2xl border border-slate-800 bg-slate-950/60">
            <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 text-left">
              <div>
                <h2 className="text-xl font-semibold text-white">Recent Fan Photos</h2>
                <p className="text-xs text-slate-400">
                  New public fan photos added to your bookmarked shows
                </p>
              </div>
              <span className="rounded-full border border-slate-700 bg-slate-900 px-2.5 py-1 text-[11px] font-semibold text-slate-300">
                {recentFanPhotoShows.length} {recentFanPhotoShows.length === 1 ? 'show' : 'shows'}
              </span>
            </summary>
            <div className="border-t border-slate-800 p-4">
              {recentFanPhotoShowsError ? (
                <div className="rounded-2xl border border-dashed border-slate-800 p-6 text-center text-sm text-slate-400">
                  {recentFanPhotoShowsError}
                </div>
              ) : recentFanPhotoShows.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-slate-800 p-6 text-center text-sm text-slate-400">
                  No recent fan-photo activity yet on your bookmarked shows.
                </div>
              ) : (
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  {recentFanPhotoShows.map((show) => (
                    <Link
                      key={show.show_date}
                      href={`/library/show/${show.show_date}`}
                      className="rounded-2xl border border-slate-800 bg-slate-900/70 p-4 transition-all hover:border-cyan-500/40"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="text-xs font-bold text-cyan-400">{show.show_date || 'Unknown date'}</p>
                          <p className="text-base font-semibold text-white">{show.venue_name || 'Venue Unknown'}</p>
                          {show.location ? <p className="text-xs text-slate-400">{show.location}</p> : null}
                        </div>
                        <span className="shrink-0 rounded-full border border-cyan-500/40 bg-cyan-500/10 px-2.5 py-1 text-[11px] font-semibold text-cyan-200">
                          +{show.new_public_photo_count} {show.new_public_photo_count === 1 ? 'photo' : 'photos'}
                        </span>
                      </div>
                      <p className="mt-2 text-xs text-slate-400">
                        Latest add: {formatRecentFanPhotoTimestamp(show.latest_public_photo_at)}
                      </p>
                    </Link>
                  ))}
                </div>
              )}
            </div>
          </details>
        </section>

        {/* Section 3: Bookmarked Shows */}
        <section className="space-y-4 pt-4 border-t border-slate-800">
          <h2 className="text-xl font-semibold text-white">Bookmarked Shows ({shows.length})</h2>

          {shows.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-slate-800 p-8 text-center text-slate-400">
              No bookmarked shows yet. Click "Bookmark Show" when viewing matching show entries.
            </div>
          ) : (
            <div className="space-y-4">
              {groupedShows.map(([year, yearShows]) => (
                <details
                  key={year}
                  open={year === defaultOpenYear}
                  className="overflow-hidden rounded-2xl border border-slate-800 bg-slate-950/60"
                >
                  <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 text-left">
                    <div>
                      <p className="text-sm font-semibold text-white">{year}</p>
                      <p className="text-xs text-slate-400">{yearShows.length} show{yearShows.length === 1 ? '' : 's'}</p>
                    </div>
                    <span className="rounded-full border border-slate-700 bg-slate-900 px-2.5 py-1 text-[11px] font-semibold text-slate-300">
                      {yearShows.length} {yearShows.length === 1 ? 'show' : 'shows'}
                    </span>
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
                          <Link
                            href={`/library/show/${show.show_date}`}
                            className="block p-5"
                          >
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
                            {show.user_notes && (
                              <p className="mt-3 rounded-xl bg-slate-900/90 p-3 text-xs italic text-slate-300">
                                "{show.user_notes}"
                              </p>
                            )}
                          </Link>
                          {phishNetUrl && (
                            <div className="border-t border-slate-800 px-5 py-3">
                              <a
                                href={phishNetUrl}
                                target="_blank"
                                rel="noreferrer"
                                className="text-xs font-medium text-cyan-400 underline hover:text-cyan-300"
                              >
                                Open on phish.net ↗
                              </a>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </details>
              ))}
            </div>
          )}
        </section>

      </div>
    </main>
  );
}
