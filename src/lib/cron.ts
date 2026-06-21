/**
 * Cron expression builder/parser for the schedules page.
 *
 * The Go implementation only supports three schedule "shapes":
 *  - interval: every N minutes or every N hours
 *  - daily:    at HH:MM
 *  - weekly:   on DOW (1-6,0) at HH:MM
 *
 * These are the only shapes the UI generates, but we still emit and accept
 * the 5-field cron format so the `cron` npm package can parse them.
 *
 * Mirrors `generateCronExpression` + `parseCronToForm` in
 * `~/ServerTool/cmd/web/handler/schedules.go`.
 */

export type Frequency = "interval" | "daily" | "weekly";
export type IntervalUnit = "minutes" | "hours";
export type DayOfWeek = "0" | "1" | "2" | "3" | "4" | "5" | "6";

export interface ScheduleFormValues {
  frequency: Frequency;
  intervalValue?: string; // numeric string, e.g. "15"
  intervalUnit?: IntervalUnit;
  time?: string; // "HH:MM"
  dayOfWeek?: DayOfWeek;
}

export const DEFAULT_FORM: ScheduleFormValues = {
  frequency: "interval",
  intervalValue: "1",
  intervalUnit: "minutes",
  time: "09:00",
  dayOfWeek: "1",
};

/**
 * Build a 5-field cron expression from the form values. Throws if required
 * fields for the chosen frequency are missing or malformed.
 */
export function buildCronExpression(values: ScheduleFormValues): string {
  switch (values.frequency) {
    case "interval": {
      const val = (values.intervalValue ?? "1").trim() || "1";
      const unit: IntervalUnit = values.intervalUnit === "hours" ? "hours" : "minutes";
      if (unit === "minutes") return `*/${val} * * * *`;
      return `0 */${val} * * *`;
    }
    case "daily": {
      const time = (values.time ?? "").trim();
      const { hh, mm } = parseHHMM(time);
      return `${mm} ${hh} * * *`;
    }
    case "weekly": {
      const time = (values.time ?? "").trim();
      const { hh, mm } = parseHHMM(time);
      const dow = (values.dayOfWeek ?? "1").trim() || "1";
      return `${mm} ${hh} * * ${dow}`;
    }
    default:
      throw new Error(`Invalid frequency: ${values.frequency as string}`);
  }
}

/**
 * Parse a 5-field cron expression back into form values for the edit form.
 * Falls back to the default interval shape for any expression we don't
 * understand.
 */
export function parseCronToForm(cronExpr: string): ScheduleFormValues {
  const parts = cronExpr.trim().split(/\s+/);
  if (parts.length !== 5) return { ...DEFAULT_FORM };

  const [min, hour, , , dow] = parts;

  // Interval: `*/N * * * *` (every N minutes)
  if (min.startsWith("*/") && hour === "*") {
    return {
      frequency: "interval",
      intervalValue: min.slice(2),
      intervalUnit: "minutes",
    };
  }

  // Interval: `0 */N * * *` (every N hours)
  if (min === "0" && hour.startsWith("*/")) {
    return {
      frequency: "interval",
      intervalValue: hour.slice(2),
      intervalUnit: "hours",
    };
  }

  // Weekly: dow is not "*"
  if (dow !== "*") {
    return {
      frequency: "weekly",
      time: `${hour.padStart(2, "0")}:${min.padStart(2, "0")}`,
      dayOfWeek: dow as DayOfWeek,
    };
  }

  // Daily
  return {
    frequency: "daily",
    time: `${hour.padStart(2, "0")}:${min.padStart(2, "0")}`,
  };
}

/**
 * Validate a 5-field cron expression. Returns an error string or null.
 * Lightweight check (we don't re-implement full cron grammar; the `cron`
 * npm package will also validate at registration time).
 */
export function validateCronExpression(expr: string): string | null {
  const parts = expr.trim().split(/\s+/);
  if (parts.length !== 5) return `Expected 5 fields, got ${parts.length}`;
  for (const p of parts) {
    if (!/^[\d*\/,\-]+$/.test(p)) {
      return `Invalid field: "${p}"`;
    }
  }
  return null;
}

function parseHHMM(time: string): { hh: string; mm: string } {
  const trimmed = time.trim();
  if (!trimmed) throw new Error("Time is required for daily/weekly schedule");
  const parts = trimmed.split(":");
  if (parts.length !== 2) throw new Error(`Invalid time format: "${time}" (expected HH:MM)`);
  const [hh, mm] = parts;
  if (!/^\d{1,2}$/.test(hh) || !/^\d{1,2}$/.test(mm)) {
    throw new Error(`Invalid time: "${time}"`);
  }
  return { hh: hh.padStart(2, "0"), mm: mm.padStart(2, "0") };
}
