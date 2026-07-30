'use client';

import { useEffect, useMemo, useState } from 'react';

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

export default function ShowSetlistPhotos({ setGroups = [], photos = [], currentUserId = null }) {
  const [selectedSongKey, setSelectedSongKey] = useState(null);
  const [selectedPhoto, setSelectedPhoto] = useState(null);

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

  useEffect(() => {
    if (songPhotoMap.length === 0) {
      setSelectedSongKey(null);
      return;
    }

    const hasValidSelection = songPhotoMap.some((song) => song.key === selectedSongKey);
    if (hasValidSelection) {
      return;
    }

    const firstSongWithPhotos = songPhotoMap.find((song) => song.count > 0);
    setSelectedSongKey((firstSongWithPhotos || songPhotoMap[0]).key);
  }, [songPhotoMap, selectedSongKey]);

  const activeSongEntry = useMemo(() => {
    if (!selectedSongKey) {
      return null;
    }
    return songPhotoMap.find((song) => song.key === selectedSongKey) || null;
  }, [selectedSongKey, songPhotoMap]);

  const activeSongPhotos = useMemo(() => {
    const selectedSongPhotos = activeSongEntry?.photos || [];
    const myPhotos = (photos || []).filter((photo) => {
      if (!currentUserId) {
        return false;
      }
      return photo?.user_id === currentUserId || photo?.isMine === true;
    });

    if (myPhotos.length === 0) {
      return selectedSongPhotos;
    }

    const merged = [...selectedSongPhotos];
    const seen = new Set(selectedSongPhotos.map((photo) => photo.id));
    myPhotos.forEach((photo) => {
      if (!seen.has(photo.id)) {
        merged.push(photo);
        seen.add(photo.id);
      }
    });

    return merged;
  }, [activeSongEntry, photos, currentUserId]);

  return (
    <>
      <div className="overflow-hidden rounded-2xl border border-cyan-500/25 bg-gradient-to-b from-slate-900/95 via-slate-950/85 to-slate-950/75 shadow-xl shadow-cyan-950/30">
        <div className="flex items-start justify-between gap-3 border-b border-slate-800 px-4 py-3 md:px-5">
          <div>
            <p className="text-xs font-bold uppercase tracking-widest text-cyan-400">Photos</p>
            <p className="text-sm font-semibold text-white">
              {activeSongEntry?.label || 'Select a song'}
            </p>
            <p className="text-xs text-slate-400">{activeSongEntry?.groupLabel || 'Setlist'}</p>
          </div>
          <span className="rounded-full border border-cyan-500/30 bg-cyan-500/10 px-2.5 py-1 text-[11px] font-semibold text-cyan-200">
            {activeSongPhotos.length} {activeSongPhotos.length === 1 ? 'photo' : 'photos'}
          </span>
        </div>

        <div className="p-3 md:p-5">
          {activeSongPhotos.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-slate-800 p-8 text-center text-sm text-slate-400">
              No photos for this song yet.
            </div>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {activeSongPhotos.map((photo) => {
                return (
                  <button
                    key={photo.id}
                    type="button"
                    onClick={() => setSelectedPhoto(photo)}
                    className="overflow-hidden rounded-2xl border border-slate-800 bg-slate-900/70 text-left transition hover:border-cyan-500/40"
                  >
                    {photo.url ? (
                      <img src={photo.url} alt={photo.file_name || 'Fan photo'} className="h-auto w-full object-contain" />
                    ) : (
                      <div className="flex aspect-[4/3] w-full items-center justify-center bg-slate-800 text-sm text-slate-500">
                        Photo unavailable
                      </div>
                    )}
                    <div className="p-3">
                      <p className="truncate text-[11px] text-slate-400">{formatPhotoTimestamp(photo)}</p>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </div>

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
                  onClick={() => setSelectedSongKey(songEntry.key)}
                  className={`text-left text-sm font-semibold transition hover:text-cyan-300 ${
                    selectedSongKey === songEntry.key ? 'text-cyan-300' : 'text-white'
                  }`}
                >
                  {songEntry.label}
                </button>
              </div>
              {songEntry.count > 0 ? (
                <button
                  type="button"
                  onClick={() => setSelectedSongKey(songEntry.key)}
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

      {selectedPhoto ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 p-4 backdrop-blur-sm"
          onClick={() => setSelectedPhoto(null)}
        >
          <div className="w-full max-w-6xl rounded-2xl border border-slate-700 bg-slate-950/95 shadow-2xl shadow-black/60" onClick={(event) => event.stopPropagation()}>
            <div className="flex items-center justify-between gap-3 border-b border-slate-800 px-4 py-3">
              <div>
                <p className="text-sm font-semibold text-white">{activeSongEntry?.label || 'Photo preview'}</p>
                <p className="text-xs text-slate-400">{activeSongEntry?.groupLabel || 'Setlist'}</p>
              </div>
              <button
                type="button"
                onClick={() => setSelectedPhoto(null)}
                className="rounded-lg border border-slate-700 bg-slate-900 px-3 py-1.5 text-xs font-semibold text-slate-300 hover:border-cyan-500/40 hover:text-white"
              >
                Close
              </button>
            </div>

            <div className="max-h-[80vh] overflow-y-auto p-4">
              {selectedPhoto.url ? (
                <img
                  src={selectedPhoto.url}
                  alt={selectedPhoto.file_name || 'Fan photo'}
                  className="mx-auto h-auto w-full object-contain"
                />
              ) : (
                <div className="flex aspect-[4/3] w-full items-center justify-center rounded-2xl border border-dashed border-slate-800 bg-slate-900/80 text-sm text-slate-400">
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
