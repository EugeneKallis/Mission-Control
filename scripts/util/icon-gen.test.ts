/**
 * Tests for icon-gen.
 *
 * Verifies that dry-run mode (no --run) only validates the source
 * argument and lists targets without importing sharp or writing files.
 * Live mode (--run) invokes sharp and is exercised on the server.
 *
 * Tests that trigger process.exit() (no source arg, missing sharp)
 * are skipped because bun test workers terminate on process.exit.
 */

import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";

beforeEach(() => {
  mock.restore();
});

afterEach(() => {
  mock.restore();
});

async function loadScript() {
  const stamp = Date.now() + Math.random();
  return (await import(`./icon-gen?bust=${stamp}`)) as typeof import("./icon-gen");
}

describe("icon-gen", () => {
  test("dry-run mode lists targets without importing sharp", async () => {
    const script = await loadScript();

    // `sharp` is not installed in the test environment. Resolving proves
    // the default path returns before the dynamic import or file writes.
    await expect(script.main(["./logo.png"])).resolves.toBeUndefined();
  });
});
