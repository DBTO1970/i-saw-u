'use client';

import { useEffect, useMemo, useState } from 'react';
import PhotoLikeButton from './PhotoLikeButton';
import { deriveCurrentSongLabelFromShowMetadata } from '../lib/photo-show-context';

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
  const resolvedFromMetadata = deriveCurrentSongLabelFromShowMetadata(showMetadata, rawExif);
  const candidates = [
    resolvedFromMetadata,
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

export default function ShowSetlistPhotos({ setGroups = [], photos = [] }) {
  const [expandedSongKey, setExpandedSongKey] = useState(null);
  const [selectedPhoto, setSelectedPhoto] = useState(null);
  const [selectedPhotoSongKey, setSelectedPhotoSongKey] = useState(null);

  function getFirstNonEmptyString(values = []) {
    for (const value of values) {
      if (typeof value === 'string' && value.trim()) {
        return value.trim();
      }
    }
    return '';
  }

  function parseDateToTimestamp(value) {
    if (typeof value !== 'string') {
      return null;
    }

    const trimmedValue = value.trim();
    if (!trimmedValue) {
      return null;
    }

    const exifDateTimeMatch = trimmedValue.match(/^(\d{4}):(\d{2}):(\d{2})(?:[ T](\d{2}):(\d{2})(?::(\d{2}))?)?$/);
    if (exifDateTimeMatch) {
      const normalizedValue = `${exifDateTimeMatch[1]}-${exifDateTimeMatch[2]}-${exifDateTimeMatch[3]}T${exifDateTimeMatch[4] || '00'}:${exifDateTimeMatch[5] || '00'}:${exifDateTimeMatch[6] || '00'}`;
      const parsedNormalized = new Date(normalizedValue);
      return Number.isNaN(parsedNormalized.getTime()) ? null : parsedNormalized.getTime();
    }

    const parsedValue = new Date(trimmedValue);
    return Number.isNaN(parsedValue.getTime()) ? null : parsedValue.getTime();
  }

  function getPhotoTimestampValue(photo) {
    const rawExif = getRawExif(photo);
    const showMetadata = rawExif?.showMetadata && typeof rawExif.showMetadata === 'object' ? rawExif.showMetadata : {};

    const dateValue = getFirstNonEmptyString([
      photo?.date_taken,
      showMetadata?.dateTimeOriginal,
      rawExif?.dateTimeOriginal,
    ]);
    const timeValue = getFirstNonEmptyString([
      photo?.time_taken,
      showMetadata?.timeTaken,
      rawExif?.timeTaken,
    ]);

    if (dateValue && timeValue) {
      const parsedCombined = parseDateToTimestamp(`${dateValue}T${timeValue}`);
      if (parsedCombined !== null) {
        return parsedCombined;
      }
    }

    const parsedDateValue = parseDateToTimestamp(dateValue);
    if (parsedDateValue !== null) {
      return parsedDateValue;
    }

    const createdAtValue = parseDateToTimestamp(photo?.created_at || '');
    return createdAtValue;
  }

  const songEntries = useMemo(() => {
    return (setGroups || []).flatMap((group, groupIndex) =>
      (group.songs || []).map((song, songIndex) => ({
        ...song,
        groupLabel: group.label || `Set ${groupIndex + 1}`,
        groupKey: `${group.label || 'Set'}-${groupIndex}`,
        groupIndex,
        songIndex,
        key: `${group.label || 'Set'}-${groupIndex}-${songIndex}-${song.label || ''}`,
      }))
    );
  }, [setGroups]);

  const songPhotoMap = useMemo(() => {
    return songEntries.map((songEntry) => {
      const matchedPhotos = (photos || []).filter((photo) => matchesSong(photo, songEntry.label));
      const sortedMatchedPhotos = [...matchedPhotos].sort((a, b) => {
        const timestampA = getPhotoTimestampValue(a);
        const timestampB = getPhotoTimestampValue(b);

        if (timestampA === null && timestampB === null) {
          return String(a?.id || '').localeCompare(String(b?.id || ''));
        }
        if (timestampA === null) {
          return 1;
        }
        if (timestampB === null) {
          return -1;
        }
        if (timestampA !== timestampB) {
          return timestampA - timestampB;
        }
        return String(a?.id || '').localeCompare(String(b?.id || ''));
      });

      return {
        ...songEntry,
        photos: sortedMatchedPhotos,
        count: sortedMatchedPhotos.length,
      };
    });
  }, [songEntries, photos]);

  useEffect(() => {
    if (songPhotoMap.length === 0) {
      setExpandedSongKey(null);
      return;
    }

    const hasValidSelection = songPhotoMap.some((song) => song.key === expandedSongKey);
    if (hasValidSelection) {
      return;
    }

    const firstSongWithPhotos = songPhotoMap.find((song) => song.count > 0);
    setExpandedSongKey((firstSongWithPhotos || songPhotoMap[0]).key);
  }, [songPhotoMap, expandedSongKey]);

  const groupedSongPhotoMap = useMemo(() => {
    return songPhotoMap.reduce((accumulator, songEntry) => {
      const existingGroup = accumulator.find((group) => group.groupKey === songEntry.groupKey);
      if (existingGroup) {
        existingGroup.songs.push(songEntry);
        return accumulator;
      }

      accumulator.push({
        groupKey: songEntry.groupKey,
        groupLabel: songEntry.groupLabel,
        groupIndex: songEntry.groupIndex,
        songs: [songEntry],
      });
      return accumulator;
    }, []);
  }, [songPhotoMap]);

  const activeSongEntry = useMemo(() => {
    if (selectedPhotoSongKey) {
      return songPhotoMap.find((song) => song.key === selectedPhotoSongKey) || null;
    }
    if (expandedSongKey) {
      return songPhotoMap.find((song) => song.key === expandedSongKey) || null;
    }
    return null;
  }, [songPhotoMap, selectedPhotoSongKey, expandedSongKey]);

  return (
    <>
      <div className="space-y-6">
        {groupedSongPhotoMap.map((group) => (
          <div key={group.groupKey} className="rounded-2xl border border-cyan-500/25 bg-gradient-to-b from-slate-900/95 via-slate-950/85 to-slate-950/75 p-3 shadow-xl shadow-cyan-950/30 md:p-4">
            <h3 className="mb-3 px-1 text-xs font-bold uppercase tracking-widest text-cyan-400">
              {group.groupLabel}
            </h3>

            <div className="space-y-3">
              {group.songs.map((songEntry) => {
                const isExpanded = expandedSongKey === songEntry.key;

                return (
                  <div key={songEntry.key} className="overflow-hidden rounded-xl border border-slate-800 bg-slate-900/60">
                    <button
                      type="button"
                      onClick={() => setExpandedSongKey(isExpanded ? null : songEntry.key)}
                      className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left transition hover:bg-slate-800/60"
                    >
                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold text-white">{songEntry.label}</p>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="rounded-full border border-cyan-500/30 bg-cyan-500/10 px-2.5 py-1 text-[11px] font-semibold text-cyan-200">
                          📷 {songEntry.count}
                        </span>
                        <span className={`text-xs text-slate-400 transition-transform ${isExpanded ? 'rotate-180' : ''}`}>
                          ▼
                        </span>
                      </div>
                    </button>

                    {isExpanded ? (
                      <div className="border-t border-slate-800 p-3 md:p-4">
                        {songEntry.count === 0 ? (
                          <div className="rounded-2xl border border-dashed border-slate-800 p-8 text-center text-sm text-slate-400">
                            No photos for this song yet.
                          </div>
                        ) : (
                          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                            {songEntry.photos.map((photo) => (
                              <button
                                key={photo.id}
                                type="button"
                                onClick={() => {
                                  setSelectedPhoto(photo);
                                  setSelectedPhotoSongKey(songEntry.key);
                                }}
                                className="group relative overflow-hidden rounded-2xl border border-slate-800 bg-slate-900/70 text-left transition hover:border-cyan-500/40"
                              >
                                {photo.thumb_url || photo.url ? (
                                  <div className="relative aspect-[4/3] w-full overflow-hidden bg-slate-900">
                                    <img
                                      src={photo.thumb_url || photo.url}
                                      alt={photo.file_name || 'Fan photo'}
                                      className="h-full w-full object-cover"
                                      loading="lazy"
                                      decoding="async"
                                    />
                                  </div>
                                ) : (
                                  <div className="flex aspect-[4/3] w-full items-center justify-center bg-slate-800 text-sm text-slate-500">
                                    Photo unavailable
                                  </div>
                                )}
                                <div className="flex items-center justify-between gap-2 p-3">
                                  <p className="truncate text-[11px] text-slate-400">{formatPhotoTimestamp(photo)}</p>
                                  <div onClick={(e) => e.stopPropagation()}>
                                    <PhotoLikeButton
                                      photoId={photo.id}
                                      initialLikeCount={photo.like_count ?? 0}
                                      initialLikedByMe={photo.liked_by_me ?? false}
                                      size="sm"
                                    />
                                  </div>
                                </div>
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                    ) : null}
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>

      {selectedPhoto ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 p-4 backdrop-blur-sm"
          onClick={() => {
            setSelectedPhoto(null);
            setSelectedPhotoSongKey(null);
          }}
        >
          <div className="w-full max-w-6xl rounded-2xl border border-slate-700 bg-slate-950/95 shadow-2xl shadow-black/60" onClick={(event) => event.stopPropagation()}>
            <div className="flex items-center justify-between gap-3 border-b border-slate-800 px-4 py-3">
              <div>
                <p className="text-sm font-semibold text-white">{activeSongEntry?.label || 'Photo preview'}</p>
                <p className="text-xs text-slate-400">{activeSongEntry?.groupLabel || 'Setlist'}</p>
              </div>
              <div className="flex items-center gap-3">
                <PhotoLikeButton
                  photoId={selectedPhoto.id}
                  initialLikeCount={selectedPhoto.like_count ?? 0}
                  initialLikedByMe={selectedPhoto.liked_by_me ?? false}
                  size="md"
                />
                <button
                  type="button"
                  onClick={() => {
                    setSelectedPhoto(null);
                    setSelectedPhotoSongKey(null);
                  }}
                  className="rounded-lg border border-slate-700 bg-slate-900 px-3 py-1.5 text-xs font-semibold text-slate-300 hover:border-cyan-500/40 hover:text-white"
                >
                  Close
                </button>
              </div>
            </div>

            <div className="max-h-[80vh] overflow-y-auto p-4">
              {selectedPhoto.photo_url || selectedPhoto.url ? (
                <img
                  src={selectedPhoto.photo_url || selectedPhoto.url}
                  alt={selectedPhoto.file_name || 'Fan photo'}
                  className="mx-auto h-auto w-full object-contain"
                  loading="eager"
                  decoding="async"
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
