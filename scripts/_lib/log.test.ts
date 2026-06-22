/**
 * Tests for the shared script log helpers.
 */

import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { banner, error, info, summary, warn } from "./log";

describe("log helpers", () => {
  let captured: string[] = [];
  const origLog = console.log;
  const origWarn = console.warn;
  const origError = console.error;

  beforeEach(() => {
    captured = [];
    console.log = (...args: unknown[]) => captured.push(args.join(" "));
    console.warn = (...args: unknown[]) => captured.push(args.join(" "));
    console.error = (...args: unknown[]) => captured.push(args.join(" "));
  });

  afterEach(() => {
    console.log = origLog;
    console.warn = origWarn;
    console.error = origError;
  });

  test("info/warn/error prepend the [script] tag", () => {
    info("hello");
    warn("careful");
    error("oops");
    expect(captured[0]).toBe("[script] hello");
    expect(captured[1]).toBe("[script] careful");
    expect(captured[2]).toBe("[script] oops");
  });

  test("banner shows DRY RUN tag when requested", () => {
    banner("Run", { dryRun: true });
    expect(captured[0]).toMatch(/\[script\] ── Run \(DRY RUN\) ─/);
  });

  test("summary right-pads keys", () => {
    summary({ a: "1", longkey: "2" });
    // Both lines should be tagged; longest key length drives the column.
    const lines = captured.filter((l) => l.startsWith("[script]"));
    expect(lines[0]).toBe("[script] a        1");
    expect(lines[1]).toBe("[script] longkey  2");
  });
});
