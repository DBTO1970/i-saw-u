'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

function formatRecentFanPhotoTimestamp(timestamp) {
  if (!timestamp) return 'recently';
  const parsed = new Date(timestamp);
  if (Number.isNaN(parsed.getTime())) return 'recently';
  return parsed.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

export default function RecentFanPhotosFeed({ shows = [], bookmarkedShowDates = [], error = null }) {
  const router = useRouter();
  const bookmarkedSet = new Set(bookmarkedShowDates);
  const [dismissed, setDismissed] = useState(new Set());

  const visibleShows = shows.filter((show) => !dismissed.has(show.show_date));

  const handleClick = (showDate) => {
    setDismissed((prev) => new Set([...prev, showDate]));
    router.push(`/library/show/${showDate}`);
  };

  return (
    <details open className="overflow-hidden rounded-2xl border border-slate-800 bg-slate-950/60">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 text-left">
        <div>
          <h2 className="text-xl font-semibold text-white">Recent Fan Photos</h2>
          <p className="text-xs text-slate-400">
            Public fan photos from other fans across all Phish shows
          </p>
        </div>
        <span className="rounded-full border border-slate-700 bg-slate-900 px-2.5 py-1 text-[11px] font-semibold text-slate-300">
          {visibleShows.length} {visibleShows.length === 1 ? 'show' : 'shows'}
        </span>
      </summary>

      <div className="border-t border-slate-800 p-4">
        {error ? (
          <div className="rounded-2xl border border-dashed border-slate-800 p-6 text-center text-sm text-slate-400">
            {error}
          </div>
        ) : visibleShows.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-slate-800 p-6 text-center text-sm text-slate-400">
            No public fan photos from other users yet.
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            {visibleShows.map((show) => {
              const isBookmarked = bookmarkedSet.has(show.show_date);
              return (
                <button
                  key={show.show_date}
                  type="button"
                  onClick={() => handleClick(show.show_date)}
                  className="rounded-2xl border border-slate-800 bg-slate-900/70 p-4 text-left transition-all hover:border-cyan-500/40"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="text-xs font-bold text-cyan-400">{show.show_date || 'Unknown date'}</p>
                        {isBookmarked ? (
                          <span className="inline-flex items-center gap-1 rounded-full border border-emerald-500/40 bg-emerald-500/10 px-2 py-0.5 text-[10px] font-semibold text-emerald-300">
                            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="h-2.5 w-2.5">
                              <path fillRule="evenodd" d="M6.32 2.577a49.255 49.255 0 0111.36 0c1.497.174 2.57 1.46 2.57 2.93V21a.75.75 0 01-1.085.67L12 18.089l-7.165 3.583A.75.75 0 013.75 21V5.507c0-1.47 1.073-2.756 2.57-2.93z" clipRule="evenodd" />
                            </svg>
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
                  <p className="mt-2 text-xs text-slate-400">
                    Latest: {formatRecentFanPhotoTimestamp(show.latest_public_photo_at)}
                  </p>
                </button>
              );
            })}
          </div>
        )}
      </div>
    </details>
  );
}
