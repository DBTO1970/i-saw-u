'use client';

import { useMemo } from 'react';
import Link from 'next/link';
import { groupShowsByYear } from '../lib/show-grouping';
import { useSortedList } from '../lib/useSortedList';

type RecentFanShow = Record<string, unknown>;
type MappedShow = RecentFanShow & { exifShowDate: string | null; dateSaved: string | null };

type RecentFanPhotosPanelProps = {
  shows: RecentFanShow[];
  bookmarkedShowDates: string[];
  error?: string | null;
};

function formatRecentFanPhotoTimestamp(timestamp: string | null | undefined): string {
  if (!timestamp) return 'recently';
  const parsed = new Date(timestamp);
  if (Number.isNaN(parsed.getTime())) return 'recently';
  return parsed.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function getArtistName(show: RecentFanShow): string {
  const showData = show && typeof show === 'object' ? (show.show_data as Record<string, unknown> | undefined) : undefined;
  const showMetadata = showData?.showMetadata && typeof showData.showMetadata === 'object' ? (showData.showMetadata as Record<string, unknown>) : undefined;
  return (
    (showData?.artistName as string | undefined)
    || (showData?.artist_name as string | undefined)
    || (showMetadata?.artistName as string | undefined)
    || (showMetadata?.artist_name as string | undefined)
    || 'Show'
  );
}

export default function RecentFanPhotosPanel({ shows, bookmarkedShowDates, error }: RecentFanPhotosPanelProps) {
  const bookmarkedSet = useMemo(() => new Set(bookmarkedShowDates), [bookmarkedShowDates]);
  const mappedShows = useMemo(
    (): MappedShow[] =>
      shows.map((show) => ({
        ...show,
        // Map show fields to the SortablePhoto interface expected by useSortedList
        exifShowDate: (show.show_date as string | null) ?? null,
        // 'dateSaved' here means "most recently active" — when the latest fan photo was posted
        dateSaved: (show.latest_public_photo_at as string | null) ?? null,
      })),
    [shows],
  );

  const { sortedData, sortBy, SortControlComponent } = useSortedList(mappedShows, 'showDate');

  const groupedShows = useMemo(() => (sortBy === 'dateSaved' ? [] : groupShowsByYear(sortedData)), [sortedData, sortBy]);

  const defaultYear = groupedShows[0]?.[0] || null;

  if (error) {
    return (
      <div className="rounded-2xl border border-dashed border-slate-800 p-8 text-center text-slate-400">
        {error}
      </div>
    );
  }

  if (sortedData.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-slate-800 p-8 text-center text-slate-400">
        No public fan photos from other users yet.
      </div>
    );
  }

  const renderShowCard = (show: MappedShow) => {
    const isBookmarked = bookmarkedSet.has(show.show_date as string);
    return (
      <Link key={show.show_date as string} href={`/library/show/${show.show_date as string}`} className="block rounded-2xl border border-slate-800 bg-slate-900/70 p-4 transition-all hover:border-cyan-500/40">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <p className="text-xs font-bold text-cyan-400">{getArtistName(show)} · {(show.show_date as string) || 'Unknown date'}</p>
              {isBookmarked ? (
                <span className="inline-flex items-center gap-1 rounded-full border border-emerald-500/40 bg-emerald-500/10 px-2 py-0.5 text-[10px] font-semibold text-emerald-300">
                  Bookmarked
                </span>
              ) : null}
            </div>
            <p className="mt-0.5 truncate text-base font-semibold text-white">{(show.venue_name as string) || 'Venue Unknown'}</p>
            {show.location ? <p className="truncate text-xs text-slate-400">{show.location as string}</p> : null}
          </div>
          <span className="shrink-0 rounded-full border border-cyan-500/40 bg-cyan-500/10 px-2.5 py-1 text-[11px] font-semibold text-cyan-200">
            +{show.new_public_photo_count as number} {(show.new_public_photo_count as number) === 1 ? 'photo' : 'photos'}
          </span>
        </div>
        <p className="mt-2 text-xs text-slate-400">Latest: {formatRecentFanPhotoTimestamp(show.latest_public_photo_at as string)}</p>
      </Link>
    );
  };

  if (sortBy === 'dateSaved') {
    return (
      <div className="space-y-4">
        <div className="flex items-center justify-end">
          {SortControlComponent}
        </div>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {sortedData.map((show) => renderShowCard(show))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-end">
        {SortControlComponent}
      </div>

      {groupedShows.map(([year, yearShows]) => (
        <details key={year} open={year === defaultYear} className="overflow-hidden rounded-2xl border border-slate-800 bg-slate-950/60">
          <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 text-left">
            <div>
              <p className="text-sm font-semibold text-white">{year}</p>
              <p className="text-xs text-slate-400">{yearShows.length} show{yearShows.length === 1 ? '' : 's'}</p>
            </div>
          </summary>
          <div className="grid grid-cols-1 gap-4 border-t border-slate-800 p-4 sm:grid-cols-2">
            {yearShows.map((show) => renderShowCard(show))}
          </div>
        </details>
      ))}
    </div>
  );
}
