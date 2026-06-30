/**
 * Unit tests for src/components/migrate/migrate-page.tsx
 *
 * Covers:
 *  - Path input updates state and Enter key submits
 *  - Debounced auto-preview fires after 600ms for path-like input
 *  - Non-path input does NOT auto-preview
 *  - Clicking Preview triggers immediate probe
 *  - Successful preview renders the table panel with counts
 *  - Successful preview auto-checks every present table
 *  - Preview failure renders the error banner
 *  - Clear button resets state
 *  - Toggling a checkbox updates selection state
 *  - Migrate button is disabled until a table is selected
 *  - Clicking Migrate opens the confirm dialog with the selected tables
 *  - Confirming the dialog POSTs to /api/migrate/run and renders the result
 *  - Network failure shows an error toast
 */
import React from "react";
import { describe, test, expect, beforeEach, afterEach, mock } from "bun:test";
import {
  render,
  screen,
  fireEvent,
  waitFor,
  act,
} from "@/test-utils/render";
import userEvent from "@testing-library/user-event";
import { ToastProvider } from "@/components/toast-provider";
import { MigratePage } from "./migrate-page";

// ── Helpers ──────────────────────────────────────────────────────────────

// ToastProvider gives useToast a real context. The component reads
// useToast().showToast; without a provider it gets the default noop
// from the context and we can't observe the toast.
function renderMigrate() {
  return render(
    <ToastProvider>
      <MigratePage />
    </ToastProvider>,
  );
}

const SOURCE_INFO = {
  dbPath: "/tmp/ServerTool/config.db",
  dbSizeBytes: 1024 * 64,
  isSqlite: true,
  present: {
    macroGroups: true,
    macros: true,
    scrapeResults: true,
    scrapedItems: false,
    scrapedItemFiles: true,
  },
  counts: {
    macroGroups: 5,
    macros: 12,
    scrapeResults: 30,
    scrapedItems: 0,
    scrapedItemFiles: 7,
  },
};

const MIGRATION_RESULT = {
  result: {
    macroGroups: { total: 5, inserted: 5, skipped: 0 },
    macros: { total: 12, inserted: 10, skipped: 2 },
    scrapeResults: { total: 30, inserted: 0, skipped: 30 },
    scrapedItems: { total: 0, inserted: 0, skipped: 0 },
    scrapedItemFiles: { total: 7, inserted: 7, skipped: 0 },
  },
};

const originalFetch = globalThis.fetch;
let fetchMock: ReturnType<typeof mock> | null = null;

function installFetch(responder: (url: string, init?: RequestInit) => Promise<Response> | Response) {
  fetchMock = mock(async (url: string, init?: RequestInit) => {
    const res = responder(url, init);
    return res instanceof Response ? res : await res;
  });
  globalThis.fetch = fetchMock as unknown as typeof fetch;
  return fetchMock;
}

afterEach(() => {
  globalThis.fetch = originalFetch;
  fetchMock = null;
});

// ── Tests ────────────────────────────────────────────────────────────────

describe("MigratePage", () => {
  test("renders the header and the path input", () => {
    renderMigrate();
    expect(screen.getByText("Migrate from ServerTool")).toBeInTheDocument();
    expect(screen.getByLabelText("Source database path")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /preview/i })).toBeInTheDocument();
  });

  test("does not auto-preview non-path input", async () => {
    installFetch(() => new Response("{}", { status: 200 }));
    renderMigrate();
    const input = screen.getByLabelText("Source database path");
    await userEvent.type(input, "abc");
    // Advance past the 600ms debounce — no request should fire
    // because "abc" doesn't contain "/" or end in ".db".
    await act(async () => {
      await new Promise((r) => setTimeout(r, 700));
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  test("auto-previews after 600ms debounce for path-like input", async () => {
    installFetch(() => new Response(JSON.stringify(SOURCE_INFO), { status: 200 }));
    renderMigrate();
    const input = screen.getByLabelText("Source database path");
    await userEvent.type(input, "/tmp/ServerTool/config.db");
    // Wait past the debounce window.
    await act(async () => {
      await new Promise((r) => setTimeout(r, 700));
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = (fetchMock as any).mock.calls[0];
    expect(url).toBe("/api/migrate/preview");
    expect(init.method).toBe("POST");
    const body = JSON.parse(init.body);
    expect(body.dbPath).toBe("/tmp/ServerTool/config.db");
  });

  test("Enter key in path input triggers immediate preview", async () => {
    installFetch(() => new Response(JSON.stringify(SOURCE_INFO), { status: 200 }));
    renderMigrate();
    const input = screen.getByLabelText("Source database path");
    await userEvent.type(input, "/tmp/x.db");
    await userEvent.keyboard("{Enter}");
    // No debounce wait needed
    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalled();
    });
  });

  test("Preview button triggers probe without waiting for debounce", async () => {
    installFetch(() => new Response(JSON.stringify(SOURCE_INFO), { status: 200 }));
    renderMigrate();
    const input = screen.getByLabelText("Source database path");
    // Type a value that does NOT look like a path (no debounce).
    await userEvent.type(input, "not-a-path");
    // Click the preview button.
    await userEvent.click(screen.getByRole("button", { name: /preview/i }));
    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledTimes(1);
    });
  });

  test("successful preview renders table labels and counts", async () => {
    installFetch(() => new Response(JSON.stringify(SOURCE_INFO), { status: 200 }));
    renderMigrate();
    const input = screen.getByLabelText("Source database path");
    await userEvent.type(input, "/tmp/x.db");
    await userEvent.click(screen.getByRole("button", { name: /preview/i }));
    // Wait for the preview panel to appear (dbPath is unique to the panel).
    await waitFor(() => {
      expect(screen.getAllByText(SOURCE_INFO.dbPath).length).toBeGreaterThan(0);
    });
    // Each present table label is shown (rendered in both the preview
    // panel and the table selector, so use getAllByText).
    expect(screen.getAllByText("Macro groups").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Macros").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Scrape results (current)").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Scraped item files").length).toBeGreaterThan(0);
    // Counts are shown (formatted with toLocaleString).
    expect(screen.getAllByText("5").length).toBeGreaterThan(0);
    expect(screen.getAllByText("12").length).toBeGreaterThan(0);
    expect(screen.getAllByText("30").length).toBeGreaterThan(0);
  });

  test("auto-checks every present table on successful preview", async () => {
    installFetch(() => new Response(JSON.stringify(SOURCE_INFO), { status: 200 }));
    renderMigrate();
    const input = screen.getByLabelText("Source database path");
    await userEvent.type(input, "/tmp/x.db");
    await userEvent.click(screen.getByRole("button", { name: /preview/i }));
    await waitFor(() => {
      expect(screen.getByText(SOURCE_INFO.dbPath)).toBeInTheDocument();
    });
    // Checkboxes: present tables should be checked, missing one not.
    const checkboxes = screen.getAllByRole("checkbox");
    // 5 tables total
    expect(checkboxes).toHaveLength(5);
    // present: macroGroups, macros, scrapeResults, scrapedItemFiles
    // not present: scrapedItems
    // Order: macroGroups, macros, scrapeResults, scrapedItems, scrapedItemFiles
    expect(checkboxes[0]).toBeChecked();
    expect(checkboxes[1]).toBeChecked();
    expect(checkboxes[2]).toBeChecked();
    expect(checkboxes[3]).not.toBeChecked();
    expect(checkboxes[4]).toBeChecked();
  });

  test("preview error renders the error banner with the API message", async () => {
    installFetch(() =>
      new Response(JSON.stringify({ error: "Not a SQLite database" }), { status: 400 }),
    );
    renderMigrate();
    const input = screen.getByLabelText("Source database path");
    await userEvent.type(input, "/tmp/x.db");
    await userEvent.click(screen.getByRole("button", { name: /preview/i }));
    await waitFor(() => {
      expect(screen.getByText("Not a SQLite database")).toBeInTheDocument();
    });
    // Preview panel should NOT render
    expect(screen.queryByText("Tables to migrate")).not.toBeInTheDocument();
  });

  test("preview error from thrown exception renders the error banner", async () => {
    installFetch(() => {
      throw new Error("network down");
    });
    renderMigrate();
    const input = screen.getByLabelText("Source database path");
    await userEvent.type(input, "/tmp/x.db");
    await userEvent.click(screen.getByRole("button", { name: /preview/i }));
    await waitFor(() => {
      expect(screen.getByText("network down")).toBeInTheDocument();
    });
  });

  test("Clear button resets state back to no-info", async () => {
    installFetch(() => new Response(JSON.stringify(SOURCE_INFO), { status: 200 }));
    renderMigrate();
    const input = screen.getByLabelText("Source database path");
    await userEvent.type(input, "/tmp/x.db");
    await userEvent.click(screen.getByRole("button", { name: /preview/i }));
    await waitFor(() => {
      expect(screen.getByText(SOURCE_INFO.dbPath)).toBeInTheDocument();
    });
    // The X icon button has title "Use a different file"
    const clearBtn = screen.getByTitle("Use a different file");
    await userEvent.click(clearBtn);
    await waitFor(() => {
      expect(screen.queryByText(SOURCE_INFO.dbPath)).not.toBeInTheDocument();
      expect(screen.queryByText("Tables to migrate")).not.toBeInTheDocument();
    });
  });

  test("toggling a checkbox updates the selection", async () => {
    installFetch(() => new Response(JSON.stringify(SOURCE_INFO), { status: 200 }));
    renderMigrate();
    const input = screen.getByLabelText("Source database path");
    await userEvent.type(input, "/tmp/x.db");
    await userEvent.click(screen.getByRole("button", { name: /preview/i }));
    await waitFor(() => screen.getAllByRole("checkbox"));
    const checkboxes = screen.getAllByRole("checkbox");
    // First is macroGroups, currently checked.
    await userEvent.click(checkboxes[0]);
    expect(checkboxes[0]).not.toBeChecked();
    await userEvent.click(checkboxes[0]);
    expect(checkboxes[0]).toBeChecked();
  });

  test("Migrate button is disabled when nothing is selected", async () => {
    // Source with NO present tables — nothing can be selected.
    const emptyInfo = {
      ...SOURCE_INFO,
      present: {
        macroGroups: false,
        macros: false,
        scrapeResults: false,
        scrapedItems: false,
        scrapedItemFiles: false,
      },
      counts: {
        macroGroups: 0,
        macros: 0,
        scrapeResults: 0,
        scrapedItems: 0,
        scrapedItemFiles: 0,
      },
    };
    installFetch(() => new Response(JSON.stringify(emptyInfo), { status: 200 }));
    renderMigrate();
    const input = screen.getByLabelText("Source database path");
    await userEvent.type(input, "/tmp/x.db");
    await userEvent.click(screen.getByRole("button", { name: /preview/i }));
    // The component shows the "None of the expected tables" message
    // when ALL tables are missing.
    await waitFor(() => {
      expect(
        screen.getByText(/None of the expected tables were found/),
      ).toBeInTheDocument();
    });
    // The table selector is also still rendered (so the user can see
    // everything is unchecked). The Migrate button is disabled because
    // nothing can be selected (every checkbox is disabled).
    const migrateBtn = screen.getByRole("button", { name: /migrate to mission control/i });
    expect(migrateBtn).toBeDisabled();
  });

  test("clicking Migrate opens the confirm dialog listing the selected tables", async () => {
    installFetch(() => new Response(JSON.stringify(SOURCE_INFO), { status: 200 }));
    renderMigrate();
    const input = screen.getByLabelText("Source database path");
    await userEvent.type(input, "/tmp/x.db");
    await userEvent.click(screen.getByRole("button", { name: /preview/i }));
    await waitFor(() => screen.getByText("Tables to migrate"));
    // The "Migrate to Mission Control" button
    const migrateBtn = screen.getByRole("button", { name: /migrate to mission control/i });
    await userEvent.click(migrateBtn);
    // Confirm dialog title
    await waitFor(() => {
      expect(screen.getByText("Confirm migration")).toBeInTheDocument();
    });
    // The source path should appear in the dialog (as well as in the
    // preview panel). Verify it shows up at least twice.
    expect(screen.getAllByText(SOURCE_INFO.dbPath).length).toBeGreaterThanOrEqual(2);
  });

  test("confirming the dialog posts to /api/migrate/run and renders the result", async () => {
    // First call is preview, second is run.
    let callIndex = 0;
    installFetch((url) => {
      if (url === "/api/migrate/preview") {
        return new Response(JSON.stringify(SOURCE_INFO), { status: 200 });
      }
      if (url === "/api/migrate/run") {
        callIndex++;
        return new Response(JSON.stringify(MIGRATION_RESULT), { status: 200 });
      }
      return new Response("{}", { status: 404 });
    });
    renderMigrate();
    const input = screen.getByLabelText("Source database path");
    await userEvent.type(input, "/tmp/x.db");
    await userEvent.click(screen.getByRole("button", { name: /preview/i }));
    await waitFor(() => screen.getByText("Tables to migrate"));
    await userEvent.click(screen.getByRole("button", { name: /migrate to mission control/i }));
    await waitFor(() => screen.getByText("Confirm migration"));
    // Click the dialog confirm
    await userEvent.click(screen.getByRole("button", { name: /run migration/i }));
    await waitFor(() => {
      expect(callIndex).toBe(1);
    });
    // Result panel shows a summary
    await waitFor(() => {
      expect(screen.getByText(/Copied 22 rows/)).toBeInTheDocument();
    });
  });

  test("migration run failure shows an error toast", async () => {
    installFetch((url) => {
      if (url === "/api/migrate/preview") {
        return new Response(JSON.stringify(SOURCE_INFO), { status: 200 });
      }
      if (url === "/api/migrate/run") {
        return new Response(JSON.stringify({ error: "Disk full" }), { status: 500 });
      }
      return new Response("{}", { status: 404 });
    });
    renderMigrate();
    const input = screen.getByLabelText("Source database path");
    await userEvent.type(input, "/tmp/x.db");
    await userEvent.click(screen.getByRole("button", { name: /preview/i }));
    await waitFor(() => screen.getByText("Tables to migrate"));
    await userEvent.click(screen.getByRole("button", { name: /migrate to mission control/i }));
    await waitFor(() => screen.getByText("Confirm migration"));
    await userEvent.click(screen.getByRole("button", { name: /run migration/i }));
    await waitFor(() => {
      expect(screen.getByText("Disk full")).toBeInTheDocument();
    });
  });

  test("migration network error shows a fallback toast", async () => {
    installFetch((url) => {
      if (url === "/api/migrate/preview") {
        return new Response(JSON.stringify(SOURCE_INFO), { status: 200 });
      }
      if (url === "/api/migrate/run") {
        throw new Error("connection lost");
      }
      return new Response("{}", { status: 404 });
    });
    renderMigrate();
    const input = screen.getByLabelText("Source database path");
    await userEvent.type(input, "/tmp/x.db");
    await userEvent.click(screen.getByRole("button", { name: /preview/i }));
    await waitFor(() => screen.getByText("Tables to migrate"));
    await userEvent.click(screen.getByRole("button", { name: /migrate to mission control/i }));
    await waitFor(() => screen.getByText("Confirm migration"));
    await userEvent.click(screen.getByRole("button", { name: /run migration/i }));
    await waitFor(() => {
      expect(screen.getByText("connection lost")).toBeInTheDocument();
    });
  });
});

// Re-export fireEvent so the import is not flagged as unused by eslint
// (some configurations complain about unused imports).
void fireEvent;
