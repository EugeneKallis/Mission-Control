import { afterAll, beforeAll, expect, mock, test } from "bun:test";

const originalSleep = Bun.sleep;
let configured = false;
let resolveCalls = 0;
const clientKeys: string[] = [];
const warnings: string[] = [];

beforeAll(() => {
  mock.module("@/lib/config", () => ({
    resolveConfig: async () => {
      resolveCalls++;
      return {
        zurgUrl: "http://zurg",
        zurgApiKey: configured ? "saved-key" : "",
        specialMediaPath: "/mnt/zurg/special",
      };
    },
  }));

  mock.module("@/lib/clients/zurg", () => ({
    ZurgClient: class {
      constructor(_url: string, private readonly apiKey: string) {
        clientKeys.push(apiKey);
      }

      async listTorrents() {
        if (!this.apiKey) throw new Error("Zurg API key is not configured");
        return [];
      }

      async removeTorrent() {}
    },
  }));

  mock.module("../../scripts/_lib/cli", () => ({
    parseArgs: () => ({ once: false, interval: 0, category: "special" }),
  }));

  mock.module("../../scripts/_lib/log", () => ({
    banner: () => {},
    info: () => {},
    warn: (message: string) => warnings.push(message),
  }));
});

afterAll(() => {
  Bun.sleep = originalSleep;
});

test("reloads a Zurg API key saved while the worker is running", async () => {
  let sleeps = 0;
  Bun.sleep = (async () => {
    sleeps++;
    if (sleeps === 1) {
      configured = true;
      return;
    }
    throw new Error("stop polling");
  }) as typeof Bun.sleep;

  // Import after registering module mocks so the worker uses this test's dependencies.
  const { main } = await import(`./zurg-queue-cleaner?bust=${Date.now()}`);
  await expect(main()).rejects.toThrow("stop polling");

  expect(resolveCalls).toBe(2);
  expect(clientKeys).toEqual(["", "saved-key"]);
  expect(warnings.filter((message) => message.includes("API key is not configured"))).toHaveLength(1);
});
