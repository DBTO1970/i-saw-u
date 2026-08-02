'use client';

type SortOption = 'showDate' | 'dateSaved';

type SortDropdownProps = {
  currentSort: SortOption;
  onSortChange: (sort: SortOption) => void;
  className?: string;
};

const SORT_OPTIONS: { value: SortOption; label: string }[] = [
  { value: 'showDate', label: 'Sort by Show Date' },
  { value: 'dateSaved', label: 'Sort by Date Saved' },
];

export default function SortDropdown({ currentSort, onSortChange, className = '' }: SortDropdownProps) {
  return (
    <div className={className}>
      <select
        value={currentSort}
        onChange={(e) => onSortChange(e.target.value as SortOption)}
        className="rounded-lg border border-slate-700 bg-slate-900 px-3 py-1.5 text-sm font-medium text-slate-200 transition hover:border-cyan-500/50 hover:text-cyan-200 focus:border-cyan-500 focus:outline-none focus:ring-1 focus:ring-cyan-500/40"
        aria-label="Sort order"
      >
        {SORT_OPTIONS.map(({ value, label }) => (
          <option key={value} value={value} className="bg-slate-900 text-slate-200">
            {label}
          </option>
        ))}
      </select>
    </div>
  );
}
