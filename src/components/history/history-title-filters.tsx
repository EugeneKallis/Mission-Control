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
      className="shrink-0 rounded-lg p-3"
      style={{ background: "#201F1F", border: "1px solid rgba(59, 75, 63, 0.3)" }}
    >
      <legend className="mb-2 text-xs font-semibold text-[#E5E2E1]">Filter by history title</legend>
      <div className="flex items-center justify-end gap-3 mb-2">
        <button
          type="button"
          onClick={() => onSelectedTitlesChange([])}
          disabled={selected.size === 0}
          className="text-xs font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-40"
          style={{ color: "#849587" }}
        >
          Clear all filters
        </button>
      </div>
      <div
        className="flex max-h-28 flex-wrap gap-2 overflow-y-auto pr-1"
        style={{ scrollbarWidth: "thin", scrollbarColor: "#3B4B3F transparent" }}
      >
        {filters.map(({ title, count }) => {
          const checked = selected.has(title);
          return (
            <label
              key={title}
              className="flex items-center gap-2 px-2.5 py-1.5 text-xs cursor-pointer select-none"
              style={{
                background: checked ? "rgba(97, 139, 107, 0.12)" : "#131313",
                border: `1px solid ${checked ? "rgba(97, 139, 107, 0.5)" : "rgba(59, 75, 63, 0.3)"}`,
                color: "#E5E2E1",
              }}
            >
              <input
                type="checkbox"
                checked={checked}
                onChange={() => toggleTitle(title)}
                className="accent-[#618B6B]"
              />
              <span>{title}</span>
              <span
                className="inline-flex min-w-5 justify-center px-1 rounded text-[10px] font-semibold"
                style={{ background: "rgba(132, 149, 135, 0.15)", color: "#849587" }}
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
