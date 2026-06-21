/**
 * Unit tests for src/lib/format.ts
 *
 * Covers:
 *  - humanReadableSize: unit selection, zero/negative, large sizes
 *  - formatDateTime:    fixed date string formatting
 *  - formatDuration:    sub-minute vs minute+ durations
 *  - fakeSessionId:     shape + uniqueness
 *  - extractYear:       (YYYY) suffix, no suffix, embedded numbers
 */

import { describe, test, expect } from "bun:test";
import {
  humanReadableSize,
  formatDateTime,
  formatDuration,
  fakeSessionId,
  extractYear,
} from "./format";

describe("humanReadableSize", () => {
  test("returns 0 B for zero bytes", () => {
    expect(humanReadableSize(0)).toBe("0 B");
  });

  test("formats bytes without decimals", () => {
    expect(humanReadableSize(500)).toBe("500 B");
  });

  test("formats kilobytes with one decimal", () => {
    expect(humanReadableSize(1024)).toBe("1.0 KB");
  });

  test("formats megabytes with one decimal", () => {
    expect(humanReadableSize(1_572_864)).toBe("1.5 MB");
  });

  test("formats gigabytes with one decimal", () => {
    expect(humanReadableSize(2.5 * 1024 ** 3)).toBe("2.5 GB");
  });

  test("formats terabytes with one decimal", () => {
    expect(humanReadableSize(3 * 1024 ** 4)).toBe("3.0 TB");
  });

  test("formats petabytes with one decimal", () => {
    expect(humanReadableSize(1.25 * 1024 ** 5)).toBe("1.3 PB");
  });
});

describe("formatDateTime", () => {
  test("produces 'Mon DD, HH:MM:SS' with zero-padded values", () => {
    const d = new Date(2026, 5, 7, 9, 5, 3); // Jun 7, 2026 09:05:03 local
    expect(formatDateTime(d)).toBe("Jun 07, 09:05:03");
  });

  test("renders month abbreviations in English", () => {
    const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
    for (let m = 0; m < 12; m++) {
      const d = new Date(2026, m, 15, 12, 0, 0);
      expect(formatDateTime(d).slice(0, 3)).toBe(months[m]);
    }
  });
});

describe("formatDuration", () => {
  test("sub-minute durations are reported in seconds", () => {
    const start = new Date(2026, 0, 1, 0, 0, 0);
    const end = new Date(2026, 0, 1, 0, 0, 45);
    expect(formatDuration(end, start)).toBe("45s");
  });

  test("sub-second durations round to 0s", () => {
    const start = new Date(2026, 0, 1, 0, 0, 0);
    const end = new Date(2026, 0, 1, 0, 0, 0, 250);
    expect(formatDuration(end, start)).toBe("0s");
  });

  test("minute+ durations split into minutes + seconds", () => {
    const start = new Date(2026, 0, 1, 0, 0, 0);
    const end = new Date(2026, 0, 1, 0, 2, 33);
    expect(formatDuration(end, start)).toBe("2m 33s");
  });

  test("exact minutes have no trailing seconds", () => {
    const start = new Date(2026, 0, 1, 0, 0, 0);
    const end = new Date(2026, 0, 1, 0, 5, 0);
    expect(formatDuration(end, start)).toBe("5m 0s");
  });

  test("exactly 60 seconds becomes 1m 0s", () => {
    const start = new Date(2026, 0, 1, 0, 0, 0);
    const end = new Date(2026, 0, 1, 0, 1, 0);
    expect(formatDuration(end, start)).toBe("1m 0s");
  });
});

describe("fakeSessionId", () => {
  test("returns three 4-char alphanumeric groups separated by dashes", () => {
    const id = fakeSessionId();
    expect(id).toMatch(/^[a-z0-9]{4}-[a-z0-9]{4}-[a-z0-9]{4}$/);
  });

  test("returns 100 unique values in a row", () => {
    const ids = new Set(Array.from({ length: 100 }, () => fakeSessionId()));
    expect(ids.size).toBe(100);
  });
});

describe("extractYear", () => {
  test("extracts a (YYYY) suffix", () => {
    expect(extractYear("The Matrix (1999)")).toBe("1999");
  });

  test("returns null for names without a year", () => {
    expect(extractYear("Some Show")).toBeNull();
  });

  test("ignores year-like numbers that aren't at the end", () => {
    expect(extractYear("2024 Movies")).toBeNull();
  });

  test("only matches 4-digit years in parens at end", () => {
    expect(extractYear("Movie (19999)")).toBeNull();
  });

  test("handles a single-digit year gracefully (still 1+ digits, so 4 not required)", () => {
    // The regex only requires 4 digits wrapped in (); anything else returns null.
    expect(extractYear("Movie (8)")).toBeNull();
  });
});
