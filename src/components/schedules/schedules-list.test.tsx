/**
 * Unit tests for src/components/schedules/schedules-list.tsx
 *
 * Covers:
 *  - empty state + populated state rendering
 *  - row count + enabled count in the header subtitle
 *  - toggle switch optimistically updates + calls POST /api/schedules/:id/toggle
 *  - toggle switch reverts on fetch error
 *  - delete opens confirm dialog, then DELETE /api/schedules/:id removes the row
 *  - "Add Schedule" button opens the form
 *  - "Add Schedule" button is disabled when there are no macros
 *  - edit link points to /schedules/:id/edit
 */

import {
  describe,
  test,
  expect,
  mock,
  beforeEach,
  afterEach,
  type Mock,
} from "bun:test";
import { render, screen, fireEvent, waitFor, cleanup, within } from "@/test-utils/render";
import { ToastProvider } from "@/components/toast-provider";
import type { MacroOption, ScheduleRow } from "./schedules-list";
import { SchedulesList } from "./schedules-list";

// ── Module mocks (must be at the top, before component import) ──────────

mock.module("next/navigation", () => ({
  useRouter: () => ({
    refresh: () => {},
    push: () => {},
    back: () => {},
    forward: () => {},
    replace: () => {},
    prefetch: () => {},
  }),
  usePathname: () => "/schedules",
  useSearchParams: () => new URLSearchParams(),
}));

// Replace next/link with a plain anchor so we don't need the Next runtime.
mock.module("next/link", () => ({
  default: ({
    children,
    href,
    ...rest
  }: {
    children: React.ReactNode;
    href: string;
  } & React.AnchorHTMLAttributes<HTMLAnchorElement>) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

// ── Test data ──────────────────────────────────────────────────────────

const macros: MacroOption[] = [
  { id: 1, name: "Sync Library", groupName: "Admin" },
  { id: 2, name: "Refresh Plex", groupName: "Media" },
];

const baseSchedule = (over: Partial<ScheduleRow> = {}): ScheduleRow => ({
  id: 1,
  macroId: 1,
  macroName: "Sync Library",
  cronExpression: "*/15 * * * *",
  enabled: true,
  createdAt: "2026-01-15T10:00:00.000Z",
  ...over,
});

// ── Fetch mock plumbing ────────────────────────────────────────────────

const originalFetch = globalThis.fetch;
let fetchMock: Mock<typeof fetch>;

beforeEach(() => {
  fetchMock = mock(async () =>
    new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { "content-type": "application/json" },
    }),
  ) as unknown as Mock<typeof fetch>;
  globalThis.fetch = fetchMock as unknown as typeof fetch;
});

afterEach(() => {
  globalThis.fetch = originalFetch;
  cleanup();
});

function renderList(props: {
  macros?: MacroOption[];
  initialSchedules?: ScheduleRow[];
} = {}) {
  return render(
    <ToastProvider>
      <SchedulesList
        macros={props.macros ?? macros}
        initialSchedules={props.initialSchedules ?? []}
      />
    </ToastProvider>,
  );
}

// ── Tests ──────────────────────────────────────────────────────────────

describe("SchedulesList", () => {
  test("shows the 'No schedules configured yet.' empty state when empty", () => {
    renderList({ initialSchedules: [] });
    expect(screen.getByText("No schedules configured yet.")).toBeInTheDocument();
  });

  test("renders one row per schedule with the macro name and cron expression", () => {
    const schedules: ScheduleRow[] = [
      baseSchedule({ id: 1, macroName: "Sync Library", cronExpression: "*/15 * * * *", enabled: true }),
      baseSchedule({ id: 2, macroName: "Refresh Plex", cronExpression: "0 */2 * * *", enabled: false }),
    ];
    renderList({ initialSchedules: schedules });
    expect(screen.getByText("Sync Library")).toBeInTheDocument();
    expect(screen.getByText("Refresh Plex")).toBeInTheDocument();
    expect(screen.getByText("*/15 * * * *")).toBeInTheDocument();
    expect(screen.getByText("0 */2 * * *")).toBeInTheDocument();
  });

  test("subtitle shows count + enabled count", () => {
    const schedules: ScheduleRow[] = [
      baseSchedule({ id: 1, enabled: true }),
      baseSchedule({ id: 2, enabled: true }),
      baseSchedule({ id: 3, enabled: false }),
    ];
    renderList({ initialSchedules: schedules });
    expect(screen.getByText("3 schedules · 2 enabled")).toBeInTheDocument();
  });

  test("subtitle uses singular 'schedule' when there's exactly one", () => {
    renderList({ initialSchedules: [baseSchedule()] });
    expect(screen.getByText("1 schedule · 1 enabled")).toBeInTheDocument();
  });

  test("subtitle shows 'No schedules yet' when empty", () => {
    renderList({ initialSchedules: [] });
    expect(screen.getByText("No schedules yet")).toBeInTheDocument();
  });

  test("add button is disabled when there are no macros", () => {
    renderList({ macros: [], initialSchedules: [] });
    const addBtn = screen.getByRole("button", { name: /add schedule/i });
    expect(addBtn).toBeDisabled();
  });

  test("clicking 'Add Schedule' reveals the new schedule form and hides the button", () => {
    renderList({ initialSchedules: [] });
    const addBtn = screen.getByRole("button", { name: /add schedule/i });
    fireEvent.click(addBtn);
    // Button is gone once the form is open
    expect(screen.queryByRole("button", { name: /add schedule/i })).toBeNull();
    // The form panel is now visible (look for the 'New Schedule' heading)
    expect(screen.getByText("New Schedule")).toBeInTheDocument();
  });

  test("edit link for each row points to /schedules/:id/edit", () => {
    const schedules: ScheduleRow[] = [
      baseSchedule({ id: 42, macroName: "Sync Library" }),
      baseSchedule({ id: 7, macroName: "Refresh Plex" }),
    ];
    renderList({ initialSchedules: schedules });
    const links = screen.getAllByRole("link");
    const editLinks = links.filter((a) => a.getAttribute("href")?.includes("/schedules/"));
    const hrefs = editLinks.map((a) => a.getAttribute("href")).sort();
    expect(hrefs).toEqual(["/schedules/42/edit", "/schedules/7/edit"]);
  });

  test("clicking the toggle switch fires POST /api/schedules/:id/toggle", async () => {
    const schedules: ScheduleRow[] = [
      baseSchedule({ id: 5, enabled: true }),
    ];
    renderList({ initialSchedules: schedules });
    const toggle = screen.getByRole("switch", { name: /toggle schedule for sync library/i });
    fireEvent.click(toggle);
    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledTimes(1);
    });
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit?];
    expect(url).toBe("/api/schedules/5/toggle");
    expect(init?.method).toBe("POST");
  });

  test("toggle optimistically flips the switch from enabled to disabled", async () => {
    const schedules: ScheduleRow[] = [
      baseSchedule({ id: 5, enabled: true }),
    ];
    renderList({ initialSchedules: schedules });
    const toggle = screen.getByRole("switch", { name: /toggle schedule for sync library/i });
    expect(toggle).toHaveAttribute("aria-checked", "true");
    fireEvent.click(toggle);
    // Optimistic update happens synchronously
    await waitFor(() => {
      expect(
        screen.getByRole("switch", { name: /toggle schedule for sync library/i }),
      ).toHaveAttribute("aria-checked", "false");
    });
  });

  test("toggle reverts to the original state on fetch failure", async () => {
    fetchMock = mock(async () => new Response("nope", { status: 500 })) as unknown as Mock<typeof fetch>;
    globalThis.fetch = fetchMock as unknown as typeof fetch;
    const schedules: ScheduleRow[] = [
      baseSchedule({ id: 5, enabled: true }),
    ];
    renderList({ initialSchedules: schedules });
    const toggle = screen.getByRole("switch", { name: /toggle schedule for sync library/i });
    fireEvent.click(toggle);
    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledTimes(1);
    });
    // After the failure, the switch should be back to enabled
    await waitFor(() => {
      expect(
        screen.getByRole("switch", { name: /toggle schedule for sync library/i }),
      ).toHaveAttribute("aria-checked", "true");
    });
  });

  test("clicking the row's Delete button opens the confirm dialog", () => {
    const schedules: ScheduleRow[] = [
      baseSchedule({ id: 9, macroName: "Sync Library", cronExpression: "*/15 * * * *" }),
    ];
    renderList({ initialSchedules: schedules });
    const deleteBtns = screen.getAllByRole("button", { name: /delete/i });
    // The first Delete button in the document is the row button
    fireEvent.click(deleteBtns[0]);
    // Dialog is now open — the modal renders the "Delete schedule?" heading
    expect(screen.getByText("Delete schedule?")).toBeInTheDocument();
    // The macro name and cron expression are shown in the dialog body.
    // The row stays mounted behind the overlay, so we look inside the
    // dialog container (scoped to the .glass-modal element).
    const dialogTitle = screen.getByText("Delete schedule?");
    const dialog = dialogTitle.closest("div.glass-modal") as HTMLElement;
    expect(within(dialog).getByText("Sync Library")).toBeInTheDocument();
    expect(within(dialog).getByText("*/15 * * * *")).toBeInTheDocument();
  });

  test("confirming the delete dialog fires DELETE /api/schedules/:id and removes the row", async () => {
    const schedules: ScheduleRow[] = [
      baseSchedule({ id: 9, macroName: "Sync Library" }),
      baseSchedule({ id: 10, macroName: "Refresh Plex" }),
    ];
    renderList({ initialSchedules: schedules });
    const deleteBtns = screen.getAllByRole("button", { name: /delete/i });
    fireEvent.click(deleteBtns[0]);
    // Dialog confirm — find the dialog's Delete button by its label "Delete"
    const confirmBtn = screen.getByRole("button", { name: /^Delete$/ });
    fireEvent.click(confirmBtn);
    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledTimes(1);
    });
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit?];
    expect(url).toBe("/api/schedules/9");
    expect(init?.method).toBe("DELETE");
    // Row 9 is removed; row 10 still present
    await waitFor(() => {
      expect(screen.queryByText("Sync Library")).toBeNull();
    });
    expect(screen.getByText("Refresh Plex")).toBeInTheDocument();
  });

  test("disabled schedule shows the 'Disabled' pill and is dimmed", () => {
    const schedules: ScheduleRow[] = [
      baseSchedule({ id: 1, enabled: false, macroName: "Sync Library" }),
    ];
    renderList({ initialSchedules: schedules });
    expect(screen.getByText("Disabled")).toBeInTheDocument();
    const row = screen.getByText("Sync Library").closest('[data-schedule-id]');
    expect(row).toBeTruthy();
    // Inline style sets opacity to 0.5 when disabled
    expect((row as HTMLElement).style.opacity).toBe("0.5");
  });
});
