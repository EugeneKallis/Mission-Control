/**
 * Tests for sync-profiles.ts pure helpers.
 *
 * Tests the delayFingerprint canonicalization and tag-ID remapping
 * logic without any Arr API calls. The interactive readline path
 * (main()) is not driven in unit tests — it requires stdin + real
 * API credentials.
 */

import { describe, expect, test } from "bun:test";

// DelayProfile shape (subset of the full type from sync-profiles.ts)
interface DelayProfile {
  id: number;
  enable: boolean;
  order: number;
  tags: number[];
  preferredProtocol: string;
  usenetDelay: number;
  torrentDelay: number;
}

async function loadScript() {
  return (await import("./sync-profiles")) as typeof import("./sync-profiles");
}

describe("delayFingerprint", () => {
  test("same profile produces same fingerprint", async () => {
    const { delayFingerprint } = await loadScript();
    const profile: DelayProfile = {
      id: 1,
      enable: true,
      order: 1,
      tags: [5, 3, 8],
      preferredProtocol: "usenet",
      usenetDelay: 0,
      torrentDelay: 1440,
    };
    expect(delayFingerprint(profile)).toBe(delayFingerprint({ ...profile }));
  });

  test("tags are canonicalized by sorting, so order-independent matching works", async () => {
    const { delayFingerprint } = await loadScript();
    const a: DelayProfile = { id: 1, enable: true, order: 1, tags: [8, 3, 5], preferredProtocol: "usenet", usenetDelay: 0, torrentDelay: 1440 };
    const b: DelayProfile = { id: 2, enable: true, order: 1, tags: [3, 5, 8], preferredProtocol: "usenet", usenetDelay: 0, torrentDelay: 1440 };
    // Same set of tags, different order → same fingerprint
    expect(delayFingerprint(a)).toBe(delayFingerprint(b));
  });

  test("different enable state changes fingerprint", async () => {
    const { delayFingerprint } = await loadScript();
    const enabled: DelayProfile = { id: 1, enable: true, order: 1, tags: [], preferredProtocol: "usenet", usenetDelay: 0, torrentDelay: 1440 };
    const disabled: DelayProfile = { id: 2, enable: false, order: 1, tags: [], preferredProtocol: "usenet", usenetDelay: 0, torrentDelay: 1440 };
    expect(delayFingerprint(enabled)).not.toBe(delayFingerprint(disabled));
  });

  test("empty tags produce a predictable fingerprint", async () => {
    const { delayFingerprint } = await loadScript();
    const profile: DelayProfile = { id: 1, enable: true, order: 1, tags: [], preferredProtocol: "torrent", usenetDelay: 720, torrentDelay: 0 };
    expect(delayFingerprint(profile)).toMatch(/^true\|1\||\|torrent\|720\|0$/);
  });
});

describe("remapTagIds", () => {
  test("remaps master tag IDs to slave tag IDs by label", async () => {
    const { remapTagIds } = await loadScript();
    const masterLabelById = new Map<number, string>([
      [10, "anime"],
      [20, "4k"],
      [30, "kids"],
    ]);
    const tagIdByLabel = new Map<string, number>([
      ["anime", 110],
      ["4k", 120],
      ["kids", 130],
    ]);

    const result = remapTagIds([10, 20, 30], masterLabelById, tagIdByLabel);
    expect(result).toEqual([110, 120, 130]);
  });

  test("drops tags that exist on master but not on slave", async () => {
    const { remapTagIds } = await loadScript();
    const masterLabelById = new Map<number, string>([
      [10, "anime"],
      [20, "4k"],
      [30, "kids"],
    ]);
    const tagIdByLabel = new Map<string, number>([
      ["anime", 110],
      // "4k" missing on slave
      ["kids", 130],
    ]);

    const result = remapTagIds([10, 20, 30], masterLabelById, tagIdByLabel);
    expect(result).toEqual([110, 130]); // 20 ("4k") dropped
  });

  test("drops tags that exist on slave but not on master", async () => {
    const { remapTagIds } = await loadScript();
    const masterLabelById = new Map<number, string>([
      [10, "anime"],
      // "4k" and "kids" not on master
    ]);
    const tagIdByLabel = new Map<string, number>([
      ["anime", 110],
      ["4k", 120],
      ["kids", 130],
    ]);

    // Master can't provide labels for tags 20/30 → result omits them
    const result = remapTagIds([10, 20, 30], masterLabelById, tagIdByLabel);
    expect(result).toEqual([110]);
  });

  test("returns empty array when no tag IDs match", async () => {
    const { remapTagIds } = await loadScript();
    const masterLabelById = new Map<number, string>([[10, "anime"]]);
    const tagIdByLabel = new Map<string, number>([["other", 99]]);

    const result = remapTagIds([10], masterLabelById, tagIdByLabel);
    expect(result).toEqual([]);
  });

  test("handles empty input arrays", async () => {
    const { remapTagIds } = await loadScript();
    const masterLabelById = new Map<number, string>([[10, "anime"]]);
    const tagIdByLabel = new Map<string, number>([["anime", 110]]);

    expect(remapTagIds([], masterLabelById, tagIdByLabel)).toEqual([]);
    expect(remapTagIds([10], new Map(), tagIdByLabel)).toEqual([]);
    expect(remapTagIds([10], masterLabelById, new Map())).toEqual([]);
  });
});
