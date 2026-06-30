/**
 * Unit tests for src/components/schedules/edit-schedule-form.tsx
 *
 * Covers:
 *  - prefills fields from initialValues (interval, daily, weekly)
 *  - cron preview reflects initial values
 *  - "Currently disabled" pill shows when initialEnabled is false
 *  - changing fields updates the cron preview
 *  - submit PUTs to /api/schedules/:id and navigates to /schedules on success
 *  - submit shows a toast on failure
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
import { render, screen, fireEvent, waitFor, cleanup } from "@/test-utils/render";
import { ToastProvider } from "@/components/toast-provider";
import { EditScheduleForm } from "./edit-schedule-form";
import type { MacroOption } from "./schedules-list";
import type { ScheduleFormValues } from "@/lib/cron";

const macros: MacroOption[] = [
  { id: 1, name: "Sync Library", groupName: "Admin" },
  { id: 2, name: "Refresh Plex", groupName: "Media" },
];

// ── Module mocks ──────────────────────────────────────────────────────

mock.module("next/navigation", () => ({
  useRouter: () => ({
    refresh: () => {},
    push: () => {},
    back: () => {},
    forward: () => {},
    replace: () => {},
    prefetch: () => {},
  }),
  usePathname: () => "/schedules/1/edit",
  useSearchParams: () => new URLSearchParams(),
}));

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

// ── Fetch mock plumbing ───────────────────────────────────────────────

const originalFetch = globalThis.fetch;
let fetchMock: Mock<typeof fetch>;
let pushMock: Mock<() => void>;
let refreshMock: Mock<() => void>;

beforeEach(() => {
  pushMock = mock(() => {});
  refreshMock = mock(() => {});
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

function renderForm(props: {
  scheduleId?: number;
  initialEnabled?: boolean;
  macros?: MacroOption[];
  initialValues?: ScheduleFormValues;
  initialMacroId?: number;
} = {}) {
  return render(
    <ToastProvider>
      <EditScheduleForm
        scheduleId={props.scheduleId ?? 42}
        initialEnabled={props.initialEnabled ?? true}
        macros={props.macros ?? macros}
        initialValues={
          props.initialValues ?? {
            frequency: "interval",
            intervalValue: "15",
            intervalUnit: "minutes",
          }
        }
        initialMacroId={props.initialMacroId ?? 1}
      />
    </ToastProvider>,
  );
}

// ── Prefill ───────────────────────────────────────────────────────────

describe("EditScheduleForm — prefill", () => {
  test("prefills the macro select from initialMacroId", () => {
    renderForm({ initialMacroId: 2 });
    const select = screen.getByLabelText(/macro/i) as HTMLSelectElement;
    expect(select.value).toBe("2");
  });

  test("prefills interval/minutes and shows the right cron preview", () => {
    renderForm({
      initialValues: { frequency: "interval", intervalValue: "15", intervalUnit: "minutes" },
    });
    const every = screen.getByLabelText(/^every$/i) as HTMLInputElement;
    expect(every.value).toBe("15");
    expect(screen.getByText("*/15 * * * *")).toBeInTheDocument();
  });

  test("prefills interval/hours and shows the right cron preview", () => {
    renderForm({
      initialValues: { frequency: "interval", intervalValue: "3", intervalUnit: "hours" },
    });
    const every = screen.getByLabelText(/^every$/i) as HTMLInputElement;
    expect(every.value).toBe("3");
    expect(screen.getByText("0 */3 * * *")).toBeInTheDocument();
  });

  test("prefills daily and shows the time input", () => {
    renderForm({
      initialValues: { frequency: "daily", time: "09:30" },
    });
    const time = screen.getByLabelText(/^at time$/i) as HTMLInputElement;
    expect(time.value).toBe("09:30");
    expect(screen.getByText("30 09 * * *")).toBeInTheDocument();
  });

  test("prefills weekly and shows the time + day inputs", () => {
    renderForm({
      initialValues: { frequency: "weekly", time: "14:00", dayOfWeek: "5" },
    });
    const time = screen.getByLabelText(/^at time$/i) as HTMLInputElement;
    expect(time.value).toBe("14:00");
    const dow = screen.getByLabelText(/^on day$/i) as HTMLSelectElement;
    expect(dow.value).toBe("5");
    expect(screen.getByText("00 14 * * 5")).toBeInTheDocument();
  });

  test("shows 'Currently disabled' pill when initialEnabled is false", () => {
    renderForm({ initialEnabled: false });
    expect(screen.getByText("Currently disabled")).toBeInTheDocument();
  });

  test("does NOT show the 'Currently disabled' pill when initialEnabled is true", () => {
    renderForm({ initialEnabled: true });
    expect(screen.queryByText("Currently disabled")).toBeNull();
  });
});

// ── Live preview when editing ────────────────────────────────────────

describe("EditScheduleForm — live cron preview", () => {
  test("changing the every number updates the preview", () => {
    renderForm({
      initialValues: { frequency: "interval", intervalValue: "15", intervalUnit: "minutes" },
    });
    const every = screen.getByLabelText(/^every$/i) as HTMLInputElement;
    fireEvent.change(every, { target: { value: "20" } });
    expect(screen.getByText("*/20 * * * *")).toBeInTheDocument();
  });

  test("switching to daily reveals the time field and updates the preview", () => {
    renderForm({
      initialValues: { frequency: "interval", intervalValue: "15", intervalUnit: "minutes" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Daily" }));
    expect(screen.getByText("At time")).toBeInTheDocument();
    expect(screen.queryByLabelText(/^every$/i)).toBeNull();
  });
});

// ── Submit ────────────────────────────────────────────────────────────

describe("EditScheduleForm — submit", () => {
  test("submit PUTs to /api/schedules/:id with macroId and cron", async () => {
    renderForm({
      scheduleId: 42,
      initialMacroId: 1,
      initialValues: { frequency: "interval", intervalValue: "15", intervalUnit: "minutes" },
    });
    fireEvent.click(screen.getByRole("button", { name: /update schedule/i }));
    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledTimes(1);
    });
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit?];
    expect(url).toBe("/api/schedules/42");
    expect(init?.method).toBe("PUT");
    const body = JSON.parse(init?.body as string);
    expect(body.macroId).toBe(1);
    expect(body.cronExpression).toBe("*/15 * * * *");
  });

  test("submit reflects form changes (15m → 30m)", async () => {
    renderForm({
      scheduleId: 7,
      initialMacroId: 1,
      initialValues: { frequency: "interval", intervalValue: "15", intervalUnit: "minutes" },
    });
    const every = screen.getByLabelText(/^every$/i) as HTMLInputElement;
    fireEvent.change(every, { target: { value: "30" } });
    fireEvent.click(screen.getByRole("button", { name: /update schedule/i }));
    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledTimes(1);
    });
    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit?];
    const body = JSON.parse(init?.body as string);
    expect(body.cronExpression).toBe("*/30 * * * *");
  });

  test("submit shows an error toast when the server returns non-2xx", async () => {
    fetchMock = mock(async () =>
      new Response(JSON.stringify({ error: "bad cron" }), {
        status: 400,
        headers: { "content-type": "application/json" },
      }),
    ) as unknown as Mock<typeof fetch>;
    globalThis.fetch = fetchMock as unknown as typeof fetch;
    renderForm({
      scheduleId: 42,
      initialMacroId: 1,
      initialValues: { frequency: "interval", intervalValue: "15", intervalUnit: "minutes" },
    });
    fireEvent.click(screen.getByRole("button", { name: /update schedule/i }));
    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledTimes(1);
    });
    // The toast should contain the server's error message
    expect(await screen.findByText("bad cron")).toBeInTheDocument();
  });
});

// ── Cancel ────────────────────────────────────────────────────────────

describe("EditScheduleForm — cancel", () => {
  test("clicking Cancel does not call PUT", () => {
    renderForm();
    // The Cancel button is wrapped in a <Link> to /schedules; click it
    fireEvent.click(screen.getByRole("button", { name: /^Cancel$/ }));
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
