'use client';

import { useMemo } from 'react';
import Link from 'next/link';
import PhotoLikeButton from './PhotoLikeButton';
import { groupPhotosByYearAndShow } from '../lib/photo-grouping';
import { deriveCurrentSongLabelFromShowMetadata, normalizeTimeContextLabel } from '../lib/photo-show-context';
import { useSortedList } from '../lib/useSortedList';

type FavoritePhoto = Record<string, unknown>;
type MappedPhoto = FavoritePhoto & {
  exifShowDate: string | null;
  dateSaved: string | null;
  currentSong: string | null;
  timeContextLabel: string | null;
};

type FavoritesPanelProps = {
  photos: FavoritePhoto[];
  photosError?: string | null;
};

export default function FavoritesPanel({ photos, photosError }: FavoritesPanelProps) {
  const mappedPhotos = useMemo(
    (): MappedPhoto[] =>
      photos.map((photo) => {
        const rawExifValue = photo.raw_exif;
        const rawExif =
          typeof rawExifValue === 'string'
            ? (() => {
                try {
                  const parsed = JSON.parse(rawExifValue);
                  return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
                } catch {
                  return {};
                }
              })()
            : rawExifValue && typeof rawExifValue === 'object' && !Array.isArray(rawExifValue)
              ? rawExifValue
              : {};
        const showMetadata =
          rawExif.showMetadata && typeof rawExif.showMetadata === 'object' && !Array.isArray(rawExif.showMetadata)
            ? rawExif.showMetadata
            : null;
        const currentSong = deriveCurrentSongLabelFromShowMetadata(showMetadata, rawExif) || null;
        const timeContextLabel =
          normalizeTimeContextLabel(
            (showMetadata?.timeContextLabel as string | undefined) || (rawExif.timeContextLabel as string | undefined) || '',
          ) || null;

        return {
          ...photo,
          exifShowDate: (photo.matched_show_date as string | null) ?? null,
          dateSaved: (photo.liked_at as string | null) ?? null,
          currentSong,
          timeContextLabel,
        };
      }),
    [photos],
  );

  const { sortedData, sortBy, SortControlComponent } = useSortedList(mappedPhotos, 'dateSaved');

  const groupedFavoritePhotos = useMemo(
    () => (sortBy === 'dateSaved' ? [] : groupPhotosByYearAndShow(sortedData)),
    [sortedData, sortBy],
  );

  const defaultFavoritesYear = groupedFavoritePhotos[0]?.year || null;

  if (photosError) {
    return (
      <div className="rounded-2xl border border-dashed border-slate-800 p-8 text-center text-slate-400">
        {photosError}
      </div>
    );
  }

  if (sortedData.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-slate-800 p-8 text-center text-slate-400">
        No liked photos yet.
      </div>
    );
  }

  const renderPhotoCard = (photo: Record<string, unknown>) => {
    const creator = photo.creator as Record<string, unknown> | null;
    const creatorName = (creator?.display_name as string) || (creator?.username as string) || 'Anonymous';
    return (
      <div key={photo.id as string} className="overflow-hidden rounded-2xl border border-slate-800 bg-slate-950/60 transition-all hover:border-rose-500/30">
        {photo.url ? (
          <div className="relative aspect-square w-full overflow-hidden bg-slate-900">
            <img src={photo.url as string} alt={(photo.file_name as string) || 'Fan photo'} className="h-full w-full object-cover" />
          </div>
        ) : (
          <div className="flex aspect-square w-full items-center justify-center bg-slate-900 text-xs text-slate-500">
            Photo unavailable
          </div>
        )}
        <div className="space-y-2 p-4">
          <p className="truncate text-xs font-medium text-cyan-300">
            🎵 {(photo.currentSong as string) || 'Unknown'}
          </p>
          {photo.timeContextLabel ? (
            <p className="truncate text-[11px] text-slate-500">Context: {photo.timeContextLabel as string}</p>
          ) : null}
          <div className="flex items-center justify-between gap-3">
            <p className="truncate text-xs text-slate-400">By {creatorName}</p>
            <PhotoLikeButton
              photoId={photo.id as string}
              initialLikeCount={photo.like_count as number}
              initialLikedByMe={true}
              size="sm"
            />
          </div>
        </div>
      </div>
    );
  };

  if (sortBy === 'dateSaved') {
    return (
      <div className="space-y-4">
        <div className="flex items-center justify-end">
          {SortControlComponent}
        </div>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {sortedData.map((photo) => renderPhotoCard(photo as Record<string, unknown>))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-end">
        {SortControlComponent}
      </div>

      {groupedFavoritePhotos.map((yearGroup: { year: string; groups: { key: string; showDate: string | null; label: string; venueName: string | null; location: string | null; photos: Record<string, unknown>[] }[] }) => (
        <details key={yearGroup.year} open={yearGroup.year === defaultFavoritesYear} className="overflow-hidden rounded-2xl border border-slate-800 bg-slate-950/60">
          <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 text-left">
            <div>
              <p className="text-sm font-semibold text-white">{yearGroup.year}</p>
              <p className="text-xs text-slate-400">{yearGroup.groups.length} grouping{yearGroup.groups.length === 1 ? '' : 's'}</p>
            </div>
          </summary>
          <div className="space-y-4 border-t border-slate-800 p-4">
            {yearGroup.groups.map((group) => (
              <div key={`${yearGroup.year}-${group.key}`} className="rounded-2xl border border-slate-800 bg-slate-900/70 p-4">
                <div className="mb-3 flex items-center justify-between gap-2">
                  <div>
                    <p className="text-sm font-semibold text-white">{group.label}</p>
                    {group.showDate ? (
                      <p className="text-xs text-slate-400">
                        {group.venueName || 'Unknown venue'}
                        {group.location ? ` • ${group.location}` : ''}
                      </p>
                    ) : (
                      <p className="text-xs text-slate-400">Photos not matched to a show date</p>
                    )}
                  </div>
                  {group.showDate ? (
                    <Link href={`/library/show/${group.showDate}`} className="text-xs font-medium text-cyan-400 underline hover:text-cyan-300">
                      Open show →
                    </Link>
                  ) : null}
                </div>
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  {group.photos.map((photo: Record<string, unknown>) => renderPhotoCard(photo))}
                </div>
              </div>
            ))}
          </div>
        </details>
      ))}
    </div>
  );
}
