/**
 * Unit tests for /api/run/[id] (POST)
 *
 * Mocks @/lib/runner so we can verify that runMacro is called
 * with the right arguments without actually running anything.
 */

import {
  describe,
  test,
  expect,
  mock,
  beforeAll,
  beforeEach,
  afterEach,
} from "bun:test";
import { getRequest, jsonBody, status } from "@/test-utils/route-helpers";

let runMacroMock: ReturnType<typeof mock>;
let claimInternalMacroMock: ReturnType<typeof mock>;

beforeAll(() => {
  mock.module("@/lib/runner", () => ({
    runMacro: (...args: unknown[]) => runMacroMock(...args),
  }));
  mock.module("@/lib/db/queries", () => ({
    claimInternalMacro: (...args: unknown[]) => claimInternalMacroMock(...args),
  }));
});

beforeEach(() => {
  runMacroMock = mock(async () => ({ historyId: 1, status: "started" }));
  claimInternalMacroMock = mock(async () => "normal");
});

afterEach(() => {
  // Drain any unhandled promise rejection from fire-and-forget
  // runMacro calls so the test run is clean.
});

async function loadRoute() {
  return import(`./route?bust=${Date.now()}-${Math.random()}`);
}

// ── POST /api/run/[id] ────────────────────────────────────────────────────

describe("POST /api/run/[id]", () => {
  test("returns 200 with ok:true and the macroId on happy path", async () => {
    const { POST } = await loadRoute();
    const res = await POST(getRequest("/api/run/42"), {
      params: Promise.resolve({ id: "42" }),
    });
    expect(status(res)).toBe(200);
    expect(await jsonBody(res)).toEqual({ ok: true, macroId: 42 });
  });

  test("calls runMacro with the parsed macroId and triggeredBy='user'", async () => {
    const { POST } = await loadRoute();
    await POST(getRequest("/api/run/42"), {
      params: Promise.resolve({ id: "42" }),
    });
    // Give the fire-and-forget promise a tick to fire
    await new Promise((resolve) => setTimeout(resolve, 5));
    expect(runMacroMock).toHaveBeenCalledTimes(1);
    expect(runMacroMock.mock.calls[0][0]).toBe(42);
    expect(runMacroMock.mock.calls[0][1]).toBe("user");
  });

  test("returns 409 and does not run an already consumed generated action", async () => {
    claimInternalMacroMock = mock(async () => "consumed");
    const { POST } = await loadRoute();
    const res = await POST(getRequest("/api/run/42"), {
      params: Promise.resolve({ id: "42" }),
    });
    expect(status(res)).toBe(409);
    expect(await jsonBody(res)).toEqual({ error: "This generated action has already been used" });
    expect(runMacroMock).not.toHaveBeenCalled();
  });

  test("returns 400 on a non-numeric id", async () => {
    const { POST } = await loadRoute();
    const res = await POST(getRequest("/api/run/abc"), {
      params: Promise.resolve({ id: "abc" }),
    });
    expect(status(res)).toBe(400);
    const body = (await jsonBody(res)) as { error: string; details: unknown };
    expect(body.error).toBe("Invalid macro ID");
    expect(body.details).toBeDefined();
    expect(runMacroMock).not.toHaveBeenCalled();
  });

  test("returns 400 on a negative id", async () => {
    const { POST } = await loadRoute();
    const res = await POST(getRequest("/api/run/-5"), {
      params: Promise.resolve({ id: "-5" }),
    });
    expect(status(res)).toBe(400);
    expect(runMacroMock).not.toHaveBeenCalled();
  });

  test("returns 400 on a zero id", async () => {
    const { POST } = await loadRoute();
    const res = await POST(getRequest("/api/run/0"), {
      params: Promise.resolve({ id: "0" }),
    });
    expect(status(res)).toBe(400);
    expect(runMacroMock).not.toHaveBeenCalled();
  });

  test("returns 200 even when runMacro rejects (fire-and-forget)", async () => {
    runMacroMock = mock(async () => {
      throw new Error("runner failed");
    });
    const { POST } = await loadRoute();
    const res = await POST(getRequest("/api/run/42"), {
      params: Promise.resolve({ id: "42" }),
    });
    // The route catches the rejection with .catch() and just logs it.
    expect(status(res)).toBe(200);
    expect(await jsonBody(res)).toEqual({ ok: true, macroId: 42 });
    // Give the unhandled rejection handler a tick
    await new Promise((resolve) => setTimeout(resolve, 5));
  });
});
