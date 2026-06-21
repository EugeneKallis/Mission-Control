/**
 * Unit tests for the pure parseTargets helper in src/workers/scraper-runner.ts.
 *
 * The scraper-runner is a small orchestrator that runs all three
 * sources (or a CLI-provided subset) sequentially. The only piece
 * worth unit-testing is the argv parser, which is exposed for tests
 * via `__parseTargets`.
 */

import { describe, test, expect } from "bun:test";
import { __parseTargets } from "./scraper-runner";

describe("__parseTargets", () => {
  // parseTargets expects argv shaped like process.argv: [bun, scriptPath, ...userArgs].
  // The function calls argv.slice(2) to drop the bun + script entries.

  test("with no user args, returns every source", () => {
    expect(__parseTargets(["bun", "scraper-runner.ts"])).toEqual([
      "141jav",
      "projectjav",
      "pornrips",
    ]);
  });

  test("with a single valid source, returns just that one", () => {
    expect(__parseTargets(["bun", "scraper-runner.ts", "141jav"])).toEqual([
      "141jav",
    ]);
  });

  test("with multiple valid sources, preserves their order", () => {
    expect(
      __parseTargets(["bun", "scraper-runner.ts", "pornrips", "141jav"]),
    ).toEqual(["pornrips", "141jav"]);
  });

  test("drops unknown source names", () => {
    expect(
      __parseTargets([
        "bun",
        "scraper-runner.ts",
        "141jav",
        "garbage",
        "projectjav",
        "more-junk",
      ]),
    ).toEqual(["141jav", "projectjav"]);
  });

  test("all-unknown args yields an empty list", () => {
    expect(__parseTargets(["bun", "scraper-runner.ts", "xxx", "yyy"])).toEqual([]);
  });
});
