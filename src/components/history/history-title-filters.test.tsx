import { describe, expect, test } from "bun:test";
import { useState } from "react";
import { render, screen, userEvent } from "@/test-utils/render";
import { HistoryTitleFilters } from "./history-title-filters";

const filters = [
  { title: "Sync Library", count: 2 },
  { title: "Refresh Plex", count: 1 },
];

function TestFilters() {
  const [selectedTitles, setSelectedTitles] = useState<string[]>([]);
  return (
    <HistoryTitleFilters
      filters={filters}
      selectedTitles={selectedTitles}
      onSelectedTitlesChange={setSelectedTitles}
    />
  );
}

describe("HistoryTitleFilters", () => {
  test("renders a checkbox and history count for every macro title", () => {
    render(<TestFilters />);

    expect(screen.getByRole("group", { name: /filter by history title/i })).toBeInTheDocument();
    expect(screen.getByRole("checkbox", { name: /sync library/i })).toBeInTheDocument();
    expect(screen.getByRole("checkbox", { name: /refresh plex/i })).toBeInTheDocument();
    expect(screen.getByLabelText("2 history entries")).toHaveTextContent("2");
    expect(screen.getByLabelText("1 history entry")).toHaveTextContent("1");
  });

  test("selects multiple macro titles", async () => {
    const user = userEvent.setup();
    render(<TestFilters />);

    const sync = screen.getByRole("checkbox", { name: /sync library/i });
    const plex = screen.getByRole("checkbox", { name: /refresh plex/i });
    await user.click(sync);
    await user.click(plex);

    expect(sync).toBeChecked();
    expect(plex).toBeChecked();
  });

  test("clears every selected macro title", async () => {
    const user = userEvent.setup();
    render(<TestFilters />);

    const sync = screen.getByRole("checkbox", { name: /sync library/i });
    const plex = screen.getByRole("checkbox", { name: /refresh plex/i });
    await user.click(sync);
    await user.click(plex);
    await user.click(screen.getByRole("button", { name: /clear all filters/i }));

    expect(sync).not.toBeChecked();
    expect(plex).not.toBeChecked();
  });
});
