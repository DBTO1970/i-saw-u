'use client';

import { useState } from 'react';
import { saveShowToLibrary, removeShowFromLibraryByDate } from '../app/actions/user-library';

export default function ShowBookmarkButton({ showDate, showData, initialIsBookmarked }) {
  const [isBookmarked, setIsBookmarked] = useState(!!initialIsBookmarked);
  const [isLoading, setIsLoading] = useState(false);
  const [status, setStatus] = useState(null);

  const handleToggle = async () => {
    if (!showDate) return;

    setIsLoading(true);
    setStatus(null);

    if (isBookmarked) {
      const res = await removeShowFromLibraryByDate(showDate);
      if (res.success) {
        setIsBookmarked(false);
        setStatus({ type: 'success', text: 'Bookmark removed.' });
      } else {
        setStatus({ type: 'error', text: res.error || 'Failed to remove bookmark.' });
      }
    } else {
      const venue = showData?.venueName || showData?.venue || null;
      const city = showData?.city || null;
      const state = showData?.state || null;
      const res = await saveShowToLibrary(
        showDate,
        {
          venue,
          city,
          state,
          location: [city, state].filter(Boolean).join(', ') || null,
          venueName: venue,
          phishNetUrl: showData?.phishNetUrl || null,
          showUrl: showData?.showUrl || null,
        },
        ''
      );
      if (res.success) {
        setIsBookmarked(true);
        setStatus({ type: 'success', text: 'Show bookmarked!' });
      } else {
        setStatus({ type: 'error', text: res.error || 'Failed to bookmark show.' });
      }
    }

    setIsLoading(false);
  };

  return (
    <div className="flex flex-col gap-2">
      <button
        type="button"
        onClick={handleToggle}
        disabled={isLoading}
        className={`inline-flex items-center gap-2 rounded-lg border px-4 py-2 text-xs font-semibold transition disabled:cursor-not-allowed disabled:opacity-60 ${
          isBookmarked
            ? 'border-cyan-500/50 bg-cyan-500/15 text-cyan-300 hover:border-red-500/50 hover:bg-red-500/10 hover:text-red-300'
            : 'border-slate-600 bg-slate-800/60 text-slate-200 hover:border-cyan-500/50 hover:bg-cyan-500/10 hover:text-cyan-200'
        }`}
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 24 24"
          strokeWidth={1.75}
          stroke="currentColor"
          fill={isBookmarked ? 'currentColor' : 'none'}
          className="h-4 w-4 shrink-0"
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M17.593 3.322c1.1.128 1.907 1.077 1.907 2.185V21L12 17.25 4.5 21V5.507c0-1.108.806-2.057 1.907-2.185a48.507 48.507 0 0111.186 0z" />
        </svg>
        {isLoading
          ? isBookmarked ? 'Removing…' : 'Saving…'
          : isBookmarked ? 'Bookmarked' : 'Bookmark Show'}
      </button>
      {status ? (
        <p className={`text-xs ${status.type === 'success' ? 'text-emerald-400' : 'text-red-400'}`}>
          {status.text}
        </p>
      ) : null}
    </div>
  );
}
