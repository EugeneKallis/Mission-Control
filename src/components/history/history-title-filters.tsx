export interface HistoryTitleFilter {
  title: string;
  count: number;
}

interface HistoryTitleFiltersProps {
  filters: HistoryTitleFilter[];
  selectedTitles: string[];
  onSelectedTitlesChange: (titles: string[]) => void;
}

export function HistoryTitleFilters({
  filters,
  selectedTitles,
  onSelectedTitlesChange,
}: HistoryTitleFiltersProps) {
  const selected = new Set(selectedTitles);

  const toggleTitle = (title: string) => {
    const next = new Set(selected);
    if (next.has(title)) {
      next.delete(title);
    } else {
      next.add(title);
    }
    onSelectedTitlesChange([...next]);
  };

  return (
    <fieldset
      className="shrink-0 rounded-[var(--radius-card)] p-3 bg-surface-container border border-outline-variant/30"
    >
      <legend className="mb-2 text-xs font-semibold text-on-surface">Filter by history title</legend>
      <div className="flex items-center justify-end gap-3 mb-2">
        <button
          type="button"
          onClick={() => onSelectedTitlesChange([])}
          disabled={selected.size === 0}
          className="text-xs font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-40 text-on-surface-variant hover:text-on-surface"
        >
          Clear all filters
        </button>
      </div>
      <div
        className="flex max-h-28 flex-wrap gap-2 overflow-y-auto pr-1"
      >
        {filters.map(({ title, count }) => {
          const checked = selected.has(title);
          return (
            <label
              key={title}
              className={`flex items-center gap-2 px-2.5 py-1.5 text-xs cursor-pointer select-none rounded-[var(--radius-button)] transition-colors ${
                checked
                  ? "bg-primary/15 border border-primary/40"
                  : "bg-surface-container-high/50 border border-outline-variant/30"
              }`}
            >
              <input
                type="checkbox"
                checked={checked}
                onChange={() => toggleTitle(title)}
                className="accent-primary"
              />
              <span className="text-on-surface">{title}</span>
              <span
                className="inline-flex min-w-5 justify-center px-1 rounded text-[10px] font-semibold bg-on-surface-variant/15 text-on-surface-variant"
                aria-label={`${count} history ${count === 1 ? "entry" : "entries"}`}
              >
                {count}
              </span>
            </label>
          );
        })}
      </div>
    </fieldset>
  );
}
