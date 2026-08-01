'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';

const DISMISSED_FAN_SHOWS_KEY_PREFIX = 'dismissedRecentFanShowsV1';

function formatRecentFanPhotoTimestamp(timestamp) {
  if (!timestamp) return 'recently';
  const parsed = new Date(timestamp);
  if (Number.isNaN(parsed.getTime())) return 'recently';
  return parsed.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function getStorageKey(userId, sessionKey) {
  const userSegment = userId || 'unknown-user';
  const sessionSegment = sessionKey || 'unknown-session';
  return `${DISMISSED_FAN_SHOWS_KEY_PREFIX}:${userSegment}:${sessionSegment}`;
}

function readDismissedShows(userId, sessionKey) {
  if (typeof window === 'undefined') {
    return {};
  }

  try {
    const raw = window.sessionStorage.getItem(getStorageKey(userId, sessionKey));
    if (!raw) {
      return {};
    }
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return {};
    }
    return parsed;
  } catch {
    return {};
  }
}

function writeDismissedShows(userId, sessionKey, dismissedMap) {
  if (typeof window === 'undefined') {
    return;
  }

  try {
    window.sessionStorage.setItem(getStorageKey(userId, sessionKey), JSON.stringify(dismissedMap));
  } catch {
    // no-op: UI can still function without persistence
  }
}

export default function RecentFanPhotosFeed({
  shows = [],
  bookmarkedShowDates = [],
  error = null,
  currentUserId = null,
  sessionKey = '',
}) {
  const bookmarkedSet = new Set(bookmarkedShowDates);
  const [dismissedByShowDate, setDismissedByShowDate] = useState({});

  useEffect(() => {
    setDismissedByShowDate(readDismissedShows(currentUserId, sessionKey));
  }, [currentUserId, sessionKey]);

  useEffect(() => {
    writeDismissedShows(currentUserId, sessionKey, dismissedByShowDate);
  }, [currentUserId, sessionKey, dismissedByShowDate]);

  const visibleShows = useMemo(
    () =>
      shows.filter((show) => {
        const showDate = show?.show_date;
        if (!showDate) {
          return false;
        }

        const dismissedAt = dismissedByShowDate[showDate];
        if (!dismissedAt) {
          return true;
        }

        const latestAt = show?.latest_public_photo_at || '';
        // Re-show a dismissed show when newer fan photos arrive.
        return latestAt > dismissedAt;
      }),
    [shows, dismissedByShowDate],
  );

  const dismiss = (event, show) => {
    event.preventDefault();
    event.stopPropagation();
    const showDate = show?.show_date;
    if (!showDate) {
      return;
    }

    const dismissedAt = show?.latest_public_photo_at || new Date().toISOString();
    setDismissedByShowDate((prev) => ({
      ...prev,
      [showDate]: dismissedAt,
    }));
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
                <div key={show.show_date} className="relative">
                  {/* Dismiss X button */}
                  <button
                    type="button"
                    aria-label="Dismiss"
                    onClick={(e) => dismiss(e, show)}
                    className="absolute right-2 top-2 z-10 flex h-7 w-7 items-center justify-center rounded-full border border-slate-600 bg-slate-800 text-slate-300 transition hover:border-slate-400 hover:bg-slate-700 hover:text-white"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" className="h-3.5 w-3.5">
                      <path d="M18 6L6 18M6 6l12 12" />
                    </svg>
                  </button>

                  <Link
                    href={`/library/show/${show.show_date}`}
                    className="block rounded-2xl border border-slate-800 bg-slate-900/70 p-4 pr-8 transition-all hover:border-cyan-500/40"
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
                  </Link>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </details>
  );
}
