/**
 * Tests for src/lib/pi/pi-path.ts
 *
 * Covers:
 *  - resolvePiPathSync returns a non-empty string
 *  - getPiPath returns the same value on repeated calls (caching)
 *  - resetPiPathCache clears the cache
 */

import { describe, test, expect } from "bun:test";
import { resolvePiPathSync, getPiPath, resetPiPathCache } from "./pi-path";

describe("resolvePiPathSync", () => {
  test("returns a non-empty string (pi is installed on this dev machine)", () => {
    const path = resolvePiPathSync();
    expect(path).toBeTruthy();
    expect(typeof path).toBe("string");
    expect(path.length).toBeGreaterThan(0);
  });
});

describe("getPiPath (cached)", () => {
  test("returns the same value as resolvePiPathSync", () => {
    const uncached = resolvePiPathSync();
    const cached = getPiPath();
    expect(cached).toBe(uncached);
  });

  test("returns the same value on repeated calls", () => {
    const a = getPiPath();
    const b = getPiPath();
    expect(a).toBe(b);
  });

  test("resetPiPathCache clears the cache", () => {
    // First call populates cache
    const before = getPiPath();
    // Reset
    resetPiPathCache();
    // After reset, getPiPath should still find pi (re-resolves)
    const after = getPiPath();
    expect(after).toBe(before); // same binary
  });
});
