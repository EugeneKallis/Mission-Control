/**
 * Unit tests for src/components/schedules/new-schedule-form.tsx
 *
 * Covers:
 *  - default values, default cron preview
 *  - quick-pick presets (1m, 5m, 15m, 1h, etc.) update the form
 *  - switching frequency shows/hides the right conditional fields
 *  - cron preview updates live as the user types
 *  - submit calls onCreate with the right macroId + cron expression
 *  - submit button is disabled when no macro is selected
 *  - cancel button calls onCancel
 *
 * Naming: the "Daily"/"Weekly" preset chip and the "Daily"/"Weekly"
 * frequency switcher both have the same accessible name. The chip is
 * the first match in the DOM, the switcher is the second. Helpers
 * `getFrequencyBtn` and `getPreset` make this explicit.
 */

import { describe, test, expect, mock, afterEach } from "bun:test";
import { render, screen, fireEvent, cleanup } from "@/test-utils/render";
import { NewScheduleForm } from "./new-schedule-form";
import type { MacroOption } from "./schedules-list";

const macros: MacroOption[] = [
  { id: 1, name: "Sync Library", groupName: "Admin" },
  { id: 2, name: "Refresh Plex", groupName: "Media" },
];

afterEach(() => {
  cleanup();
});

function renderForm(props: Partial<React.ComponentProps<typeof NewScheduleForm>> = {}) {
  const onCreate = mock(async (_params: { macroId: number; cronExpression: string }) => {});
  const onCancel = mock(() => {});
  const utils = render(
    <NewScheduleForm
      macros={props.macros ?? macros}
      onCreate={props.onCreate ?? onCreate}
      onCancel={props.onCancel ?? onCancel}
    />,
  );
  return { ...utils, onCreate, onCancel };
}

/** The frequency switcher button. "Interval" has no preset twin, so it's
 *  unique. "Daily" and "Weekly" collide with the preset chip, so we
 *  pick the second match (the chip is the first). */
function getFrequencyBtn(name: "Interval" | "Daily" | "Weekly") {
  const matches = screen.getAllByRole("button", { name });
  if (name === "Interval") return matches[0]!;
  return matches[1]!;
}

/** The chip is the first element with that name. */
function getPreset(label: string) {
  return screen.getAllByRole("button", { name: label })[0]!;
}

// ── Defaults ──────────────────────────────────────────────────────────

describe("NewScheduleForm — defaults", () => {
  test("starts with first macro selected, frequency=interval, every 5 minutes", () => {
    renderForm();
    const select = screen.getByLabelText(/macro/i) as HTMLSelectElement;
    expect(select.value).toBe("1");
    // The cron preview should read "*/5 * * * *"
    expect(screen.getByText("*/5 * * * *")).toBeInTheDocument();
  });

  test("renders all quick-pick chips", () => {
    renderForm();
    for (const label of ["1m", "5m", "15m", "30m", "1h", "2h", "6h", "12h", "Daily", "Weekly"]) {
      // Each chip is the first matching element; the frequency switcher
      // is a second match for "Daily" and "Weekly".
      expect(getPreset(label)).toBeInTheDocument();
    }
  });
});

// ── Presets ───────────────────────────────────────────────────────────

describe("NewScheduleForm — quick-pick presets", () => {
  test("clicking '15m' sets every=15 minutes and the cron preview to */15 * * * *", () => {
    renderForm();
    fireEvent.click(getPreset("15m"));
    const every = screen.getByLabelText(/^every$/i) as HTMLInputElement;
    expect(every.value).toBe("15");
    expect(screen.getByText("*/15 * * * *")).toBeInTheDocument();
  });

  test("clicking '1h' sets every=1 hours and the cron preview to 0 */1 * * *", () => {
    renderForm();
    fireEvent.click(getPreset("1h"));
    const every = screen.getByLabelText(/^every$/i) as HTMLInputElement;
    expect(every.value).toBe("1");
    // Cron preview should reflect hourly schedule
    expect(screen.getByText("0 */1 * * *")).toBeInTheDocument();
  });

  test("clicking 'Daily' chip switches frequency to daily and shows the time field", () => {
    renderForm();
    fireEvent.click(getPreset("Daily"));
    // The "At time" label is only shown for daily/weekly
    expect(screen.getByText("At time")).toBeInTheDocument();
    // The 'Every' number input should be gone
    expect(screen.queryByLabelText(/^every$/i)).toBeNull();
  });

  test("clicking 'Weekly' chip shows both time and day-of-week fields", () => {
    renderForm();
    fireEvent.click(getPreset("Weekly"));
    expect(screen.getByText("At time")).toBeInTheDocument();
    expect(screen.getByText("On day")).toBeInTheDocument();
  });
});

// ── Frequency switcher ────────────────────────────────────────────────

describe("NewScheduleForm — frequency switcher", () => {
  test("'Interval' shows the every/unit fields", () => {
    renderForm();
    fireEvent.click(getFrequencyBtn("Interval"));
    expect(screen.getByLabelText(/^every$/i)).toBeInTheDocument();
    // No time or day field
    expect(screen.queryByText("At time")).toBeNull();
    expect(screen.queryByText("On day")).toBeNull();
  });

  test("'Daily' shows the time field and hides the every field", () => {
    renderForm();
    fireEvent.click(getFrequencyBtn("Daily"));
    expect(screen.getByText("At time")).toBeInTheDocument();
    expect(screen.queryByLabelText(/^every$/i)).toBeNull();
  });

  test("'Weekly' shows time + day-of-week and hides the every field", () => {
    renderForm();
    fireEvent.click(getFrequencyBtn("Weekly"));
    expect(screen.getByText("At time")).toBeInTheDocument();
    expect(screen.getByText("On day")).toBeInTheDocument();
    expect(screen.queryByLabelText(/^every$/i)).toBeNull();
  });
});

// ── Live cron preview ─────────────────────────────────────────────────

describe("NewScheduleForm — live cron preview", () => {
  test("changing the 'every' number updates the preview", () => {
    renderForm();
    const every = screen.getByLabelText(/^every$/i) as HTMLInputElement;
    fireEvent.change(every, { target: { value: "7" } });
    expect(screen.getByText("*/7 * * * *")).toBeInTheDocument();
  });

  test("changing the time for daily updates the preview", () => {
    renderForm();
    fireEvent.click(getFrequencyBtn("Daily"));
    const time = screen.getByLabelText(/^at time$/i) as HTMLInputElement;
    fireEvent.change(time, { target: { value: "14:30" } });
    expect(screen.getByText("30 14 * * *")).toBeInTheDocument();
  });

  test("changing the day-of-week for weekly updates the preview", () => {
    renderForm();
    fireEvent.click(getFrequencyBtn("Weekly"));
    const dow = screen.getByLabelText(/^on day$/i) as HTMLSelectElement;
    fireEvent.change(dow, { target: { value: "5" } });
    // The time is 09:00 (default) and day is 5 (Friday)
    expect(screen.getByText("00 09 * * 5")).toBeInTheDocument();
  });
});

// ── Submit ────────────────────────────────────────────────────────────

describe("NewScheduleForm — submit", () => {
  test("submit calls onCreate with macroId and the built cron expression", async () => {
    const { onCreate } = renderForm();
    const submitBtn = screen.getByRole("button", { name: /save schedule/i });
    fireEvent.click(submitBtn);
    // onCreate is async; wait for the next microtask
    await Promise.resolve();
    expect(onCreate).toHaveBeenCalledTimes(1);
    const call = (onCreate.mock.calls[0] as [{ macroId: number; cronExpression: string }])[0];
    expect(call.macroId).toBe(1);
    expect(call.cronExpression).toBe("*/5 * * * *");
  });

  test("submit reflects the current form values (15m preset)", async () => {
    const { onCreate } = renderForm();
    fireEvent.click(getPreset("15m"));
    fireEvent.click(screen.getByRole("button", { name: /save schedule/i }));
    await Promise.resolve();
    const call = (onCreate.mock.calls[0] as [{ macroId: number; cronExpression: string }])[0];
    expect(call.cronExpression).toBe("*/15 * * * *");
  });

  test("submit with a different macro selects that macro's id", async () => {
    const { onCreate } = renderForm();
    const select = screen.getByLabelText(/macro/i) as HTMLSelectElement;
    fireEvent.change(select, { target: { value: "2" } });
    fireEvent.click(screen.getByRole("button", { name: /save schedule/i }));
    await Promise.resolve();
    const call = (onCreate.mock.calls[0] as [{ macroId: number; cronExpression: string }])[0];
    expect(call.macroId).toBe(2);
  });

  test("submit button is disabled when no macro is available", () => {
    renderForm({ macros: [] });
    const submitBtn = screen.getByRole("button", { name: /save schedule/i });
    expect(submitBtn).toBeDisabled();
  });
});

// ── Cancel ────────────────────────────────────────────────────────────

describe("NewScheduleForm — cancel", () => {
  test("clicking Cancel calls onCancel and does not submit", () => {
    const { onCancel, onCreate } = renderForm();
    fireEvent.click(screen.getByRole("button", { name: /cancel/i }));
    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(onCreate).not.toHaveBeenCalled();
  });
});
