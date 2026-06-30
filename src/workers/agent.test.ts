/**
 * Unit tests for the pure helpers in src/workers/agent.ts.
 *
 * Covered:
 *  - parseSseChunk: SSE wire-format parsing (event + data lines, comments,
 *    multi-line data, partial-chunk remainder, multiple events in one buffer)
 *  - getMemory: returns total > 0 and used <= total
 *  - getNetworkCounters: returns the zero-counters shape and updates lastNetSample
 *  - getIpAddress: returns a string (network may be empty in CI so we don't
 *    assert on a particular value)
 *
 * Not covered (integration):
 *  - connectEvents: real fetch/SSE round-trip
 *  - heartbeatLoop: real HTTP POST loop
 *  - executeCommand: real child process spawn
 *  - shutdown: signal handling + process exit
 */

import { describe, test, expect, afterEach } from "bun:test";
import {
  parseSseChunk,
  getMemory,
  getNetworkCounters,
  getIpAddress,
} from "./agent";

describe("parseSseChunk", () => {
  test("parses a data-only record", () => {
    const { events, remainder } = parseSseChunk("data: hello\n\n");
    expect(events).toEqual([{ data: "hello" }]);
    expect(remainder).toBe("");
  });

  test("parses an event: + data: record", () => {
    const { events, remainder } = parseSseChunk("event: hello\ndata: world\n\n");
    expect(events).toEqual([{ name: "hello", data: "world" }]);
    expect(remainder).toBe("");
  });

  test("ignores comment lines starting with ':'", () => {
    const { events } = parseSseChunk(": keep-alive\ndata: ping\n\n");
    expect(events).toEqual([{ data: "ping" }]);
  });

  test("joins multiple data: lines with newlines", () => {
    const { events } = parseSseChunk("data: line1\ndata: line2\n\n");
    expect(events).toEqual([{ data: "line1\nline2" }]);
  });

  test("trims leading whitespace from data values", () => {
    // SSE spec: trim a single leading space from data
    const { events } = parseSseChunk("data:   padded\n\n");
    expect(events[0].data).toBe("padded");
  });

  test("returns remainder when buffer has no full record", () => {
    const { events, remainder } = parseSseChunk("data: partial");
    expect(events).toEqual([]);
    expect(remainder).toBe("data: partial");
  });

  test("returns remainder for incomplete trailing record", () => {
    const input = "data: first\n\ndata: second";
    const { events, remainder } = parseSseChunk(input);
    expect(events).toEqual([{ data: "first" }]);
    expect(remainder).toBe("data: second");
  });

  test("parses multiple complete records in one buffer", () => {
    const input = "data: a\n\ndata: b\n\ndata: c\n\n";
    const { events, remainder } = parseSseChunk(input);
    expect(events).toEqual([{ data: "a" }, { data: "b" }, { data: "c" }]);
    expect(remainder).toBe("");
  });

  test("skips records that are only comments", () => {
    const input = ": ping\n\ndata: real\n\n: another-ping\n\n";
    const { events } = parseSseChunk(input);
    expect(events).toEqual([{ data: "real" }]);
  });

  test("feeds the remainder back in on the next call (streaming pattern)", () => {
    // Simulate two chunks arriving where the first ends mid-record.
    const chunk1 = "event: exec\ndata: {\"type";
    const r1 = parseSseChunk(chunk1);
    expect(r1.events).toEqual([]);
    expect(r1.remainder).toBe(chunk1);

    const chunk2 = "\":\"exec\"}\n\n";
    const r2 = parseSseChunk(r1.remainder + chunk2);
    expect(r2.events).toEqual([
      { name: "exec", data: '{"type":"exec"}' },
    ]);
    expect(r2.remainder).toBe("");
  });

  test("handles a realistic agent exec event", () => {
    const cmd = JSON.stringify({
      type: "exec",
      command: "echo hello",
      commandID: 42,
      dir: "/tmp",
    });
    const input = `event: exec\ndata: ${cmd}\n\n`;
    const { events } = parseSseChunk(input);
    expect(events).toHaveLength(1);
    expect(events[0].name).toBe("exec");
    const parsed = JSON.parse(events[0].data);
    expect(parsed.type).toBe("exec");
    expect(parsed.commandID).toBe(42);
  });
});

describe("getMemory", () => {
  test("returns total > 0 and used <= total", () => {
    const m = getMemory();
    expect(m.total).toBeGreaterThan(0);
    expect(m.used).toBeGreaterThanOrEqual(0);
    expect(m.used).toBeLessThanOrEqual(m.total);
  });
});

describe("getNetworkCounters", () => {
  test("returns sent/recv zero shape (no /proc parsing in JS)", () => {
    const c = getNetworkCounters();
    expect(c).toEqual({ sent: 0, recv: 0 });
  });
});

describe("getIpAddress", () => {
  test("returns a string (may be 0.0.0.0 if no non-internal IPv4 iface)", () => {
    const ip = getIpAddress();
    expect(typeof ip).toBe("string");
    expect(ip.length).toBeGreaterThan(0);
  });
});

afterEach(() => {
  // Nothing to clean up — these helpers are side-effect-free.
});
