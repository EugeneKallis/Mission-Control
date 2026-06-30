/**
 * Unit tests for /api/real-debrid/status (GET)
 *
 * The route reads the API key from the config row, instantiates
 * RealDebridClient, calls getUser(), and maps the premium seconds to
 * a status label. We mock @/lib/db/queries and @/lib/clients/real-debrid
 * so no DB or HTTP is touched.
 *
 * Auth errors (401/403/400+bad token) → "Invalid key".
 * Any other error → "Offline".
 */

import {
  describe,
  test,
  expect,
  mock,
  beforeEach,
} from "bun:test";
import { jsonBody, status } from "@/test-utils/route-helpers";

// Each test installs fresh mocks and re-imports the route so the
// route picks up the new module instance.
let getConfigMock: ReturnType<typeof mock>;
let getUserMock: ReturnType<typeof mock>;
let isAuthErrorImpl: (err: unknown) => boolean = (err) => {
  const e = err as { status?: number; body?: string };
  if (e.status === 401 || e.status === 403) return true;
  if (e.status === 400 && e.body?.includes("bad token")) return true;
  return false;
};

function authErr(statusCode: number, body = "") {
  const e = new Error(`Real-Debrid API error (${statusCode}): ${body}`) as Error & {
    status: number;
    body: string;
  };
  e.status = statusCode;
  e.body = body;
  return e;
}

beforeEach(() => {
  getConfigMock = mock(async () => ({
    configJson: JSON.stringify({ real_debrid_api_key: "" }),
  }));
  getUserMock = mock(async () => ({
    id: 1,
    username: "u",
    email: "u@e",
    points: 0,
    locale: "en",
    avatar: "",
    type: "premium",
    premium: 0,
    expiration: "",
  }));
  mock.module("@/lib/db/queries", () => ({ getConfig: getConfigMock }));
  mock.module("@/lib/clients/real-debrid", () => ({
    RealDebridClient: class {
      constructor(_apiKey: string) {}
      getUser = getUserMock;
    },
    isAuthError: isAuthErrorImpl,
  }));
});

async function loadRoute() {
  return import(`./route?bust=${Date.now()}-${Math.random()}`);
}

describe("GET /api/real-debrid/status", () => {
  test("returns 'Not configured' when getConfig throws (no config row)", async () => {
    getConfigMock = mock(async () => {
      throw new Error("config not seeded");
    });
    mock.module("@/lib/db/queries", () => ({ getConfig: getConfigMock }));

    const { GET } = await loadRoute();
    const res = await GET();
    expect(status(res)).toBe(200);
    expect(await jsonBody(res)).toEqual({ label: "Not configured", ok: false });
  });

  test("returns 'Not configured' when real_debrid_api_key is empty", async () => {
    getConfigMock = mock(async () => ({
      configJson: JSON.stringify({ real_debrid_api_key: "" }),
    }));
    mock.module("@/lib/db/queries", () => ({ getConfig: getConfigMock }));

    const { GET } = await loadRoute();
    const res = await GET();
    expect(status(res)).toBe(200);
    expect(await jsonBody(res)).toEqual({ label: "Not configured", ok: false });
    expect(getUserMock).not.toHaveBeenCalled();
  });

  test("returns the premium days label when premium > 0", async () => {
    getConfigMock = mock(async () => ({
      configJson: JSON.stringify({ real_debrid_api_key: "real-key" }),
    }));
    getUserMock = mock(async () => ({
      id: 1,
      username: "u",
      email: "u@e",
      points: 0,
      locale: "en",
      avatar: "",
      type: "premium",
      premium: 86400 * 7, // 7 days
      expiration: "",
    }));
    mock.module("@/lib/db/queries", () => ({ getConfig: getConfigMock }));
    mock.module("@/lib/clients/real-debrid", () => ({
      RealDebridClient: class {
        constructor(_apiKey: string) {}
        getUser = getUserMock;
      },
      isAuthError: isAuthErrorImpl,
    }));

    const { GET } = await loadRoute();
    const res = await GET();
    expect(status(res)).toBe(200);
    expect(await jsonBody(res)).toEqual({ label: "7d", ok: true });
  });

  test("returns 'Expired' when premium is 0", async () => {
    getConfigMock = mock(async () => ({
      configJson: JSON.stringify({ real_debrid_api_key: "real-key" }),
    }));
    getUserMock = mock(async () => ({
      id: 1,
      username: "u",
      email: "u@e",
      points: 0,
      locale: "en",
      avatar: "",
      type: "free",
      premium: 0,
      expiration: "",
    }));
    mock.module("@/lib/db/queries", () => ({ getConfig: getConfigMock }));
    mock.module("@/lib/clients/real-debrid", () => ({
      RealDebridClient: class {
        constructor(_apiKey: string) {}
        getUser = getUserMock;
      },
      isAuthError: isAuthErrorImpl,
    }));

    const { GET } = await loadRoute();
    const res = await GET();
    expect(status(res)).toBe(200);
    expect(await jsonBody(res)).toEqual({ label: "Expired", ok: false });
  });

  test("returns 'Invalid key' on a 401 auth error", async () => {
    getConfigMock = mock(async () => ({
      configJson: JSON.stringify({ real_debrid_api_key: "bad-key" }),
    }));
    getUserMock = mock(async () => {
      throw authErr(401, "unauthorized");
    });
    mock.module("@/lib/db/queries", () => ({ getConfig: getConfigMock }));
    mock.module("@/lib/clients/real-debrid", () => ({
      RealDebridClient: class {
        constructor(_apiKey: string) {}
        getUser = getUserMock;
      },
      isAuthError: isAuthErrorImpl,
    }));

    const { GET } = await loadRoute();
    const res = await GET();
    expect(status(res)).toBe(200);
    expect(await jsonBody(res)).toEqual({ label: "Invalid key", ok: false });
  });

  test("returns 'Invalid key' on a 403 auth error", async () => {
    getConfigMock = mock(async () => ({
      configJson: JSON.stringify({ real_debrid_api_key: "bad-key" }),
    }));
    getUserMock = mock(async () => {
      throw authErr(403, "forbidden");
    });
    mock.module("@/lib/db/queries", () => ({ getConfig: getConfigMock }));
    mock.module("@/lib/clients/real-debrid", () => ({
      RealDebridClient: class {
        constructor(_apiKey: string) {}
        getUser = getUserMock;
      },
      isAuthError: isAuthErrorImpl,
    }));

    const { GET } = await loadRoute();
    const res = await GET();
    expect(status(res)).toBe(200);
    expect(await jsonBody(res)).toEqual({ label: "Invalid key", ok: false });
  });

  test("returns 'Offline' on a non-auth error (e.g. 500)", async () => {
    getConfigMock = mock(async () => ({
      configJson: JSON.stringify({ real_debrid_api_key: "real-key" }),
    }));
    getUserMock = mock(async () => {
      throw authErr(500, "server error");
    });
    mock.module("@/lib/db/queries", () => ({ getConfig: getConfigMock }));
    mock.module("@/lib/clients/real-debrid", () => ({
      RealDebridClient: class {
        constructor(_apiKey: string) {}
        getUser = getUserMock;
      },
      isAuthError: isAuthErrorImpl,
    }));

    const { GET } = await loadRoute();
    const res = await GET();
    expect(status(res)).toBe(200);
    expect(await jsonBody(res)).toEqual({ label: "Offline", ok: false });
  });

  test("returns 'Offline' on a non-Error throw (e.g. network failure)", async () => {
    getConfigMock = mock(async () => ({
      configJson: JSON.stringify({ real_debrid_api_key: "real-key" }),
    }));
    getUserMock = mock(async () => {
      throw new TypeError("fetch failed");
    });
    mock.module("@/lib/db/queries", () => ({ getConfig: getConfigMock }));
    mock.module("@/lib/clients/real-debrid", () => ({
      RealDebridClient: class {
        constructor(_apiKey: string) {}
        getUser = getUserMock;
      },
      isAuthError: isAuthErrorImpl,
    }));

    const { GET } = await loadRoute();
    const res = await GET();
    expect(status(res)).toBe(200);
    expect(await jsonBody(res)).toEqual({ label: "Offline", ok: false });
  });
});
