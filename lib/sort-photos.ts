export type SortType = 'showDate' | 'dateSaved';
export type SortDirection = 'asc' | 'desc';

export type SortablePhoto = {
  exifShowDate?: string | number | null;
  dateSaved?: string | number | null;
  [key: string]: unknown;
};

function toTimestamp(value: string | number | null | undefined): number {
  if (value == null) {
    return 0;
  }
  const ts = typeof value === 'number' ? value : Date.parse(value);
  return Number.isNaN(ts) ? 0 : ts;
}

export function sortPhotos<T extends SortablePhoto>(
  photos: T[],
  sortType: SortType,
  direction: SortDirection = 'desc',
): T[] {
  const multiplier = direction === 'asc' ? 1 : -1;

  return [...photos].sort((a, b) => {
    const aVal = toTimestamp(sortType === 'showDate' ? a.exifShowDate : a.dateSaved);
    const bVal = toTimestamp(sortType === 'showDate' ? b.exifShowDate : b.dateSaved);
    return multiplier * (aVal - bVal);
  });
}
