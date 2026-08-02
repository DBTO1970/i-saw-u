export type ShowItem = {
  show_date?: string | null;
  [key: string]: unknown;
};

/**
 * Groups an array of shows by the year portion of their `show_date`.
 * The within-year order is preserved from the input array so that a
 * caller can control ordering by pre-sorting before calling this function
 * (e.g. via `useSortedList`).
 *
 * Year groups are returned in descending order (most recent first), with
 * 'Unknown Year' placed last.
 */
export function groupShowsByYear<T extends ShowItem>(
  shows: T[],
): [string, T[]][] {
  const grouped = new Map<string, T[]>();

  (shows || []).forEach((show) => {
    const year = String(show?.show_date || '').slice(0, 4) || 'Unknown Year';
    if (!grouped.has(year)) grouped.set(year, []);
    grouped.get(year)!.push(show);
  });

  return Array.from(grouped.entries()).sort(([leftYear], [rightYear]) => {
    if (leftYear === 'Unknown Year') return 1;
    if (rightYear === 'Unknown Year') return -1;
    return Number(rightYear) - Number(leftYear);
  });
}
