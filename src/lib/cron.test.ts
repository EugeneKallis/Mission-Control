/**
 * Unit tests for src/lib/cron.ts
 *
 * Covers:
 *  - buildCronExpression: every supported form (interval, daily, weekly) +
 *    defaults, defaults when fields are missing, throw on bad input.
 *  - parseCronToForm:     round-trips with buildCronExpression, recognises
 *    hour-interval vs minute-interval, handles daily/weekly, falls back to
 *    default for garbage input.
 *  - validateCronExpression: field count, character allowlist, edge cases.
 *  - DEFAULT_FORM:        shape.
 */

import { describe, test, expect } from "bun:test";
import {
  buildCronExpression,
  parseCronToForm,
  validateCronExpression,
  DEFAULT_FORM,
  type ScheduleFormValues,
} from "./cron";

describe("buildCronExpression", () => {
  test("interval minutes: every N minutes", () => {
    expect(
      buildCronExpression({ frequency: "interval", intervalValue: "15", intervalUnit: "minutes" })
    ).toBe("*/15 * * * *");
  });

  test("interval minutes defaults to 1 when value is empty", () => {
    expect(
      buildCronExpression({ frequency: "interval", intervalValue: "", intervalUnit: "minutes" })
    ).toBe("*/1 * * * *");
  });

  test("interval minutes defaults to 1 when value is whitespace", () => {
    expect(
      buildCronExpression({ frequency: "interval", intervalValue: "   ", intervalUnit: "minutes" })
    ).toBe("*/1 * * * *");
  });

  test("interval hours: every N hours anchored on minute 0", () => {
    expect(
      buildCronExpression({ frequency: "interval", intervalValue: "2", intervalUnit: "hours" })
    ).toBe("0 */2 * * *");
  });

  test("interval hours defaults to hours even when intervalUnit omitted", () => {
    expect(
      buildCronExpression({ frequency: "interval", intervalValue: "3" })
    ).toBe("*/3 * * * *");
  });

  test("interval minutes uses minutes when unit is 'minutes'", () => {
    expect(
      buildCronExpression({ frequency: "interval", intervalValue: "5", intervalUnit: "minutes" })
    ).toBe("*/5 * * * *");
  });

  test("daily: 'HH:MM' goes to MM HH * * *", () => {
    expect(buildCronExpression({ frequency: "daily", time: "09:30" })).toBe("30 09 * * *");
  });

  test("daily: zero-pads single-digit hours/minutes", () => {
    expect(buildCronExpression({ frequency: "daily", time: "3:5" })).toBe("05 03 * * *");
  });

  test("weekly: DOW + 'HH:MM' yields MM HH * * DOW", () => {
    expect(
      buildCronExpression({ frequency: "weekly", time: "14:00", dayOfWeek: "5" })
    ).toBe("00 14 * * 5");
  });

  test("weekly: dayOfWeek defaults to 1 when blank", () => {
    // Cast to `any` for the blank dayOfWeek because the typed alias
    // (DayOfWeek) intentionally rejects "".
    const args = { frequency: "weekly" as const, time: "08:00", dayOfWeek: "" } as any;
    expect(buildCronExpression(args)).toBe("00 08 * * 1");
  });

  test("throws when daily time is empty", () => {
    expect(() => buildCronExpression({ frequency: "daily", time: "" })).toThrow(/Time is required/);
  });

  test("throws when daily time is malformed (no colon)", () => {
    expect(() => buildCronExpression({ frequency: "daily", time: "0900" })).toThrow(/Invalid time/);
  });

  test("throws when daily time is non-numeric", () => {
    expect(() => buildCronExpression({ frequency: "daily", time: "ab:cd" })).toThrow(/Invalid time/);
  });

  test("throws on unknown frequency", () => {
    // The cast is intentional — the runtime should still defend against bad input
    expect(() => buildCronExpression({ frequency: "yearly" as unknown as "daily" })).toThrow(
      /Invalid frequency/,
    );
  });
});

describe("parseCronToForm", () => {
  test("returns DEFAULT_FORM for non-5-field input", () => {
    expect(parseCronToForm("")).toEqual(DEFAULT_FORM);
    expect(parseCronToForm("* * *")).toEqual(DEFAULT_FORM);
    expect(parseCronToForm("a b c d e f")).toEqual(DEFAULT_FORM);
  });

  test("decodes minute-interval (`*/N * * * *`)", () => {
    expect(parseCronToForm("*/15 * * * *")).toEqual({
      frequency: "interval",
      intervalValue: "15",
      intervalUnit: "minutes",
    });
  });

  test("decodes hour-interval (`0 */N * * *`)", () => {
    expect(parseCronToForm("0 */2 * * *")).toEqual({
      frequency: "interval",
      intervalValue: "2",
      intervalUnit: "hours",
    });
  });

  test("decodes daily (`MM HH * * *`)", () => {
    expect(parseCronToForm("30 9 * * *")).toEqual({
      frequency: "daily",
      time: "09:30",
    });
  });

  test("decodes weekly (`MM HH * * DOW`)", () => {
    expect(parseCronToForm("00 14 * * 5")).toEqual({
      frequency: "weekly",
      time: "14:00",
      dayOfWeek: "5",
    });
  });

  test("treats any non-* DOW as weekly, even if other fields are odd", () => {
    expect(parseCronToForm("0 12 * * 0").frequency).toBe("weekly");
  });

  test("round-trips interval/minutes", () => {
    const original: ScheduleFormValues = {
      frequency: "interval",
      intervalValue: "30",
      intervalUnit: "minutes",
    };
    expect(parseCronToForm(buildCronExpression(original))).toEqual(original);
  });

  test("round-trips interval/hours", () => {
    const original: ScheduleFormValues = {
      frequency: "interval",
      intervalValue: "4",
      intervalUnit: "hours",
    };
    expect(parseCronToForm(buildCronExpression(original))).toEqual(original);
  });

  test("round-trips daily", () => {
    const original: ScheduleFormValues = { frequency: "daily", time: "07:45" };
    expect(parseCronToForm(buildCronExpression(original))).toEqual(original);
  });

  test("round-trips weekly", () => {
    const original: ScheduleFormValues = {
      frequency: "weekly",
      time: "18:00",
      dayOfWeek: "3",
    };
    expect(parseCronToForm(buildCronExpression(original))).toEqual(original);
  });
});

describe("validateCronExpression", () => {
  test("accepts a canonical 5-field expression", () => {
    expect(validateCronExpression("*/15 * * * *")).toBeNull();
    expect(validateCronExpression("0 12 * * 1")).toBeNull();
  });

  test("rejects expressions with wrong field count", () => {
    expect(validateCronExpression("* * *")).toBe("Expected 5 fields, got 3");
  });

  test("rejects fields with invalid characters", () => {
    expect(validateCronExpression("* * * * A")).toMatch(/Invalid field/);
  });

  test("rejects empty input", () => {
    expect(validateCronExpression("")).toBe("Expected 5 fields, got 1");
  });

  test("ignores leading/trailing whitespace when counting fields", () => {
    expect(validateCronExpression("   */5 * * * *   ")).toBeNull();
  });
});
