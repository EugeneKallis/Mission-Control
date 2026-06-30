/**
 * Unit tests for GET /api/agent/download
 *
 * Two code paths:
 *   - arch=ts (default): returns an inline shell wrapper, no fs touch.
 *   - arch=amd64|arm64|arm: reads bin/agent-linux-<arch>.
 *
 * Mocking strategy: `mock.module("fs", ...)` so the route's ESM
 * import sees the mock. A module-level `prebuiltContent` flag
 * controls what readFileSync returns for the prebuilt-arch path.
 */

import { describe, test, expect, mock } from "bun:test";
import { NextRequest } from "next/server";

let prebuiltContent: Buffer | null = null;
let fsError: Error | null = null;

mock.module("fs", () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const original = require("fs");
  return {
    ...original,
    readFileSync: ((p: string) => {
      if (fsError) throw fsError;
      if (prebuiltContent) {
        if (p.includes("agent-linux-")) return prebuiltContent;
        throw new Error(`unexpected path in mock: ${p}`);
      }
      return original.readFileSync(p);
    }) as typeof original.readFileSync,
  };
});

async function loadRoute() {
  return import(`./route?bust=${Date.now()}-${Math.random()}`);
}

function buildRequest(url: string): NextRequest {
  return new NextRequest(url);
}

describe("GET /api/agent/download (arch=ts, default)", () => {
  test("returns 200 with shell wrapper content-type", async () => {
    prebuiltContent = null;
    const { GET } = await loadRoute();
    const res = await GET(buildRequest("http://localhost/api/agent/download"));
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toMatch(/text\/x-shellscript/);
    expect(res.headers.get("Content-Disposition")).toContain('filename="mission-control-agent"');
  });

  test("wrapper script is a bash script and uses bun", async () => {
    prebuiltContent = null;
    const { GET } = await loadRoute();
    const res = await GET(buildRequest("http://localhost/api/agent/download"));
    const body = await res.text();
    expect(body.startsWith("#!/bin/bash")).toBe(true);
    expect(body).toContain("bun /opt/mission-control-agent/agent.ts");
    expect(body).toContain("set -e");
  });

  test("wrapper pulls the agent source from /api/agent/source", async () => {
    prebuiltContent = null;
    const { GET } = await loadRoute();
    const res = await GET(buildRequest("http://localhost/api/agent/download"));
    const body = await res.text();
    expect(body).toContain('curl -fsSL "$SERVER_URL/api/agent/source"');
  });

  test("returns 200 for explicit arch=ts", async () => {
    prebuiltContent = null;
    const { GET } = await loadRoute();
    const res = await GET(buildRequest("http://localhost/api/agent/download?arch=ts"));
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toMatch(/text\/x-shellscript/);
  });
});

describe("GET /api/agent/download (prebuilt arch)", () => {
  test("returns 200 with octet-stream when the prebuilt binary exists", async () => {
    prebuiltContent = Buffer.from("FAKE-AGENT-BINARY-CONTENT");
    const { GET } = await loadRoute();
    const res = await GET(buildRequest("http://localhost/api/agent/download?arch=amd64"));
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toBe("application/octet-stream");
    expect(res.headers.get("Content-Disposition")).toContain(
      'filename="mission-control-agent-linux-amd64"',
    );
    const body = Buffer.from(await res.arrayBuffer());
    expect(body.toString()).toBe("FAKE-AGENT-BINARY-CONTENT");
  });

  test("returns 200 for arm64 prebuilt", async () => {
    prebuiltContent = Buffer.from("ARM-AGENT");
    const { GET } = await loadRoute();
    const res = await GET(buildRequest("http://localhost/api/agent/download?arch=arm64"));
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toBe("application/octet-stream");
  });

  test("returns 404 with text/plain when the prebuilt binary is missing", async () => {
    prebuiltContent = null;
    fsError = new Error("ENOENT: no such file or directory");
    const { GET } = await loadRoute();
    const res = await GET(buildRequest("http://localhost/api/agent/download?arch=amd64"));
    expect(res.status).toBe(404);
    expect(res.headers.get("Content-Type")).toBe("text/plain");
    const body = await res.text();
    expect(body).toContain("No prebuilt binary for arch=amd64");
    expect(body).toContain("Use arch=ts to install the TypeScript agent");
  });

  test("returns 404 for arm arch when no binary is shipped", async () => {
    prebuiltContent = null;
    fsError = new Error("ENOENT");
    const { GET } = await loadRoute();
    const res = await GET(buildRequest("http://localhost/api/agent/download?arch=arm"));
    expect(res.status).toBe(404);
  });
});
