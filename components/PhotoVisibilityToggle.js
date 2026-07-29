'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { togglePhotoVisibility } from '../app/actions/user-library';

export default function PhotoVisibilityToggle({ photoId, initialIsPublic = false, className = '' }) {
  const router = useRouter();
  const [isPublic, setIsPublic] = useState(initialIsPublic);
  const [isUpdating, setIsUpdating] = useState(false);
  const [error, setError] = useState(null);

  const handleToggle = async () => {
    if (!photoId || isUpdating) {
      return;
    }

    const nextValue = !isPublic;
    setIsUpdating(true);
    setError(null);

    const response = await togglePhotoVisibility(photoId, nextValue);
    if (!response?.success) {
      setError(response?.error || 'Failed to update visibility.');
      setIsUpdating(false);
      return;
    }

    setIsPublic(nextValue);
    setIsUpdating(false);
    router.refresh();
  };

  return (
    <div className={className}>
      <button
        type="button"
        role="switch"
        aria-checked={isPublic}
        disabled={isUpdating}
        onClick={handleToggle}
        className={`inline-flex items-center gap-2 rounded-full border px-2.5 py-1.5 text-xs font-semibold transition disabled:opacity-60 ${
          isPublic
            ? 'border-emerald-500/40 bg-emerald-500/15 text-emerald-200 hover:border-emerald-400 hover:bg-emerald-500/20'
            : 'border-slate-700 bg-slate-900 text-slate-300 hover:border-cyan-500/40 hover:text-cyan-200'
        }`}
      >
        <span
          className={`relative inline-flex h-4 w-8 items-center rounded-full border transition ${
            isPublic ? 'border-emerald-400/40 bg-emerald-400/20' : 'border-slate-600 bg-slate-800'
          }`}
        >
          <span
            className={`inline-block h-3 w-3 rounded-full bg-white transition ${
              isPublic ? 'translate-x-4' : 'translate-x-0.5'
            }`}
          />
        </span>
        <span>{isUpdating ? 'Updating…' : isPublic ? 'Public' : 'Private'}</span>
      </button>

      {error ? <p className="mt-1 text-[11px] text-red-300">{error}</p> : null}
    </div>
  );
}
