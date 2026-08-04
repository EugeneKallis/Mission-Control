/**
 * Tests for scripts/plex/refresh-missing-markers.ts
 *
 * Pure-helper tests (markerTypesFor / classifyItem / pickLibraries /
 * recordAttempt) plus behavioral tests for main() with a mocked fetch
 * and a temp state file.
 *
 * The mock mirrors real PMS behavior: /all listings carry NO Marker data;
 * markers only appear on /library/metadata/<ratingKey>?includeMarkers=1.
 */

import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";
import { mkdtemp, readFile, rm, stat, writeFile } from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";
import {
  classifyItem,
  markerTypesFor,
  pickLibraries,
  recordAttempt,
  type RefreshState,
} from "./refresh-missing-markers";

const realFetch = globalThis.fetch;

beforeEach(() => {
  mock.restore();
  process.env.PLEX_TOKEN = "plex-token";
  process.env.PLEX_URL = "http://plex:32400";
});

afterEach(() => {
  globalThis.fetch = realFetch;
  mock.restore();
});

// ── Pure helpers ─────────────────────────────────────────────────────────

describe("markerTypesFor", () => {
  test("episodes are eligible for intro + credits", () => {
    expect(markerTypesFor("episode")).toEqual(["intro", "credits"]);
  });

  test("movies are eligible for credits only", () => {
    expect(markerTypesFor("movie")).toEqual(["credits"]);
  });

  test("unknown types are not eligible", () => {
    expect(markerTypesFor("clip")).toEqual([]);
  });
});

describe("classifyItem", () => {
  test("existing markers are present and never re-requested", () => {
    const item = {
      ratingKey: "1",
      type: "episode",
      Marker: [{ type: "intro" }, { type: "credits" }],
    };
    const plan = classifyItem(item, {}, false);
    expect(plan.present).toEqual(["intro", "credits"]);
    expect(plan.missing).toEqual([]);
    expect(plan.skipAttempted).toEqual([]);
  });

  test("episode with no markers and no attempts is missing both", () => {
    const plan = classifyItem({ ratingKey: "1", type: "episode" }, {}, false);
    expect(plan.missing).toEqual(["intro", "credits"]);
  });

  test("attempted types are skipped by default", () => {
    const plan = classifyItem(
      { ratingKey: "1", type: "episode" },
      { "1": ["credits"] },
      false,
    );
    expect(plan.missing).toEqual(["intro"]);
    expect(plan.skipAttempted).toEqual(["credits"]);
  });

  test("retryAttempted re-queues previously attempted types (no force)", () => {
    const plan = classifyItem(
      { ratingKey: "1", type: "episode" },
      { "1": ["credits"] },
      true,
    );
    expect(plan.missing).toEqual(["intro", "credits"]);
    expect(plan.skipAttempted).toEqual([]);
  });

  test("movies never request intro, even if state says otherwise", () => {
    const plan = classifyItem({ ratingKey: "9", type: "movie" }, {}, false);
    expect(plan.missing).toEqual(["credits"]);
    const plan2 = classifyItem({ ratingKey: "9", type: "movie" }, { "9": ["intro"] }, false);
    expect(plan2.missing).toEqual(["credits"]);
    expect(plan2.skipAttempted).toEqual([]);
  });
});

describe("pickLibraries", () => {
  const libs = [
    { key: "1", title: "TV Shows", type: "show" },
    { key: "2", title: "Movies", type: "movie" },
  ];

  test("empty filter returns all libraries", () => {
    expect(pickLibraries(libs, "")).toHaveLength(2);
  });

  test("matches by name case-insensitively", () => {
    expect(pickLibraries(libs, "tv shows")).toEqual([libs[0]]);
  });

  test("matches by key", () => {
    expect(pickLibraries(libs, "2")).toEqual([libs[1]]);
  });

  test("no match returns empty", () => {
    expect(pickLibraries(libs, "nope")).toEqual([]);
  });
});

describe("recordAttempt", () => {
  test("adds marker type per rating key without mutating input", () => {
    const state: RefreshState = { attempted: { "1": ["intro"] }, updatedAt: "" };
    const next = recordAttempt(state, "1", "credits");
    expect(next.attempted["1"]).toEqual(["credits", "intro"]);
    expect(state.attempted["1"]).toEqual(["intro"]); // input untouched
    expect(next.updatedAt).not.toBe("");
  });
});

// ── main() behavioral tests ──────────────────────────────────────────────

async function loadScript() {
  mock.module("@/lib/config", () => ({
    resolveConfig: async () => ({
      plexUrl: "http://plex:32400",
      plexToken: "plex-token",
    }),
  }));
  const stamp = Date.now() + Math.random();
  return await import(`./refresh-missing-markers?bust=${stamp}`);
}

type RouteHandler = (url: URL, init: RequestInit) => unknown;

function installFetch(routes: Record<string, RouteHandler>): URL[] {
  const calls: URL[] = [];
  globalThis.fetch = mock(async (input: string | URL | Request, init: RequestInit = {}) => {
    const url = new URL(input.toString());
    calls.push(url);
    for (const [pattern, handler] of Object.entries(routes)) {
      if (!url.pathname.includes(pattern)) continue;
      const result = handler(url, init);
      if (result === undefined) continue; // handler declined — try next pattern
      if (result instanceof Response) return result;
      return new Response(JSON.stringify(result), { status: 200 });
    }
    throw new Error(`Unmocked: ${init.method ?? "GET"} ${url.pathname}${url.search}`);
  }) as unknown as typeof fetch;
  return calls;
}

function json(data: unknown): Response {
  return new Response(JSON.stringify(data), { status: 200 });
}

// ── Fixtures (markers live ONLY on the detail endpoint, like real PMS) ──

const LIBRARIES = {
  MediaContainer: {
    Directory: [
      { key: "1", title: "TV Shows", type: "show" },
      { key: "2", title: "Movies", type: "movie" },
    ],
  },
};

const LISTED = [
  { ratingKey: "100", title: "Pilot", type: "episode", grandparentTitle: "Show A", parentIndex: 1, index: 1 },
  { ratingKey: "101", title: "Second", type: "episode", grandparentTitle: "Show A", parentIndex: 1, index: 2 },
  { ratingKey: "200", title: "Movie One", type: "movie" },
  { ratingKey: "201", title: "Movie Two", type: "movie" },
];

// ratingKey → markers visible on the detail endpoint
const DETAIL_MARKERS: Record<string, unknown[]> = {
  "100": [{ type: "intro", startTimeOffset: 60000, endTimeOffset: 90000 }],
  "201": [{ type: "credits", startTimeOffset: 7000000, endTimeOffset: 7500000 }],
  // 101 and 200 have no markers at all
};

function listedFor(libType: string): unknown[] {
  return LISTED.filter((i) => (libType === "1" ? i.type === "movie" : i.type === "episode"));
}

function allRoute(url: URL): unknown {
  const libType = url.searchParams.get("type");
  const items = listedFor(libType ?? "");
  return { MediaContainer: { size: items.length, totalSize: items.length, Metadata: items } };
}

function detailRoute(url: URL, init: RequestInit): unknown {
  if ((init.method ?? "GET") !== "GET") return undefined; // let PUT routes handle /intro /credits
  const m = url.pathname.match(/\/library\/metadata\/(\d+)$/);
  if (!m) return undefined;
  const rk = m[1];
  const listed = LISTED.find((i) => i.ratingKey === rk);
  if (!listed) return undefined;
  return {
    MediaContainer: {
      Metadata: [{ ...listed, Marker: DETAIL_MARKERS[rk] ?? [] }],
    },
  };
}

const DEFAULT_ROUTES: Record<string, RouteHandler> = {
  "/library/sections": (url) => (url.pathname === "/library/sections" ? LIBRARIES : undefined),
  "/all": allRoute,
  "/library/metadata/": detailRoute,
  "/intro": () => new Response("", { status: 200 }),
  "/credits": () => new Response("", { status: 202 }),
};

function silenceLogs() {
  const orig = { log: console.log, warn: console.warn, error: console.error };
  console.log = () => {};
  console.warn = () => {};
  console.error = () => {};
  return orig;
}

async function tempStateDir(): Promise<string> {
  return await mkdtemp(join(tmpdir(), "plex-markers-test-"));
}

function putCalls(calls: URL[]): URL[] {
  return calls.filter((u) => /\/library\/metadata\/\d+\/(intro|credits)$/.test(u.pathname));
}

test("main dry-run: reports missing markers, issues no PUTs, writes no state", async () => {
  const { main } = await loadScript();
  const calls = installFetch(DEFAULT_ROUTES);
  const dir = await tempStateDir();
  const statePath = join(dir, "state.json");

  const orig = silenceLogs();
  try {
    await main(["--state-path", statePath, "--delay-ms", "0"]);
  } finally {
    console.log = orig.log;
    console.warn = orig.warn;
    console.error = orig.error;
    await rm(dir, { recursive: true, force: true });
  }

  expect(putCalls(calls)).toHaveLength(0);
  await expect(stat(statePath)).rejects.toThrow(); // no state file written
});

test("main live: checks detail endpoint and queues only missing marker types", async () => {
  const { main } = await loadScript();
  const calls = installFetch(DEFAULT_ROUTES);
  const dir = await tempStateDir();
  const statePath = join(dir, "state.json");

  const orig = silenceLogs();
  try {
    await main(["--run", "--state-path", statePath, "--delay-ms", "0"]);
  } finally {
    console.log = orig.log;
    console.warn = orig.warn;
    console.error = orig.error;
  }

  // Every listed item was checked via the detail endpoint.
  const details = calls.filter((u) => /\/library\/metadata\/\d+$/.test(u.pathname));
  expect(details.map((u) => u.pathname).sort()).toEqual([
    "/library/metadata/100",
    "/library/metadata/101",
    "/library/metadata/200",
    "/library/metadata/201",
  ]);
  for (const u of details) {
    expect(u.searchParams.get("includeMarkers")).toBe("1");
  }

  const paths = putCalls(calls).map((u) => u.pathname).sort();
  expect(paths).toEqual([
    "/library/metadata/100/credits", // 100 has intro (detail) → credits only
    "/library/metadata/101/credits",
    "/library/metadata/101/intro", // 101 has nothing → both
    "/library/metadata/200/credits", // movie → credits only, never intro
  ]);
  // No force=1 anywhere and the token never leaks into the URL.
  for (const u of calls) {
    expect(u.searchParams.has("force")).toBe(false);
    expect(u.search).not.toContain("X-Plex-Token");
    expect(u.search).not.toContain("token");
  }

  // State records exactly the accepted requests.
  const state = JSON.parse(await readFile(statePath, "utf8")) as RefreshState;
  expect(state.attempted["100"]).toEqual(["credits"]);
  expect(state.attempted["101"]).toEqual(["credits", "intro"]);
  expect(state.attempted["200"]).toEqual(["credits"]);
  expect(state.attempted["201"]).toBeUndefined(); // had credits already

  await rm(dir, { recursive: true, force: true });
});

test("main live: previously attempted items are skipped by default", async () => {
  const { main } = await loadScript();
  const calls = installFetch(DEFAULT_ROUTES);
  const dir = await tempStateDir();
  const statePath = join(dir, "state.json");
  await writeFile(
    statePath,
    JSON.stringify({ attempted: { "101": ["credits", "intro"] }, updatedAt: "" }),
  );

  const orig = silenceLogs();
  try {
    await main(["--run", "--state-path", statePath, "--delay-ms", "0"]);
  } finally {
    console.log = orig.log;
    console.warn = orig.warn;
    console.error = orig.error;
  }

  const paths = putCalls(calls).map((u) => u.pathname);
  expect(paths).toEqual(["/library/metadata/100/credits", "/library/metadata/200/credits"]); // 101 untouched

  await rm(dir, { recursive: true, force: true });
});

test("main live: --retry-attempted re-queues previously attempted items", async () => {
  const { main } = await loadScript();
  const calls = installFetch(DEFAULT_ROUTES);
  const dir = await tempStateDir();
  const statePath = join(dir, "state.json");
  await writeFile(
    statePath,
    JSON.stringify({ attempted: { "101": ["credits", "intro"] }, updatedAt: "" }),
  );

  const orig = silenceLogs();
  try {
    await main(["--run", "--retry-attempted", "--state-path", statePath, "--delay-ms", "0"]);
  } finally {
    console.log = orig.log;
    console.warn = orig.warn;
    console.error = orig.error;
  }

  const paths = putCalls(calls).map((u) => u.pathname);
  expect(paths).toContain("/library/metadata/101/intro");
  expect(paths).toContain("/library/metadata/101/credits");

  await rm(dir, { recursive: true, force: true });
});

test("main live: failed requests are not recorded in state", async () => {
  const { main } = await loadScript();
  const calls = installFetch({
    ...DEFAULT_ROUTES,
    "/credits": (url) => {
      if (url.pathname === "/library/metadata/101/credits") {
        return new Response("boom", { status: 500 });
      }
      return new Response("", { status: 202 });
    },
  });
  const dir = await tempStateDir();
  const statePath = join(dir, "state.json");

  const orig = silenceLogs();
  try {
    await main(["--run", "--state-path", statePath, "--delay-ms", "0"]);
  } finally {
    console.log = orig.log;
    console.warn = orig.warn;
    console.error = orig.error;
  }

  expect(calls.some((u) => u.pathname === "/library/metadata/101/credits")).toBe(true);
  const state = JSON.parse(await readFile(statePath, "utf8")) as RefreshState;
  expect(state.attempted["101"]).toEqual(["intro"]); // failed credits NOT recorded
  expect(state.attempted["100"]).toEqual(["credits"]);
  expect(state.attempted["200"]).toEqual(["credits"]);

  await rm(dir, { recursive: true, force: true });
});

test("main live: --library filter restricts to matching libraries", async () => {
  const { main } = await loadScript();
  const calls = installFetch(DEFAULT_ROUTES);
  const dir = await tempStateDir();
  const statePath = join(dir, "state.json");

  const orig = silenceLogs();
  try {
    await main(["--run", "--library", "Movies", "--state-path", statePath, "--delay-ms", "0"]);
  } finally {
    console.log = orig.log;
    console.warn = orig.warn;
    console.error = orig.error;
  }

  const allCalls = calls.filter((u) => u.pathname.endsWith("/all"));
  expect(allCalls).toHaveLength(1);
  expect(allCalls[0].searchParams.get("type")).toBe("1"); // movies only
  const details = calls.filter((u) => /\/library\/metadata\/\d+$/.test(u.pathname));
  expect(details.map((u) => u.pathname).sort()).toEqual(["/library/metadata/200", "/library/metadata/201"]);

  await rm(dir, { recursive: true, force: true });
});

test("main: paginates via X-Plex-Container-Start headers until totalSize is reached", async () => {
  const { main } = await loadScript();
  const bigEpisodes = Array.from({ length: 450 }, (_, i) => ({
    ratingKey: String(3000 + i),
    title: `Ep ${i}`,
    type: "episode",
    grandparentTitle: "Big Show",
    parentIndex: 1,
    index: i + 1,
  }));
  const calls = installFetch({
    "/library/sections": (url) => (url.pathname === "/library/sections" ? LIBRARIES : undefined),
    "/all": (url, init) => {
      if (url.searchParams.get("type") !== "4") {
        return { MediaContainer: { size: 0, totalSize: 0, Metadata: [] } };
      }
      const start = Number((init.headers as Record<string, string>)["X-Plex-Container-Start"] ?? 0);
      const limit = Number((init.headers as Record<string, string>)["X-Plex-Container-Size"] ?? 200);
      const slice = bigEpisodes.slice(start, start + limit);
      return {
        MediaContainer: {
          size: slice.length,
          totalSize: bigEpisodes.length,
          Metadata: slice,
        },
      };
    },
    "/library/metadata/": (url, init) => {
      if ((init.method ?? "GET") !== "GET") return undefined;
      const m = url.pathname.match(/\/library\/metadata\/(\d+)$/);
      if (!m) return undefined;
      const ep = bigEpisodes.find((e) => e.ratingKey === m[1]);
      if (!ep) return undefined;
      return { MediaContainer: { Metadata: [{ ...ep, Marker: [] }] } };
    },
    "/intro": () => new Response("", { status: 200 }),
    "/credits": () => new Response("", { status: 202 }),
  });
  const dir = await tempStateDir();
  const statePath = join(dir, "state.json");

  const orig = silenceLogs();
  try {
    await main(["--run", "--state-path", statePath, "--delay-ms", "0"]);
  } finally {
    console.log = orig.log;
    console.warn = orig.warn;
    console.error = orig.error;
  }

  const allCalls = calls.filter((u) => u.pathname.endsWith("/all"));
  expect(allCalls.length).toBeGreaterThan(1); // requested more than one page
  // Every one of the 450 items got a detail check.
  const details = calls.filter((u) => /\/library\/metadata\/3\d{3}$/.test(u.pathname));
  expect(details).toHaveLength(450);

  await rm(dir, { recursive: true, force: true });
});

test("main: requests carry X-Plex-Token header", async () => {
  const { main } = await loadScript();
  const captured: RequestInit[] = [];
  globalThis.fetch = mock(async (input: string | URL | Request, init: RequestInit = {}) => {
    captured.push(init);
    const url = new URL(input.toString());
    if (url.pathname === "/library/sections") return json(LIBRARIES);
    if (url.pathname.endsWith("/all")) return json(allRoute(url));
    if (/\/library\/metadata\/\d+$/.test(url.pathname)) return json(detailRoute(url, init));
    if (url.pathname.includes("/intro") || url.pathname.includes("/credits")) {
      return new Response("", { status: 200 });
    }
    throw new Error(`Unmocked: ${url.pathname}`);
  }) as unknown as typeof fetch;
  const dir = await tempStateDir();
  const statePath = join(dir, "state.json");

  const orig = silenceLogs();
  try {
    await main(["--run", "--state-path", statePath, "--delay-ms", "0"]);
  } finally {
    console.log = orig.log;
    console.warn = orig.warn;
    console.error = orig.error;
    await rm(dir, { recursive: true, force: true });
  }

  expect(captured.length).toBeGreaterThan(0);
  for (const init of captured) {
    const headers = init.headers as Record<string, string>;
    expect(headers["X-Plex-Token"]).toBe("plex-token");
  }
});
