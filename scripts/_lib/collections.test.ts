/**
 * Tests for the shared collection helpers.
 */

import { describe, expect, test } from "bun:test";
import { chunk, groupBy, sortByPriority } from "./collections";

describe("sortByPriority", () => {
  const PRIORITY = ["Main", "Kids", "4K"];

  test("orders items per the priority list", () => {
    const input = [
      { name: "4K" },
      { name: "Main" },
      { name: "Kids" },
    ];
    expect(sortByPriority(input, PRIORITY).map((i) => i.name)).toEqual([
      "Main",
      "Kids",
      "4K",
    ]);
  });

  test("names not in the priority list sort to the end", () => {
    const input = [
      { name: "Anime" },
      { name: "Main" },
      { name: "Local" },
    ];
    const sorted = sortByPriority(input, PRIORITY);
    expect(sorted[0].name).toBe("Main");
    // Anime and Local relative order is preserved (both have MAX_SAFE_INTEGER).
    expect(sorted.slice(1).map((i) => i.name).sort()).toEqual(["Anime", "Local"]);
  });

  test("does not mutate the input", () => {
    const input = [{ name: "4K" }, { name: "Main" }];
    const before = input.map((i) => i.name).join(",");
    sortByPriority(input, PRIORITY);
    expect(input.map((i) => i.name).join(",")).toBe(before);
  });
});

describe("chunk", () => {
  test("splits into evenly-sized pieces", () => {
    expect(chunk([1, 2, 3, 4, 5, 6], 2)).toEqual([[1, 2], [3, 4], [5, 6]]);
  });

  test("last chunk is shorter when the input does not divide evenly", () => {
    expect(chunk([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]]);
  });

  test("returns an empty array for empty input", () => {
    expect(chunk([], 3)).toEqual([]);
  });

  test("rejects non-positive size", () => {
    expect(() => chunk([1], 0)).toThrow();
    expect(() => chunk([1], -1)).toThrow();
  });
});

describe("groupBy", () => {
  test("groups by the given key extractor", () => {
    const items = [
      { id: 1, season: 1 },
      { id: 2, season: 2 },
      { id: 3, season: 1 },
    ];
    const out = groupBy(items, (i) => i.season);
    expect(out.get(1)?.length).toBe(2);
    expect(out.get(2)?.length).toBe(1);
  });

  test("returns an empty map for empty input", () => {
    expect(groupBy([], (i: number) => i).size).toBe(0);
  });
});
