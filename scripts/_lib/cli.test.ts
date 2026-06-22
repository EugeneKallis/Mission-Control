/**
 * Tests for the shared CLI arg parser.
 * Run with `bun test` from the project root.
 */

import { describe, expect, test } from "bun:test";
import { parseArgs } from "./cli";

describe("parseArgs", () => {
  const schema = {
    dryRun: { type: "boolean" as const, default: false },
    limit: { type: "number" as const, default: 50 },
    workers: { type: "number" as const, default: 4 },
    watchDir: { type: "string" as const, alias: "w" },
  };

  test("applies defaults when no flags are passed", () => {
    const args = parseArgs(schema, []);
    expect(args.dryRun).toBe(false);
    expect(args.limit).toBe(50);
    expect(args.workers).toBe(4);
    expect(args.watchDir).toBe("");
    expect(args._).toEqual([]);
  });

  test("parses --key value form", () => {
    const args = parseArgs(schema, ["--limit", "10", "--watch-dir", "/tmp/dir"]);
    expect(args.limit).toBe(10);
    expect(args.watchDir).toBe("/tmp/dir");
  });

  test("parses --key=value form", () => {
    const args = parseArgs(schema, ["--limit=25", "--dry-run=true"]);
    expect(args.limit).toBe(25);
    expect(args.dryRun).toBe(true);
  });

  test("parses short aliases", () => {
    const args = parseArgs(schema, ["-w", "/var/watch", "--dry-run"]);
    expect(args.watchDir).toBe("/var/watch");
    expect(args.dryRun).toBe(true);
  });

  test("captures positional args", () => {
    const args = parseArgs(schema, ["positional1", "--limit", "5", "positional2"]);
    expect(args._).toEqual(["positional1", "positional2"]);
    expect(args.limit).toBe(5);
  });

  test("rejects unknown flags", () => {
    expect(() => parseArgs(schema, ["--unknown"])).toThrow(/Unknown flag/);
  });

  test("rejects non-numeric --limit", () => {
    expect(() => parseArgs(schema, ["--limit", "abc"])).toThrow(/expects number/);
  });

  test("rejects string flag without a value", () => {
    expect(() => parseArgs(schema, ["--watch-dir"])).toThrow(/requires a value/);
  });

  test("accepts boolean true/false/1/0", () => {
    expect(parseArgs(schema, ["--dry-run=true"]).dryRun).toBe(true);
    expect(parseArgs(schema, ["--dry-run=false"]).dryRun).toBe(false);
    expect(parseArgs(schema, ["--dry-run=1"]).dryRun).toBe(true);
    expect(parseArgs(schema, ["--dry-run=0"]).dryRun).toBe(false);
  });

  test("--no-flag negates a boolean flag", () => {
    expect(parseArgs(schema, ["--no-dry-run"]).dryRun).toBe(false);
    expect(parseArgs(schema, ["--no-dry-run", "--limit", "3"]).dryRun).toBe(false);
    expect(parseArgs(schema, ["--no-dry-run"]).limit).toBe(50);
  });

  test("--no-flag works with the kebab form", () => {
    // schema has `dryRun`; --no-dry-run should still match via kebab→camel.
    expect(parseArgs(schema, ["--no-dry-run"]).dryRun).toBe(false);
  });

  test("--no-flag rejects non-boolean targets", () => {
    expect(() => parseArgs(schema, ["--no-limit"])).toThrow(/only valid for boolean/);
  });

  test("--no-flag for an unknown flag still throws Unknown flag", () => {
    expect(() => parseArgs(schema, ["--no-banana"])).toThrow(/Unknown flag/);
  });

  test("resolves a short alias (e.g. -f → foo)", () => {
    const local = {
      foo: { type: "string" as const, alias: "f" },
    };
    expect(parseArgs(local, ["-f", "bar"]).foo).toBe("bar");
  });

  test("resolves a long alias (e.g. --foo-bar → fooBar)", () => {
    const local = {
      fooBar: { type: "string" as const, alias: "foo-bar" },
    };
    expect(parseArgs(local, ["--foo-bar", "baz"]).fooBar).toBe("baz");
  });

  test("resolves a long alias when the schema stores it in camelCase (e.g. --media-path → mediaBasePath)", () => {
    // Real-world shape from debrid-cleaner: the canonical key is
    // camelCase (`mediaBasePath`) and the alias is the kebab form's
    // camelCase (`mediaPath`). The user types the kebab form
    // (`--media-path`) and we should still resolve to the canonical
    // key.
    const local = {
      mediaBasePath: { type: "string" as const, alias: "mediaPath" },
    };
    expect(parseArgs(local, ["--media-path", "/custom/media"]).mediaBasePath).toBe(
      "/custom/media",
    );
  });
});
