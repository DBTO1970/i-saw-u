'use client';

import { useMemo, useState } from 'react';
import SortDropdown from '../components/SortDropdown';
import { sortPhotos, type SortType, type SortablePhoto } from './sort-photos';

export type UseSortedListResult<T> = {
  sortedData: T[];
  sortBy: SortType;
  setSortBy: (sort: SortType) => void;
  SortControlComponent: React.ReactElement;
};

/**
 * Custom hook that sorts a data array by 'showDate' or 'dateSaved' and returns
 * a pre-wired sort control component alongside the sorted data.
 *
 * Items must expose `exifShowDate` (for 'showDate' sorting) and `dateSaved`
 * (for 'dateSaved' sorting).  Map your raw data to these fields before calling
 * the hook when the source uses different field names.
 */
export function useSortedList<T extends SortablePhoto>(
  data: T[],
  defaultSortField: SortType = 'showDate',
): UseSortedListResult<T> {
  const [sortBy, setSortBy] = useState<SortType>(defaultSortField);

  const sortedData = useMemo(
    () => sortPhotos(data, sortBy, 'desc'),
    [data, sortBy],
  );

  const SortControlComponent = (
    <SortDropdown currentSort={sortBy} onSortChange={setSortBy} />
  );

  return { sortedData, sortBy, setSortBy, SortControlComponent };
}
