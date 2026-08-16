import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";
import { cleanup, fireEvent, render, screen, waitFor } from "@/test-utils/render";
import { LocalArrsPage } from "./local-arrs-page";

const originalFetch = globalThis.fetch;
const sonarrLibrary = {
  instance: "sonarrlocal",
  label: "Sonarr Local",
  itemLabel: "shows",
  totalItems: 2,
  totalSize: 3_000,
  items: [
    { id: 1, title: "Large Show", sizeOnDisk: 3_000, fileCount: 10, href: "http://sonarr/series/large-show" },
    { id: 2, title: "Empty Show", sizeOnDisk: 0, fileCount: 0, href: "http://sonarr/series/empty-show" },
  ],
};
const sortableLibrary = {
  instance: "sonarrlocal",
  label: "Sonarr Local",
  itemLabel: "shows",
  totalItems: 3,
  totalSize: 6000,
  items: [
    { id: 1, title: "C Show", sizeOnDisk: 3000, fileCount: 30, href: "http://sonarr/series/c" },
    { id: 2, title: "B Show", sizeOnDisk: 2000, fileCount: 20, href: "http://sonarr/series/b" },
    { id: 3, title: "A Show", sizeOnDisk: 1000, fileCount: 10, href: "http://sonarr/series/a" },
  ],
};
const radarrLibrary = {
  instance: "radarrlocal",
  label: "Radarr Local",
  itemLabel: "movies",
  totalItems: 1,
  totalSize: 500,
  items: [
    { id: 3, title: "Local Movie", sizeOnDisk: 500, fileCount: 1, href: "http://radarr/movie/local-movie" },
  ],
};

function mockFetch(bodyForUrl: (url: string) => { status?: number; body: unknown }) {
  globalThis.fetch = mock(async (input: string | URL | Request) => {
    const result = bodyForUrl(String(input));
    return new Response(JSON.stringify(result.body), { status: result.status ?? 200 });
  }) as unknown as typeof fetch;
}

beforeEach(() => {
  localStorage.clear();
});

afterEach(() => {
  globalThis.fetch = originalFetch;
  cleanup();
  localStorage.clear();
});

describe("LocalArrsPage", () => {
  test("loads Sonarr Local by default, hides empty shows, and keeps whole-library totals", async () => {
    mockFetch(() => ({ body: sonarrLibrary }));
    render(<LocalArrsPage />);

    await waitFor(() => expect(screen.getByText("Large Show")).toBeInTheDocument());
    expect(screen.queryByText("Empty Show")).not.toBeInTheDocument();
    expect(screen.getAllByText("2.9 KB", { exact: true }).length).toBeGreaterThan(0);
    expect(screen.getByRole("link", { name: "Open Large Show in Sonarr Local" })).toHaveAttribute(
      "href",
      "http://sonarr/series/large-show",
    );
  });

  test("shows empty items when checked and persists the preference", async () => {
    mockFetch(() => ({ body: sonarrLibrary }));
    render(<LocalArrsPage />);
    await waitFor(() => expect(screen.getByText("Large Show")).toBeInTheDocument());

    fireEvent.click(screen.getByRole("checkbox", { name: "Show Empty Shows" }));
    expect(screen.getByText("Empty Show")).toBeInTheDocument();
    expect(JSON.parse(localStorage.getItem("mission-control:local-arrs:v1") ?? "{}")).toMatchObject({ showEmpty: true });
  });

  test("switches between Sonarr Local and Radarr Local", async () => {
    mockFetch((url) => ({ body: url.includes("radarrlocal") ? radarrLibrary : sonarrLibrary }));
    render(<LocalArrsPage />);
    await waitFor(() => expect(screen.getByText("Large Show")).toBeInTheDocument());

    fireEvent.change(screen.getByRole("combobox", { name: "Local Arr instance" }), { target: { value: "radarrlocal" } });
    await waitFor(() => expect(screen.getByText("Local Movie")).toBeInTheDocument());
    expect(screen.getByRole("link", { name: "Open Local Movie in Radarr Local" })).toHaveAttribute(
      "href",
      "http://radarr/movie/local-movie",
    );
    expect(JSON.parse(localStorage.getItem("mission-control:local-arrs:v1") ?? "{}")).toMatchObject({ instance: "radarrlocal" });
  });

  test("toggles sort by name ascending then descending", async () => {
    mockFetch(() => ({ body: sortableLibrary }));
    render(<LocalArrsPage />);
    await waitFor(() => expect(screen.getByText("C Show")).toBeInTheDocument());

    const titleColumn = () =>
      screen.getAllByRole("row").slice(1).map((row) => (row as HTMLTableRowElement).cells[0]?.textContent ?? "");

    // Default sort is size desc → C (3 KB), B (2 KB), A (1 KB).
    expect(titleColumn()).toEqual(["C Show", "B Show", "A Show"]);

    fireEvent.click(screen.getByRole("button", { name: "Sort by name" }));
    expect(titleColumn()).toEqual(["A Show", "B Show", "C Show"]);

    fireEvent.click(screen.getByRole("button", { name: "Sort by name" }));
    expect(titleColumn()).toEqual(["C Show", "B Show", "A Show"]);
  });

  test("filters rows by the search box", async () => {
    mockFetch(() => ({ body: sortableLibrary }));
    render(<LocalArrsPage />);
    await waitFor(() => expect(screen.getByText("C Show")).toBeInTheDocument());

    fireEvent.change(screen.getByPlaceholderText("Filter shows…"), { target: { value: "B" } });
    expect(screen.getByText("B Show")).toBeInTheDocument();
    expect(screen.queryByText("A Show")).not.toBeInTheDocument();
    expect(screen.queryByText("C Show")).not.toBeInTheDocument();
  });
  test("renders a full-page error and retries from the error state", async () => {
    let attempts = 0;
    mockFetch(() => {
      attempts++;
      return attempts === 1
        ? { status: 502, body: { error: "Failed to load Sonarr Local" } }
        : { body: sonarrLibrary };
    });
    render(<LocalArrsPage />);

    await waitFor(() => {
      expect(screen.getAllByRole("heading").some((heading) => heading.textContent?.includes("Unable to load Sonarr Local"))).toBe(true);
    });
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    await waitFor(() => expect(screen.getByText("Large Show")).toBeInTheDocument());
    expect(attempts).toBe(2);
  });

  test("Sonarr rows expose three action buttons; Radarr rows expose none", async () => {
    globalThis.fetch = mock(async (input: string | URL | Request) => {
      const url = String(input);
      const body = url.includes("instance=radarrlocal") ? radarrLibrary : sonarrLibrary;
      return new Response(JSON.stringify(body), { status: 200 });
    }) as unknown as typeof fetch;

    render(<LocalArrsPage />);
    await waitFor(() => expect(screen.getByText("Large Show")).toBeInTheDocument());

    expect(screen.getByRole("button", { name: /Delete all files on disk for Large Show/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Delete series and files for Large Show/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Large Show monitoring to future episodes/ })).toBeInTheDocument();

    // Switch to Radarr — action buttons vanish.
    fireEvent.change(screen.getByRole("combobox", { name: "Local Arr instance" }), { target: { value: "radarrlocal" } });
    await waitFor(() => expect(screen.getByText("Local Movie")).toBeInTheDocument());
    expect(screen.queryByRole("button", { name: /Delete all files/ })).not.toBeInTheDocument();
  });

  test("Delete Files flows through a confirm dialog then optimistically zeroes the row", async () => {
    const calls: string[] = [];
    globalThis.fetch = mock(async (input: string | URL | Request) => {
      const url = String(input);
      calls.push(url);
      if (url.includes("/api/local-arrs/library")) {
        return new Response(JSON.stringify(sonarrLibrary), { status: 200 });
      }
      return new Response(JSON.stringify({ seriesId: 1, deleted: 10 }), { status: 200 });
    }) as unknown as typeof fetch;

    render(<LocalArrsPage />);
    await waitFor(() => expect(screen.getByText("Large Show")).toBeInTheDocument());

    // Button opens a confirm dialog.
    fireEvent.click(screen.getByRole("button", { name: /Delete all files on disk for Large Show/ }));
    await waitFor(() => expect(screen.getByRole("heading", { name: "Delete episode files?" })).toBeInTheDocument());

    // Confirming fires the POST. Optimistic update zeroes the row, which — with
    // Show Empty Shows off (default) — removes it from view. The network call
    // still fired, proving the action took effect.
    fireEvent.click(screen.getByRole("button", { name: "Delete files" }));
    await waitFor(() => expect(calls.some((u) => u.includes("/series/1/delete-files"))).toBe(true));
    await waitFor(() => expect(screen.queryByText("Large Show")).not.toBeInTheDocument());
  });




});
