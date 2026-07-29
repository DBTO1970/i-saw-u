'use client';

import { useState } from 'react';

export default function FanGalleryGrid({ photos = [], currentUserId = null }) {
  const [selectedPhoto, setSelectedPhoto] = useState(null);
  const visiblePhotos = photos.filter((photo) => !currentUserId || photo.user_id !== currentUserId);

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
              {photo.url ? (
                <div className="relative aspect-square w-full overflow-hidden">
                  <img
                    src={photo.url}
                    alt={photo.file_name || 'Fan photo'}
                    className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
                  />
                </div>
              ) : (
                <div className="flex aspect-square w-full items-center justify-center bg-slate-800 text-xs text-slate-500">
                  Photo unavailable
                </div>
              )}

            </button>
          );
        })}
      </div>

      {selectedPhoto ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 p-4 backdrop-blur-sm"
          onClick={() => setSelectedPhoto(null)}
        >
          <div className="w-full max-w-6xl rounded-2xl border border-slate-700 bg-slate-950/95 shadow-2xl shadow-black/60">
            <div className="flex items-center justify-between gap-3 border-b border-slate-800 px-4 py-3">
              <button
                type="button"
                onClick={() => setSelectedPhoto(null)}
                className="rounded-lg border border-slate-700 bg-slate-900 px-3 py-1.5 text-xs font-semibold text-slate-300 hover:border-cyan-500/40 hover:text-white"
              >
                Close
              </button>
            </div>

            <div className="p-4" onClick={(event) => event.stopPropagation()}>
              <img
                src={selectedPhoto.url || ''}
                alt={selectedPhoto.file_name || 'Fan photo'}
                className="max-h-[80vh] w-full object-contain"
              />
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
