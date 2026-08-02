'use client';

import { useMemo } from 'react';
import Link from 'next/link';
import { groupShowsByYear } from '../lib/show-grouping';
import { useSortedList } from '../lib/useSortedList';

type BookmarkedShow = Record<string, unknown>;
type MappedShow = BookmarkedShow & { exifShowDate: string | null; dateSaved: string | null };

type BookmarkedShowsPanelProps = {
  shows: BookmarkedShow[];
  showsError?: string | null;
};

export default function BookmarkedShowsPanel({ shows, showsError }: BookmarkedShowsPanelProps) {
  const mappedShows = useMemo(
    (): MappedShow[] =>
      shows.map((show) => ({
        ...show,
        // Map show fields to the SortablePhoto interface expected by useSortedList
        exifShowDate: (show.show_date as string | null) ?? null,
        dateSaved: (show.created_at as string | null) ?? null,
      })),
    [shows],
  );

  const { sortedData, sortBy, SortControlComponent } = useSortedList(mappedShows, 'showDate');

  const groupedShows = useMemo(() => (sortBy === 'dateSaved' ? [] : groupShowsByYear(sortedData)), [sortedData, sortBy]);

  const defaultYear = groupedShows[0]?.[0] || null;

  if (showsError) {
    return (
      <div className="rounded-2xl border border-dashed border-slate-800 p-8 text-center text-slate-400">
        {showsError}
      </div>
    );
  }

  if (sortedData.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-slate-800 p-8 text-center text-slate-400">
        No bookmarked shows yet. Click &quot;Bookmark Show&quot; when viewing matching show entries.
      </div>
    );
  }

  const renderShowCard = (show: MappedShow) => {
    const showData = show.show_data as Record<string, unknown> | null;
    const phishNetUrl =
      showData?.phishNetUrl ||
      (show.show_date
        ? `https://phish.net/setlists/?d=${encodeURIComponent(show.show_date as string)}`
        : null);
    return (
      <div key={show.id as string} className="overflow-hidden rounded-2xl border border-slate-800 bg-slate-900/70 transition-all hover:border-cyan-500/40">
        <Link href={`/library/show/${show.show_date as string}`} className="block p-5">
          <div className="flex items-start justify-between gap-3">
            <div>
              <span className="text-xs font-bold text-cyan-400">{show.show_date as string}</span>
              <h3 className="mt-0.5 text-lg font-semibold text-white">{(show.venue_name as string) || 'Venue Unknown'}</h3>
              <p className="text-xs text-slate-400">{(show.location as string) || ''}</p>
            </div>
            <div className={`shrink-0 rounded-full border px-2.5 py-1 text-[11px] font-semibold ${(show.public_photo_count as number) > 0 ? 'border-cyan-500/40 bg-cyan-500/10 text-cyan-200' : 'border-slate-700 bg-slate-900 text-slate-400'}`}>
              📸 {show.public_photo_count as number} {(show.public_photo_count as number) === 1 ? 'photo' : 'photos'}
            </div>
          </div>
          {show.user_notes ? (
            <p className="mt-3 rounded-xl bg-slate-900/90 p-3 text-xs italic text-slate-300">
              &quot;{show.user_notes as string}&quot;
            </p>
          ) : null}
        </Link>
        {phishNetUrl ? (
          <div className="border-t border-slate-800 px-5 py-3">
            <a href={phishNetUrl as string} target="_blank" rel="noreferrer" className="text-xs font-medium text-cyan-400 underline hover:text-cyan-300">
              Open on phish.net ↗
            </a>
          </div>
        ) : null}
      </div>
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
