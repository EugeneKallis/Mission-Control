import { describe, expect, test } from "bun:test";
import { ARR_DRIFT_CATEGORIES, compareArrSnapshots } from "./arr-drift";

function snapshot() {
  return Object.fromEntries(ARR_DRIFT_CATEGORIES.map((category) => [category, []])) as Record<(typeof ARR_DRIFT_CATEGORIES)[number], unknown>;
}

describe("compareArrSnapshots", () => {
  test("reports only semantic differences with native settings links", () => {
    const baseline = snapshot();
    const current = snapshot();
    baseline.tags = [{ name: "anime" }, { name: "kids" }];
    current.tags = [{ name: "anime" }, { name: "4k" }];
    baseline.rootFolders = [{ name: "/media/movies", path: "/media/movies" }];
    current.rootFolders = [{ name: "/media/anime", path: "/media/anime" }];

    expect(compareArrSnapshots(baseline, current, "http://radarr/")).toEqual([
      {
        category: "rootFolders",
        label: "Root folders",
        detail: "Missing: /media/movies · Extra: /media/anime",
        href: "http://radarr/settings/mediamanagement",
      },
      {
        category: "tags",
        label: "Tags",
        detail: "Missing: kids · Extra: 4k",
        href: "http://radarr/settings/tags",
      },
    ]);
  });

  test("ignores array order and API object ids", () => {
    const baseline = snapshot();
    const current = snapshot();
    baseline.qualityProfiles = [{ id: 1, name: "HD" }, { id: 2, name: "Any" }];
    current.qualityProfiles = [{ id: 99, name: "Any" }, { id: 88, name: "HD" }];

    expect(compareArrSnapshots(baseline, current, "http://sonarr")).toEqual([]);
  });
});
