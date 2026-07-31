/**
 * Unit tests for GET /api/agent/install
 *
 * The install route serves a generated shell script. It does not
 * touch the DB or any external resource. The only inputs are the
 * request's URL scheme and host header, which determine the
 * SERVER_URL baked into the script.
 */

import { describe, test, expect } from "bun:test";
import { NextRequest } from "next/server";

async function loadRoute() {
  return import(`./route?bust=${Date.now()}-${Math.random()}`);
}

function buildRequest(host: string, scheme: "http" | "https") {
  return new NextRequest(`${scheme}://${host}/api/agent/install`, {
    headers: { host },
  });
}

describe("GET /api/agent/install", () => {
  test("returns 200 with a shell script content-type", async () => {
    const { GET } = await loadRoute();
    const res = await GET(buildRequest("mission.local:9000", "http"));
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toMatch(/text\/x-shellscript/);
    expect(res.headers.get("Content-Disposition")).toContain("install.sh");
  });

  test("includes a shebang and a set -e", async () => {
    const { GET } = await loadRoute();
    const res = await GET(buildRequest("mission.local:9000", "http"));
    const body = await res.text();
    expect(body.startsWith("#!/bin/bash")).toBe(true);
    expect(body).toContain("set -e");
  });

  test("bakes the request host into the script", async () => {
    const { GET } = await loadRoute();
    const res = await GET(buildRequest("mission.local:9000", "http"));
    const body = await res.text();
    expect(body).toContain("Server URL: http://mission.local:9000");
    expect(body).toContain('curl -fsSL "http://mission.local:9000/api/agent/download?arch=ts"');
    expect(body).toContain('Environment="SERVER_URL=http://mission.local:9000"');
  });

  test("supports https scheme", async () => {
    const { GET } = await loadRoute();
    const res = await GET(buildRequest("mission.example.com", "https"));
    const body = await res.text();
    expect(body).toContain("Server URL: https://mission.example.com");
  });

  test("uses the public Host header instead of an internal request origin", async () => {
    const { GET } = await loadRoute();
    const res = await GET({
      nextUrl: new URL("http://127.0.0.1:3000/api/agent/install"),
      headers: new Headers({ host: "mission.local:9000" }),
    } as NextRequest);
    const body = await res.text();
    expect(body).toContain("http://mission.local:9000");
    expect(body).not.toContain("http://127.0.0.1:3000");
  });

  test("installs the Bun wrapper and checks that Bun is available", async () => {
    const { GET } = await loadRoute();
    const res = await GET(buildRequest("mission.local:9000", "http"));
    const body = await res.text();
    expect(body).toContain("command -v bun");
    expect(body).toContain('BUN_BIN="$(command -v bun)"');
    expect(body).toContain("download?arch=ts");
    expect(body).not.toContain("BINARY_ARCH");
  });

  test("writes a systemd unit and enables the service", async () => {
    const { GET } = await loadRoute();
    const res = await GET(buildRequest("mission.local:9000", "http"));
    const body = await res.text();
    expect(body).toContain("/etc/systemd/system/mission-control-agent.service");
    expect(body).toContain("Restart=always");
    expect(body).toContain('Environment="SERVER_URL=http://mission.local:9000"');
    expect(body).toContain('Environment="BUN_BIN=$BUN_BIN"');
    expect(body).toContain("systemctl enable --now mission-control-agent");
  });

  test("rejects an origin with shell metacharacters", async () => {
    const { GET } = await loadRoute();
    const res = await GET(new NextRequest("http://foo$(id).local/api/agent/install"));
    expect(res.status).toBe(400);
  });
});
