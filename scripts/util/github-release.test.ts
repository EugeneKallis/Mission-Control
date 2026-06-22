/**
 * Integration test for github-release: mocks GitHub API responses
 * and verifies filtering by time window.
 */

import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";

const realFetch = globalThis.fetch;

beforeEach(() => {
  mock.restore();
});

afterEach(() => {
  globalThis.fetch = realFetch;
  mock.restore();
});

function mockGitHubResponses(responses: Record<string, { tag_name: string; published_at: string } | null>) {
  globalThis.fetch = mock(async (url: string) => {
    for (const [repo, data] of Object.entries(responses)) {
      if (url === `https://api.github.com/repos/${repo}/releases/latest`) {
        if (data === null) return new Response("Not Found", { status: 404 });
        return new Response(JSON.stringify(data), { status: 200 });
      }
    }
    return new Response("Not Found", { status: 404 });
  }) as unknown as typeof fetch;
}

describe("github-release", () => {
  test("returns releases within the time window", async () => {
    const now = new Date();
    const recentDate = new Date(now.getTime() - 3 * 3600 * 1000).toISOString(); // 3h ago
    const oldDate = new Date(now.getTime() - 48 * 3600 * 1000).toISOString(); // 48h ago

    mockGitHubResponses({
      "homebridge/homebridge": { tag_name: "v1.8.0", published_at: recentDate },
      "n8n-io/n8n": { tag_name: "v1.50.0", published_at: oldDate },
      "moghtech/komodo": null, // 404
    });

    // Capture stdout
    const origLog = console.log;
    const logs: string[] = [];
    console.log = (...args: unknown[]) => logs.push(args.join(" "));

    try {
      const { main } = await import("./github-release");
      await main(["24"]);

      // Find the JSON output line (starts with [ followed by { or ])
      const jsonLine = logs.find((l) => /^[\[{\]]/.test(l) && !l.startsWith("[script]"));
      expect(jsonLine).toBeDefined();
      const parsed = JSON.parse(jsonLine!);
      expect(Array.isArray(parsed)).toBe(true);
      expect(parsed.length).toBe(1); // Only homebridge is within 24h
      expect(parsed[0].repo).toBe("homebridge/homebridge");
      expect(parsed[0].tag).toBe("v1.8.0");
    } finally {
      console.log = origLog;
    }
  });

  test("returns empty array when no releases are recent", async () => {
    const oldDate = new Date(Date.now() - 72 * 3600 * 1000).toISOString();

    mockGitHubResponses({
      "homebridge/homebridge": { tag_name: "v1.8.0", published_at: oldDate },
    });

    const origLog = console.log;
    const logs: string[] = [];
    console.log = (...args: unknown[]) => logs.push(args.join(" "));

    try {
      const { main } = await import("./github-release");
      await main(["24"]);

      const jsonLine = logs.find((l) => /^[\[{\]]/.test(l) && !l.startsWith("[script]"));
      expect(jsonLine).toBeDefined();
      const parsed = JSON.parse(jsonLine!);
      expect(parsed).toEqual([]);
    } finally {
      console.log = origLog;
    }
  });

  test("handles all repos returning 404", async () => {
    mockGitHubResponses({
      "homebridge/homebridge": null,
      "n8n-io/n8n": null,
    });

    const origLog = console.log;
    const logs: string[] = [];
    console.log = (...args: unknown[]) => logs.push(args.join(" "));

    try {
      const { main } = await import("./github-release");
      await main(["24"]);

      const jsonLine = logs.find((l) => /^[\[{\]]/.test(l) && !l.startsWith("[script]"));
      expect(jsonLine).toBeDefined();
      const parsed = JSON.parse(jsonLine!);
      expect(parsed).toEqual([]);
    } finally {
      console.log = origLog;
    }
  });
});
