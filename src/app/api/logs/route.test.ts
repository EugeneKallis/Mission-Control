/**
 * Unit tests for /api/logs (GET)
 *
 * Mocks `child_process` to capture journalctl invocations and verify
 * the route returns the right body and status for each scenario.
 */

import {
  describe,
  test,
  expect,
  mock,
  beforeAll,
  afterAll,
  beforeEach,
} from "bun:test";
import { getRequest, jsonBody, status } from "@/test-utils/route-helpers";

let execFileSyncMock: ReturnType<typeof mock>;

const childProcessMock = {
  execFileSync: (..._args: unknown[]) => execFileSyncMock(..._args),
};

interface ExecCall {
  cmd: string;
  args: string[];
}

let execCalls: ExecCall[] = [];

beforeAll(() => {
  mock.module("child_process", () => childProcessMock);
});

afterAll(async () => {
  await Promise.resolve();
});

beforeEach(() => {
  execCalls = [];
  execFileSyncMock = mock((cmd: string, args: string[]) => {
    execCalls.push({ cmd, args });
    // Default: pretend the service is running for ~5 minutes
    if (args.includes("show")) {
      return "2024-01-01 12:00:00 UTC";
    }
    return "2024-01-01 12:00:00 web[123]: hello world\nweb[456]: another log\n";
  });
});

async function loadRoute() {
  return import(`./route?bust=${Date.now()}-${Math.random()}`);
}

function buildRequest(url: string) {
  return getRequest(url);
}

// ── GET /api/logs ─────────────────────────────────────────────────────────

describe("GET /api/logs", () => {
  test("returns 200 with text/plain content-type using default service and lines", async () => {
    const { GET } = await loadRoute();
    const res = await GET(buildRequest("http://localhost/api/logs"));
    expect(status(res)).toBe(200);
    expect(res.headers.get("Content-Type")).toMatch(/^text\/plain/);
    const text = await res.text();
    expect(text).toContain("hello world");
    // Default service = "web" => mission-control
    const journalCall = execCalls.find((c) => c.cmd === "journalctl");
    expect(journalCall).toBeDefined();
    expect(journalCall!.args).toContain("mission-control.service");
  });

  test("uses the magnet-bridge service when service=magnet-bridge", async () => {
    const { GET } = await loadRoute();
    const res = await GET(
      buildRequest("http://localhost/api/logs?service=magnet-bridge"),
    );
    expect(status(res)).toBe(200);
    const journalCall = execCalls.find((c) => c.cmd === "journalctl");
    expect(journalCall!.args).toContain("mission-control-magnet-bridge.service");
  });

  test("passes the lines count to journalctl when lines is numeric", async () => {
    const { GET } = await loadRoute();
    const res = await GET(
      buildRequest("http://localhost/api/logs?lines=200"),
    );
    expect(status(res)).toBe(200);
    const journalCall = execCalls.find((c) => c.cmd === "journalctl");
    expect(journalCall!.args).toContain("-n");
    expect(journalCall!.args).toContain("200");
  });

  test("uses --since when lines=all and ActiveEnterTimestamp is available", async () => {
    const { GET } = await loadRoute();
    const res = await GET(
      buildRequest("http://localhost/api/logs?lines=all"),
    );
    expect(status(res)).toBe(200);
    const journalCall = execCalls.find((c) => c.cmd === "journalctl");
    expect(journalCall!.args).toContain("--since");
    expect(journalCall!.args).toContain("2024-01-01 12:00:00 UTC");
    expect(journalCall!.args).not.toContain("-n");
  });

  test("omits --since when lines=all and ActiveEnterTimestamp is 'n/a' (no fallback)", async () => {
    // The route's fallback to -n 10000 only triggers on a thrown
    // exception, NOT on a "n/a" string return. When ActiveEnterTimestamp
    // is "n/a", the route simply doesn't add --since — the journalctl
    // call returns whatever the journal has for that service.
    execFileSyncMock = mock((cmd: string, args: string[]) => {
      execCalls.push({ cmd, args });
      if (args.includes("show")) return "n/a";
      return "fallback logs";
    });
    const { GET } = await loadRoute();
    const res = await GET(
      buildRequest("http://localhost/api/logs?lines=all"),
    );
    expect(status(res)).toBe(200);
    const journalCall = execCalls.find((c) => c.cmd === "journalctl");
    expect(journalCall!.args).not.toContain("--since");
  });

  test("falls back to -n 10000 when the `show` subprocess throws", async () => {
    execFileSyncMock = mock((cmd: string, args: string[]) => {
      execCalls.push({ cmd, args });
      if (args.includes("show")) {
        throw new Error("service not loaded");
      }
      return "fallback logs";
    });
    const { GET } = await loadRoute();
    const res = await GET(
      buildRequest("http://localhost/api/logs?lines=all"),
    );
    expect(status(res)).toBe(200);
    const journalCall = execCalls.find((c) => c.cmd === "journalctl");
    expect(journalCall!.args).toContain("10000");
  });

  test("returns 400 on unknown service", async () => {
    const { GET } = await loadRoute();
    const res = await GET(
      buildRequest("http://localhost/api/logs?service=unknown-svc"),
    );
    expect(status(res)).toBe(400);
    const text = await res.text();
    expect(text).toContain("Unknown service: unknown-svc");
    expect(text).toContain("web");
    expect(text).toContain("magnet-bridge");
    expect(text).toContain("broken-link-checker");
    expect(text).toContain("scraper");
  });

  test("returns 400 on invalid lines parameter", async () => {
    const { GET } = await loadRoute();
    const res = await GET(
      buildRequest("http://localhost/api/logs?lines=not-a-number"),
    );
    expect(status(res)).toBe(400);
    const text = await res.text();
    expect(text).toContain("Invalid lines parameter");
  });

  test("uses the broken-link-checker service when service=broken-link-checker", async () => {
    const { GET } = await loadRoute();
    const res = await GET(
      buildRequest("http://localhost/api/logs?service=broken-link-checker"),
    );
    expect(status(res)).toBe(200);
    const journalCall = execCalls.find((c) => c.cmd === "journalctl");
    expect(journalCall!.args).toContain("mission-control-broken-link-checker.service");
  });

  test("uses the scraper service when service=scraper", async () => {
    const { GET } = await loadRoute();
    const res = await GET(
      buildRequest("http://localhost/api/logs?service=scraper"),
    );
    expect(status(res)).toBe(200);
    const journalCall = execCalls.find((c) => c.cmd === "journalctl");
    expect(journalCall!.args).toContain("mission-control-scraper.service");
  });

  test("returns 200 with fallback message when journalctl throws", async () => {
    execFileSyncMock = mock((cmd: string, args: string[]) => {
      execCalls.push({ cmd, args });
      if (args.includes("show")) return "2024-01-01 12:00:00 UTC";
      throw new Error("Failed to call journalctl");
    });
    const { GET } = await loadRoute();
    const res = await GET(buildRequest("http://localhost/api/logs"));
    expect(status(res)).toBe(200);
    expect(res.headers.get("Content-Type")).toMatch(/^text\/plain/);
    const text = await res.text();
    expect(text).toContain("Failed to fetch logs");
    expect(text).toContain("Failed to call journalctl");
  });

  test("always passes -u, --no-pager, -o cat to journalctl", async () => {
    const { GET } = await loadRoute();
    await GET(buildRequest("http://localhost/api/logs?lines=50"));
    const journalCall = execCalls.find((c) => c.cmd === "journalctl");
    expect(journalCall!.args).toContain("-u");
    expect(journalCall!.args).toContain("--no-pager");
    expect(journalCall!.args).toContain("-o");
    expect(journalCall!.args).toContain("cat");
  });
});
