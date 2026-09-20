import { afterAll, beforeAll, beforeEach, describe, expect, mock, test } from "bun:test";
import { makeTestDB, type TestDB } from "@/lib/db/test-helpers";

let testDB: TestDB;

beforeAll(async () => {
  testDB = await makeTestDB();
  mock.module("@/lib/db", () => ({ db: testDB.db }));
});

beforeEach(async () => {
  await testDB.db.setting.deleteMany({ where: { key: "media_dependency:incident" } });
});

afterAll(async () => {
  await testDB.cleanup();
});

async function loadModule() {
  return import(`./media-dependency-breaker?bust=${Date.now()}-${Math.random()}`);
}

const healthy = [
  { id: "zurg", name: "Zurg", ok: true, detail: "HTTP 200" },
  { id: "nzbdav", name: "NZBDav", ok: true, detail: "Mounted" },
  { id: "nfs", name: "NFS media", ok: true, detail: "Mounted" },
  { id: "zurg-mount", name: "Zurg mount", ok: true, detail: "Mounted" },
] as const;

describe("media dependency circuit breaker", () => {
  test("records one shared incident and preserves its start across failures", async () => {
    const { checkMediaDependencies, getMediaDependencyIncident } = await loadModule();
    const failed = healthy.map((probe) => probe.id === "nfs" ? { ...probe, ok: false, detail: "Mount unavailable" } : probe);

    const first = await checkMediaDependencies([...failed], new Date("2026-01-01T00:00:00Z"));
    const second = await checkMediaDependencies([...failed], new Date("2026-01-01T00:01:00Z"));

    expect(first.allowed).toBe(false);
    expect(second.allowed).toBe(false);
    expect(second.incident?.startedAt).toBe("2026-01-01T00:00:00.000Z");
    expect(second.incident?.failures).toEqual([{ id: "nfs", name: "NFS media", detail: "Mount unavailable" }]);
    expect((await getMediaDependencyIncident())?.status).toBe("open");
    expect(await testDB.db.setting.count({ where: { key: "media_dependency:incident" } })).toBe(1);
  });

  test("requires two consecutive healthy checks before processing resumes", async () => {
    const { checkMediaDependencies } = await loadModule();
    const failed = healthy.map((probe) => probe.id === "zurg-mount" ? { ...probe, ok: false } : probe);

    await checkMediaDependencies([...failed], new Date("2026-01-01T00:00:00Z"));
    const recovering = await checkMediaDependencies([...healthy], new Date("2026-01-01T00:01:00Z"));
    const recovered = await checkMediaDependencies([...healthy], new Date("2026-01-01T00:02:00Z"));

    expect(recovering.allowed).toBe(false);
    expect(recovering.incident?.consecutiveSuccesses).toBe(1);
    expect(recovered.allowed).toBe(true);
    expect(recovered.incident).toMatchObject({ status: "resolved", consecutiveSuccesses: 2, failures: [] });
  });

  test("a failure resets the recovery streak", async () => {
    const { checkMediaDependencies } = await loadModule();
    const failed = healthy.map((probe) => probe.id === "nzbdav" ? { ...probe, ok: false } : probe);

    await checkMediaDependencies([...failed]);
    await checkMediaDependencies([...healthy]);
    const reopened = await checkMediaDependencies([...failed]);
    const recovering = await checkMediaDependencies([...healthy]);

    expect(reopened.incident?.consecutiveSuccesses).toBe(0);
    expect(recovering.allowed).toBe(false);
    expect(recovering.incident?.consecutiveSuccesses).toBe(1);
  });

  test("finds the deepest mount covering a dependency path", async () => {
    const { findMountForPath } = await loadModule();
    const mountInfo = [
      "1 0 0:1 / / rw - ext4 /dev/root rw",
      "2 1 0:2 / /mnt/debrid rw - nfs 192.168.1.99:/media rw",
      "3 1 0:3 / /mnt/addons/debrid rw - fuse.rclone rclone rw",
      "4 1 0:4 / /mnt/zurg rw - fuse.zurg zurg rw",
    ].join("\n");

    expect(findMountForPath(mountInfo, "/mnt/zurg/special")).toBe("/mnt/zurg");
    expect(findMountForPath(mountInfo, "/tmp")).toBe("/");
  });
});
