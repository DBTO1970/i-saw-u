'use client';

import { useMemo } from 'react';
import Link from 'next/link';
import LibraryPhotoDeleteButton from './LibraryPhotoDeleteButton';
import PhotoVisibilityToggle from './PhotoVisibilityToggle';
import { groupPhotosByYearAndShow } from '../lib/photo-grouping';
import { deriveCurrentSongLabelFromShowMetadata, normalizeTimeContextLabel } from '../lib/photo-show-context';
import { useSortedList } from '../lib/useSortedList';

type SavedPhoto = Record<string, unknown>;
type MappedPhoto = SavedPhoto & {
  exifShowDate: string | null;
  dateSaved: string | null;
  currentSong: string | null;
  timeContextLabel: string | null;
};

type SavedPhotosPanelProps = {
  photos: SavedPhoto[];
  photosError?: string | null;
};

export default function SavedPhotosPanel({ photos, photosError }: SavedPhotosPanelProps) {
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
          dateSaved: (photo.created_at as string | null) ?? null,
          currentSong,
          timeContextLabel,
        };
      }),
    [photos],
  );

  const { sortedData, sortBy, SortControlComponent } = useSortedList(mappedPhotos, 'showDate');

  const groupedSavedPhotos = useMemo(
    () => (sortBy === 'dateSaved' ? [] : groupPhotosByYearAndShow(sortedData)),
    [sortedData, sortBy],
  );

  const defaultSavedPhotosYear = groupedSavedPhotos[0]?.year || null;

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
        No saved photos yet. Upload a photo on the home page and click &quot;Save to Library&quot;.
      </div>
    );
  }

  const renderPhotoCard = (photo: Record<string, unknown>) => (
    <div key={photo.id as string} className="group relative overflow-hidden rounded-2xl border border-slate-800 bg-slate-950/60 p-4 transition-all hover:border-cyan-500/40">
      <Link href={`/library/photo/${photo.id as string}`} className="block">
        {photo.thumb_url || photo.url ? (
          <div className="relative mb-3 aspect-video w-full overflow-hidden rounded-xl bg-slate-900">
            <img
              src={(photo.thumb_url as string) || (photo.url as string)}
              alt={photo.file_name as string}
              className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
              loading="lazy"
              decoding="async"
            />
          </div>
        ) : (
          <div className="mb-3 flex aspect-video w-full items-center justify-center rounded-xl bg-slate-900 text-xs text-slate-500">
            Photo unavailable
          </div>
        )}
        <div className="space-y-1 text-xs text-slate-300">
          <p className="truncate font-semibold text-white">{photo.file_name as string}</p>
          <p className="truncate text-slate-400">Current song: {(photo.currentSong as string) || 'Unknown'}</p>
          {photo.timeContextLabel ? <p className="truncate text-slate-500">Context: {photo.timeContextLabel as string}</p> : null}
        </div>
      </Link>
      <div className="mt-3 flex flex-wrap items-center justify-between gap-3 border-t border-slate-800 pt-3">
        <PhotoVisibilityToggle photoId={photo.id as string} initialIsPublic={!!photo.is_public} />
        <LibraryPhotoDeleteButton
          photoId={photo.id as string}
          storagePath={photo.storage_path as string}
          label="Delete photo"
          className="rounded-lg border border-red-500/50 bg-red-500/10 px-3 py-1.5 text-xs font-semibold text-red-200 transition hover:bg-red-500/20 disabled:opacity-60"
        />
      </div>
    </div>
  );

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

      {groupedSavedPhotos.map((yearGroup: { year: string; groups: { key: string; showDate: string | null; label: string; venueName: string | null; location: string | null; photos: Record<string, unknown>[] }[] }) => (
        <details key={yearGroup.year} open={yearGroup.year === defaultSavedPhotosYear} className="overflow-hidden rounded-2xl border border-slate-800 bg-slate-950/60">
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
