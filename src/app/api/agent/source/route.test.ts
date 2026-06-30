/**
 * Unit tests for GET /api/agent/source
 *
 * Reads src/workers/agent.ts and returns it as text/plain. On
 * filesystem error, returns 404 with the error message embedded
 * in a JS comment.
 *
 * Mocking strategy: use `mock.module("fs", ...)` so the ESM
 * `import { readFileSync } from "fs"` in the route picks up the
 * mock. `require("fs")` overrides only affect the CJS reference
 * and are not seen by the route's ESM import.
 */

import { describe, test, expect, mock } from "bun:test";

let shouldThrow = false;
let throwMessage = "ENOENT: no such file";

// Install the fs mock once at module load. The mock factory reads
// the current `shouldThrow` flag at call time, so individual tests
// can toggle behaviour without re-mocking.
mock.module("fs", () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const original = require("fs");
  return {
    ...original,
    readFileSync: ((p: string, encoding?: string) => {
      if (shouldThrow) {
        throw new Error(`${throwMessage}: ${p}`);
      }
      return original.readFileSync(p, encoding);
    }) as typeof original.readFileSync,
  };
});

async function loadRoute() {
  return import(`./route?bust=${Date.now()}-${Math.random()}`);
}

describe("GET /api/agent/source", () => {
  test("returns 200 with the real agent source as text/plain", async () => {
    shouldThrow = false;
    const { GET } = await loadRoute();
    const res = await GET();
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toMatch(/text\/plain/);
    expect(res.headers.get("Cache-Control")).toBe("no-cache");
    const body = await res.text();
    // The real src/workers/agent.ts starts with a file-header comment
    // and imports something — sanity-check we got a real TS file.
    expect(body.length).toBeGreaterThan(100);
    expect(body).toMatch(/import|export/);
  });

  test("returns 404 with a comment-encased error when the file is missing", async () => {
    shouldThrow = true;
    throwMessage = "ENOENT: no such file";
    const { GET } = await loadRoute();
    const res = await GET();
    expect(res.status).toBe(404);
    expect(res.headers.get("Content-Type")).toBe("text/plain");
    const body = await res.text();
    expect(body).toContain("// agent source not found");
    expect(body).toContain("ENOENT");
  });

  test("non-Error thrown values are stringified safely", async () => {
    shouldThrow = true;
    throwMessage = "string-error-not-Error";
    const { GET } = await loadRoute();
    const res = await GET();
    expect(res.status).toBe(404);
    const body = await res.text();
    expect(body).toContain("// agent source not found");
    expect(body).toContain("string-error-not-Error");
  });
});
