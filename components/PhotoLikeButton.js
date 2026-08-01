'use client';

import { useState } from 'react';
import { togglePhotoLike } from '../app/actions/user-library';

export default function PhotoLikeButton({
  photoId,
  initialLikeCount = 0,
  initialLikedByMe = false,
  size = 'md',
}) {
  const [likeCount, setLikeCount] = useState(initialLikeCount);
  const [likedByMe, setLikedByMe] = useState(initialLikedByMe);
  const [isLoading, setIsLoading] = useState(false);

  const handleClick = async (event) => {
    event.stopPropagation();
    if (isLoading) return;

    // Optimistic update
    const wasLiked = likedByMe;
    setLikedByMe(!wasLiked);
    setLikeCount((c) => c + (wasLiked ? -1 : 1));
    setIsLoading(true);

    try {
      const res = await togglePhotoLike(photoId);
      if (res.success) {
        setLikedByMe(res.liked);
        setLikeCount(res.likeCount);
      } else {
        // Roll back on failure
        setLikedByMe(wasLiked);
        setLikeCount((c) => c + (wasLiked ? 1 : -1));
      }
    } catch {
      setLikedByMe(wasLiked);
      setLikeCount((c) => c + (wasLiked ? 1 : -1));
    } finally {
      setIsLoading(false);
    }
  };

  const isSm = size === 'sm';

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={isLoading}
      aria-label={likedByMe ? 'Unlike photo' : 'Like photo'}
      className={`inline-flex items-center gap-1 rounded-full border transition disabled:cursor-not-allowed ${
        isSm
          ? 'px-1.5 py-0.5 text-[10px]'
          : 'px-2.5 py-1 text-xs'
      } ${
        likedByMe
          ? 'border-rose-500/50 bg-rose-500/15 text-rose-300 hover:bg-rose-500/25'
          : 'border-slate-600 bg-slate-800/70 text-slate-400 hover:border-rose-500/40 hover:text-rose-300'
      }`}
    >
      <svg
        xmlns="http://www.w3.org/2000/svg"
        viewBox="0 0 24 24"
        strokeWidth={1.75}
        stroke="currentColor"
        fill={likedByMe ? 'currentColor' : 'none'}
        className={isSm ? 'h-3 w-3' : 'h-3.5 w-3.5'}
      >
        <path strokeLinecap="round" strokeLinejoin="round" d="M21 8.25c0-2.485-2.099-4.5-4.688-4.5-1.935 0-3.597 1.126-4.312 2.733-.715-1.607-2.377-2.733-4.313-2.733C5.1 3.75 3 5.765 3 8.25c0 7.22 9 12 9 12s9-4.78 9-12z" />
      </svg>
      <span className="tabular-nums font-semibold">{likeCount}</span>
    </button>
  );
}
