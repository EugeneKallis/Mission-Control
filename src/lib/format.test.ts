/**
 * Unit tests for src/lib/format.ts
 *
 * Covers:
 *  - humanReadableSize: unit selection, zero/negative, large sizes
 *  - formatDateTime:    fixed date string formatting
 *  - formatDuration:    sub-minute vs minute+ durations
 *  - formatSeconds:     seconds-based duration formatting
 */

import { describe, test, expect } from "bun:test";
import {
  humanReadableSize,
  formatDateTime,
  formatDuration,
  formatSeconds,
} from "./format";

describe("humanReadableSize", () => {
  test("returns 0 B for zero bytes", () => {
    expect(humanReadableSize(0)).toBe("0 B");
  });

  test("returns 0 B for negative", () => {
    expect(humanReadableSize(-1)).toBe("0 B");
  });

  test("returns 0 B for NaN", () => {
    expect(humanReadableSize(NaN)).toBe("0 B");
  });

  test("formats bytes without decimals", () => {
    expect(humanReadableSize(500)).toBe("500 B");
  });

  test("formats kilobytes round", () => {
    expect(humanReadableSize(1024)).toBe("1 KB");
  });

  test("formats kilobytes with one decimal", () => {
    expect(humanReadableSize(1536)).toBe("1.5 KB");
  });

  test("formats megabytes with one decimal", () => {
    expect(humanReadableSize(1_572_864)).toBe("1.5 MB");
  });

  test("formats gigabytes with one decimal", () => {
    expect(humanReadableSize(2.5 * 1024 ** 3)).toBe("2.5 GB");
  });

  test("formats terabytes round", () => {
    expect(humanReadableSize(3 * 1024 ** 4)).toBe("3 TB");
  });

  test("formats petabytes with one decimal", () => {
    expect(humanReadableSize(1.25 * 1024 ** 5)).toBe("1.3 PB");
  });

  test("large sizes without decimals when >= 100", () => {
    expect(humanReadableSize(100 * 1024 * 1024)).toBe("100 MB");
  });
});

describe("formatDateTime", () => {
  test("produces 'Mon DD, HH:MM:SS' with zero-padded values", () => {
    const d = new Date(2026, 5, 7, 9, 5, 3);
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
  test("delegates to formatSeconds", () => {
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
});

describe("formatSeconds", () => {
  test("sub-minute", () => {
    expect(formatSeconds(0)).toBe("0s");
    expect(formatSeconds(45)).toBe("45s");
  });

  test("minutes and seconds", () => {
    expect(formatSeconds(60)).toBe("1m");
    expect(formatSeconds(125)).toBe("2m 5s");
  });

  test("exact minutes", () => {
    expect(formatSeconds(300)).toBe("5m");
  });

  test("hours with minutes", () => {
    expect(formatSeconds(3600 + 23 * 60)).toBe("1h 23m");
  });

  test("exact hours", () => {
    expect(formatSeconds(3600)).toBe("1h");
  });

  test("days with hours", () => {
    expect(formatSeconds(90000)).toBe("1d 1h");
  });

  test("exact days", () => {
    expect(formatSeconds(86400)).toBe("1d");
  });

  test("handles negative and non-finite", () => {
    expect(formatSeconds(-1)).toBe("0s");
    expect(formatSeconds(NaN)).toBe("0s");
  });
});
