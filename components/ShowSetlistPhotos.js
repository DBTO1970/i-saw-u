'use client';

import { useMemo, useState } from 'react';

function normalizeSongLabel(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function getRawExif(photo) {
  if (!photo?.raw_exif) {
    return {};
  }

  if (typeof photo.raw_exif === 'string') {
    try {
      return JSON.parse(photo.raw_exif) || {};
    } catch {
      return {};
    }
  }

  if (typeof photo.raw_exif === 'object' && !Array.isArray(photo.raw_exif)) {
    return photo.raw_exif;
  }

  return {};
}

function getPhotoSongTitle(photo) {
  const rawExif = getRawExif(photo);
  const showMetadata = rawExif?.showMetadata && typeof rawExif.showMetadata === 'object' ? rawExif.showMetadata : {};
  const candidates = [
    showMetadata.currentSong,
    showMetadata.songTitle,
    showMetadata.song_title,
    rawExif.currentSong,
    rawExif.songTitle,
    rawExif.song_title,
    rawExif.song,
    photo?.currentSong,
    photo?.songTitle,
    photo?.song_title,
  ];

  for (const candidate of candidates) {
    if (typeof candidate === 'string' && candidate.trim()) {
      return candidate.trim();
    }
  }

  return '';
}

function matchesSong(photo, songLabel) {
  const photoSongTitle = getPhotoSongTitle(photo);
  if (!photoSongTitle || !songLabel) {
    return false;
  }

  const normalizedSongLabel = normalizeSongLabel(songLabel);
  const normalizedPhotoSongTitle = normalizeSongLabel(photoSongTitle);

  if (!normalizedSongLabel || !normalizedPhotoSongTitle) {
    return false;
  }

  return (
    normalizedSongLabel === normalizedPhotoSongTitle ||
    normalizedSongLabel.includes(normalizedPhotoSongTitle) ||
    normalizedPhotoSongTitle.includes(normalizedSongLabel)
  );
}

function formatPhotoTimestamp(photo) {
  const rawExif = getRawExif(photo);
  const showMetadata = rawExif?.showMetadata && typeof rawExif.showMetadata === 'object' ? rawExif.showMetadata : {};
  const dateValue = photo?.date_taken || showMetadata.dateTimeOriginal || rawExif.dateTimeOriginal || '';
  const timeValue = photo?.time_taken || showMetadata.timeTaken || rawExif.timeTaken || '';

  if (dateValue && timeValue) {
    return `${dateValue} • ${timeValue}`;
  }

  if (dateValue) {
    return dateValue;
  }

  if (timeValue) {
    return timeValue;
  }

  return 'Timestamp unavailable';
}

function getOwnerLabel(photo, currentUserId) {
  if (photo?.user_id === currentUserId || photo?.isMine) {
    return 'You';
  }

  return photo?.creator?.display_name || photo?.creator?.username || 'Fan';
}

function getOwnerInitials(name) {
  const trimmedName = String(name || '').trim();
  if (!trimmedName) {
    return 'Y';
  }

  const parts = trimmedName.split(/\s+/).filter(Boolean);
  if (parts.length === 0) {
    return 'Y';
  }

  if (parts.length === 1) {
    return parts[0].slice(0, 2).toUpperCase();
  }

  return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
}

export default function ShowSetlistPhotos({ setGroups = [], photos = [], currentUserId = null }) {
  const [selectedSong, setSelectedSong] = useState(null);

  const songEntries = useMemo(() => {
    return (setGroups || []).flatMap((group, groupIndex) =>
      (group.songs || []).map((song, songIndex) => ({
        ...song,
        groupLabel: group.label || `Set ${groupIndex + 1}`,
        key: `${group.label || 'Set'}-${groupIndex}-${songIndex}-${song.label || ''}`,
      }))
    );
  }, [setGroups]);

  const songPhotoMap = useMemo(() => {
    return songEntries.map((songEntry) => {
      const matchedPhotos = (photos || []).filter((photo) => matchesSong(photo, songEntry.label));
      return {
        ...songEntry,
        photos: matchedPhotos,
        count: matchedPhotos.length,
      };
    });
  }, [songEntries, photos]);

  const activeSongPhotos = useMemo(() => {
    if (!selectedSong) {
      return [];
    }

    return songPhotoMap.find((song) => song.key === selectedSong.key)?.photos || [];
  }, [selectedSong, songPhotoMap]);

  return (
    <>
      <div className="space-y-5">
        {songPhotoMap.map((songEntry) => (
          <div key={songEntry.key} className="rounded-xl border border-slate-800 bg-slate-900/60 p-4">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <h3 className="mb-2 text-xs font-bold uppercase tracking-widest text-cyan-400">
                  {songEntry.groupLabel}
                </h3>
                <button
                  type="button"
                  onClick={() => setSelectedSong(songEntry)}
                  className="text-left text-sm font-semibold text-white transition hover:text-cyan-300"
                >
                  {songEntry.label}
                </button>
              </div>
              {songEntry.count > 0 ? (
                <button
                  type="button"
                  onClick={() => setSelectedSong(songEntry)}
                  className="rounded-full border border-cyan-500/30 bg-cyan-500/10 px-2.5 py-1 text-[11px] font-semibold text-cyan-200 transition hover:border-cyan-400 hover:bg-cyan-500/20"
                >
                  📷 {songEntry.count}
                </button>
              ) : null}
            </div>
            {songEntry.notes ? <p className="mt-2 text-sm italic text-slate-400">{songEntry.notes}</p> : null}
          </div>
        ))}
      </div>

      {selectedSong ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 p-4 backdrop-blur-sm" onClick={() => setSelectedSong(null)}>
          <div className="w-full max-w-6xl rounded-2xl border border-slate-700 bg-slate-950/95 shadow-2xl shadow-black/60" onClick={(event) => event.stopPropagation()}>
            <div className="flex items-center justify-between gap-3 border-b border-slate-800 px-4 py-3">
              <div>
                <p className="text-sm font-semibold text-white">{selectedSong.label}</p>
                <p className="text-xs text-slate-400">{selectedSong.groupLabel}</p>
              </div>
              <button
                type="button"
                onClick={() => setSelectedSong(null)}
                className="rounded-lg border border-slate-700 bg-slate-900 px-3 py-1.5 text-xs font-semibold text-slate-300 hover:border-cyan-500/40 hover:text-white"
              >
                Close
              </button>
            </div>

            <div className="max-h-[80vh] overflow-y-auto p-4">
              {activeSongPhotos.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-slate-800 p-8 text-center text-sm text-slate-400">
                  No photos for this song yet.
                </div>
              ) : (
                <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                  {activeSongPhotos.map((photo) => {
                    const ownerName = getOwnerLabel(photo, currentUserId);
                    const ownerInitials = getOwnerInitials(ownerName);

                    return (
                      <div key={photo.id} className="overflow-hidden rounded-2xl border border-slate-800 bg-slate-900/70">
                        {photo.url ? (
                          <img src={photo.url} alt={photo.file_name || ownerName} className="w-full object-contain" />
                        ) : (
                          <div className="flex aspect-[4/3] w-full items-center justify-center bg-slate-800 text-sm text-slate-500">
                            Photo unavailable
                          </div>
                        )}
                        <div className="space-y-2 p-3">
                          <div className="flex items-center gap-2">
                            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-white/10 bg-slate-800 text-[11px] font-semibold text-white">
                              {photo.creator?.avatar_url ? (
                                <img src={photo.creator.avatar_url} alt={ownerName} className="h-full w-full rounded-full object-cover" />
                              ) : (
                                ownerInitials
                              )}
                            </div>
                            <div className="min-w-0">
                              <p className="truncate text-sm font-semibold text-white">{ownerName}</p>
                              <p className="truncate text-[11px] text-slate-400">{formatPhotoTimestamp(photo)}</p>
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
