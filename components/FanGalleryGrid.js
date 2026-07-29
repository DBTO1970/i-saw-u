'use client';

import { useMemo, useState } from 'react';

function getDisplayName(creator) {
  return creator?.display_name || creator?.username || 'Anonymous fan';
}

function getInitials(creator) {
  const name = getDisplayName(creator);
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join('') || 'F';
}

function getRawExifObject(rawExif) {
  if (!rawExif || typeof rawExif !== 'object' || Array.isArray(rawExif)) {
    return {};
  }
  return rawExif;
}

export default function FanGalleryGrid({ photos = [], currentUserId = null }) {
  const [selectedPhoto, setSelectedPhoto] = useState(null);
  const selectedExif = useMemo(
    () => getRawExifObject(selectedPhoto?.raw_exif),
    [selectedPhoto]
  );

  return (
    <>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
        {photos.map((photo) => {
          const creator = photo.creator || null;
          const displayName = getDisplayName(creator);
          const initials = getInitials(creator);
          const isMine = photo.isMine || (currentUserId && photo.user_id === currentUserId);
          const stats = creator?.stats || {};

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

              <div className="absolute inset-x-0 top-0 bg-gradient-to-b from-black/70 via-black/20 to-transparent p-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2">
                    {creator?.avatar_url ? (
                      <img
                        src={creator.avatar_url}
                        alt={displayName}
                        className="h-9 w-9 rounded-full border border-white/20 object-cover shadow"
                      />
                    ) : (
                      <div className="flex h-9 w-9 items-center justify-center rounded-full border border-white/20 bg-cyan-600 text-xs font-bold text-white shadow">
                        {initials}
                      </div>
                    )}
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-white">{displayName}</p>
                      <p className="truncate text-[11px] text-slate-300">
                        {stats.total_shows_attended ? `${stats.total_shows_attended} shows saved` : 'Fan photo'}
                      </p>
                    </div>
                  </div>
                  {isMine ? (
                    <span className="rounded-full border border-cyan-400/40 bg-cyan-500/15 px-2 py-1 text-[10px] font-bold uppercase tracking-wider text-cyan-200">
                      You
                    </span>
                  ) : null}
                </div>
              </div>

              <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/70 via-black/30 to-transparent p-3">
                <div className="flex flex-wrap gap-1.5">
                  {stats.total_public_photos ? (
                    <span className="rounded-full border border-white/10 bg-black/40 px-2 py-1 text-[10px] font-semibold text-white">
                      {stats.total_public_photos} public photos
                    </span>
                  ) : null}
                  {photo.matched_show_date ? (
                    <span className="rounded-full border border-white/10 bg-black/40 px-2 py-1 text-[10px] font-semibold text-white">
                      {photo.matched_show_date}
                    </span>
                  ) : null}
                </div>
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
          <div className="w-full max-w-6xl rounded-2xl border border-slate-700 bg-slate-950/95 shadow-2xl shadow-black/60">
            <div className="flex items-center justify-between gap-3 border-b border-slate-800 px-4 py-3">
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-white">{getDisplayName(selectedPhoto.creator)}</p>
                <p className="truncate text-xs text-slate-400">
                  {selectedPhoto.date_taken || 'Unknown date'}{selectedPhoto.time_taken ? ` • ${selectedPhoto.time_taken}` : ''}
                </p>
              </div>
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
              <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-slate-300">
                <span className="rounded-full border border-slate-700 bg-slate-900 px-2 py-1">
                  Photo time: {selectedPhoto.time_taken || 'Unknown'}
                </span>
                {selectedExif?.showMetadata?.currentSong ? (
                  <span className="rounded-full border border-slate-700 bg-slate-900 px-2 py-1">
                    Current song: {selectedExif.showMetadata.currentSong}
                  </span>
                ) : null}
                {selectedPhoto.isMine ? (
                  <span className="rounded-full border border-cyan-500/40 bg-cyan-500/15 px-2 py-1 text-cyan-200">
                    Your photo
                  </span>
                ) : null}
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
