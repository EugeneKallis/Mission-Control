/**
 * Tests for scripts/media/special-cleaner.ts
 *
 * The script's I/O surface (readdir, lstat, rm) is exercised by the
 * live cleanup run on the server. The pure logic is the size
 * threshold:
 *   - mbToBytes is just a unit conversion
 *   - isSmallFile encodes the policy "0 < size < cutoff" (zero-byte
 *     files are skipped, the threshold is exclusive)
 *   - DEFAULT_THRESHOLD_MB is the default operator-facing value
 *
 * Pin those, and a future tweak to the threshold or the inclusive
 * bound will fail loudly instead of silently nuking / not nuking files.
 */

import { describe, expect, test } from "bun:test";
import {
  DEFAULT_THRESHOLD_MB,
  isSmallFile,
  mbToBytes,
} from "./special-cleaner";

describe("DEFAULT_THRESHOLD_MB", () => {
  test("is 75 MB (matches the Go original)", () => {
    expect(DEFAULT_THRESHOLD_MB).toBe(75);
  });
});

describe("mbToBytes", () => {
  test("converts 0 MB to 0 bytes", () => {
    expect(mbToBytes(0)).toBe(0);
  });

  test("converts the default 75 MB", () => {
    expect(mbToBytes(DEFAULT_THRESHOLD_MB)).toBe(75 * 1024 * 1024);
  });

  test("converts 1 MB exactly", () => {
    expect(mbToBytes(1)).toBe(1024 * 1024);
  });

  test("handles negative values (still produces bytes)", () => {
    // The script never passes a negative threshold in practice; the
    // helper is just math. Document the behavior so a future caller
    // who passes a bad value gets a deterministic answer.
    expect(mbToBytes(-1)).toBe(-1024 * 1024);
  });

  test("handles large thresholds without overflow", () => {
    // 1 TB in MB = 1024 * 1024; result should be > 0.
    expect(mbToBytes(1024 * 1024)).toBeGreaterThan(0);
  });
});

describe("isSmallFile", () => {
  const cutoff = mbToBytes(75); // 75 MB

  test("zero-byte files are NOT small (skipped by the sweeper)", () => {
    expect(isSmallFile(0, cutoff)).toBe(false);
  });

  test("files strictly below the cutoff are small", () => {
    expect(isSmallFile(1, cutoff)).toBe(true);
    expect(isSmallFile(1024, cutoff)).toBe(true);
    expect(isSmallFile(cutoff - 1, cutoff)).toBe(true);
  });

  test("files at exactly the cutoff are NOT small (threshold is exclusive)", () => {
    expect(isSmallFile(cutoff, cutoff)).toBe(false);
  });

  test("files above the cutoff are NOT small", () => {
    expect(isSmallFile(cutoff + 1, cutoff)).toBe(false);
    expect(isSmallFile(2 * cutoff, cutoff)).toBe(false);
  });

  test("negative sizes are NOT small (defensive)", () => {
    expect(isSmallFile(-1, cutoff)).toBe(false);
  });

  test("works with a custom cutoff", () => {
    // 1 MB cutoff: 512 KB is small, 1 MB is not, 2 MB is not.
    const oneMb = 1024 * 1024;
    expect(isSmallFile(512 * 1024, oneMb)).toBe(true);
    expect(isSmallFile(oneMb, oneMb)).toBe(false);
    expect(isSmallFile(2 * oneMb, oneMb)).toBe(false);
  });
});
