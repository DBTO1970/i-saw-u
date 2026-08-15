'use client';

import { useMemo, useState } from 'react';
import PhotoLikeButton from './PhotoLikeButton';

export default function FanGalleryGrid({ photos = [], currentUserId = null }) {
  const [selectedPhoto, setSelectedPhoto] = useState(null);
  const [failedThumbs, setFailedThumbs] = useState(new Set());

  function handleThumbError(photoId) {
    setFailedThumbs((prev) => {
      const next = new Set(prev);
      next.add(photoId);
      return next;
    });
  }
  const visiblePhotos = useMemo(
    () => photos.filter((photo) => !currentUserId || photo.user_id !== currentUserId),
    [photos, currentUserId]
  );

  return (
    <>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
        {visiblePhotos.map((photo) => {
          return (
            <button
              key={photo.id}
              type="button"
              onClick={() => setSelectedPhoto(photo)}
              className="group relative overflow-hidden rounded-2xl border border-slate-800 bg-slate-900 text-left transition-all hover:border-cyan-500/50 hover:shadow-lg hover:shadow-cyan-900/20"
            >
              {photo.thumb_url || photo.url ? (
                <div className="relative aspect-square w-full overflow-hidden">
                  <img
                    src={(!failedThumbs.has(photo.id) && photo.thumb_url) ? photo.thumb_url : photo.url}
                    alt={photo.file_name || 'Fan photo'}
                    className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
                    loading="lazy"
                    decoding="async"
                    onError={!failedThumbs.has(photo.id) ? () => handleThumbError(photo.id) : undefined}
                  />
                </div>
              ) : (
                <div className="flex aspect-square w-full items-center justify-center bg-slate-800 text-xs text-slate-500">
                  Photo unavailable
                </div>
              )}
              {/* Like badge on thumbnail */}
              <div className="absolute bottom-1.5 right-1.5" onClick={(e) => e.stopPropagation()}>
                <PhotoLikeButton
                  photoId={photo.id}
                  initialLikeCount={photo.like_count ?? 0}
                  initialLikedByMe={photo.liked_by_me ?? false}
                  size="sm"
                />
              </div>
            </button>
          );
        })}
      </div>

      {selectedPhoto ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 p-4 backdrop-blur-sm"
          onClick={() => setSelectedPhoto(null)}
        >
          <div className="w-full max-w-5xl rounded-2xl border border-slate-700 bg-slate-950/95 shadow-2xl shadow-black/60">
            <div className="flex items-center justify-between gap-3 border-b border-slate-800 px-4 py-3">
              <p className="text-sm font-semibold text-white">Fan gallery</p>
              <div className="flex items-center gap-3" onClick={(e) => e.stopPropagation()}>
                <PhotoLikeButton
                  photoId={selectedPhoto.id}
                  initialLikeCount={selectedPhoto.like_count ?? 0}
                  initialLikedByMe={selectedPhoto.liked_by_me ?? false}
                  size="md"
                />
                <button
                  type="button"
                  onClick={() => setSelectedPhoto(null)}
                  className="rounded-lg border border-slate-700 bg-slate-900 px-3 py-1.5 text-xs font-semibold text-slate-300 hover:border-cyan-500/40 hover:text-white"
                >
                  Close
                </button>
              </div>
            </div>

            <div className="p-4" onClick={(event) => event.stopPropagation()}>
              {selectedPhoto.photo_url || selectedPhoto.url ? (
                <img
                  src={selectedPhoto.photo_url || selectedPhoto.url || ''}
                  alt={selectedPhoto.file_name || 'Fan photo'}
                  className="max-h-[80vh] w-full object-contain"
                  loading="eager"
                  decoding="async"
                />
              ) : (
                <div className="flex h-[60vh] w-full items-center justify-center rounded-2xl border border-dashed border-slate-700 bg-slate-900/80 text-sm text-slate-500">
                  Photo unavailable
                </div>
              )}
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
