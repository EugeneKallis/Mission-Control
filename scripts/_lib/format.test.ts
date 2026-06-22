import { describe, expect, test } from "bun:test";
import { humanBytes, humanDuration } from "./format";

describe("humanBytes", () => {
  test("0 and small values", () => {
    expect(humanBytes(0)).toBe("0 B");
    expect(humanBytes(512)).toBe("512 B");
  });

  test("kilobytes through petabytes", () => {
    expect(humanBytes(1024)).toBe("1.00 KB");
    expect(humanBytes(1024 * 1024)).toBe("1.00 MB");
    expect(humanBytes(1024 * 1024 * 1024)).toBe("1.00 GB");
    expect(humanBytes(1024 ** 4)).toBe("1.00 TB");
    expect(humanBytes(1024 ** 5)).toMatch(/^[\d.]+ PB$/);
  });

  test("rounds to two decimals", () => {
    expect(humanBytes(1536)).toBe("1.50 KB");
  });

  test("handles negative and non-finite gracefully", () => {
    expect(humanBytes(-1)).toBe("0 B");
    expect(humanBytes(NaN)).toBe("0 B");
  });
});

describe("humanDuration", () => {
  test("sub-minute", () => {
    expect(humanDuration(0)).toBe("0s");
    expect(humanDuration(45)).toBe("45s");
  });

  test("minutes and seconds", () => {
    expect(humanDuration(60)).toBe("1m 0s");
    expect(humanDuration(125)).toBe("2m 5s");
  });

  test("hours", () => {
    expect(humanDuration(3600)).toBe("1h");
    expect(humanDuration(3600 + 23 * 60)).toBe("1h 23m");
  });
});
