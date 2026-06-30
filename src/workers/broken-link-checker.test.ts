/**
 * Unit tests for src/workers/broken-link-checker.ts.
 *
 * Strategy: mock @/lib/broken-link (so the probe is deterministic and
 * ffprobe-free) and @/lib/db/queries (so the worker talks to a
 * real in-file Prisma + libsql DB via makeTestDB). The remaining
 * orchestration (pick → mark checking → pool → set result) is
 * exercised end-to-end against a small seeded dataset.
 */
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  mock,
  test,
} from "bun:test";
import { makeTestDB, type TestDB } from "@/lib/db/test-helpers";

let testDB: TestDB;
let probeFileReadableMock: ReturnType<typeof mock>;
let discoverFilesMock: ReturnType<typeof mock>;

// ── Mock @/lib/broken-link so the test doesn't spawn ffprobe or walk the
//    real filesystem. We keep the rest of the module shape so future
//    imports from it don't break (e.g. `type FileCheckSeed`). ──────────────
const brokenLinkMockState = {
  probeFileReadable: (..._args: unknown[]) => probeFileReadableMock(..._args),
  discoverFiles: (..._args: unknown[]) => discoverFilesMock(..._args),
  isBrokenSymlink: async () => true,
  MEDIA_EXTS: new Set<string>(),
  DEFAULT_PROBE_TIMEOUT_S: 30,
  MIN_PACKETS_FOR_OK: 1,
  extOf: () => "",
  isMedia: () => false,
  toPosix: (p: string) => p,
};

mock.module("@/lib/broken-link", () => brokenLinkMockState);

beforeAll(async () => {
  testDB = await makeTestDB();
  // Install the mock DB into @/lib/db. The query helpers resolve
  // `db` lazily through this import, so all queries route here.
  mock.module("@/lib/db", () => ({ db: testDB.db }));
});

afterAll(async () => {
  await testDB.cleanup();
});

beforeEach(async () => {
  // Wipe FileCheck + settings between tests.
  await testDB.db.fileCheck.deleteMany();
  await testDB.db.setting.deleteMany();

  // Default probe: ok with packets.
  probeFileReadableMock = mock(async () => ({
    ok: true,
    packets: 10,
    elapsedMs: 5,
  }));
  // Default discover: no files (tests can override).
  discoverFilesMock = mock(async () => []);
});

async function loadWorker() {
  // Re-import so it picks up the mocked modules.
  return import(`./broken-link-checker?bust=${Date.now()}-${Math.random()}`);
}

const defaultOpts = {
  intervalSec: 60,
  batchSize: 5,
  concurrency: 2,
  timeoutSec: 30,
  recheckAgeDays: 7,
  discoverIntervalSec: 0,
  mediaDirs: [] as string[],
  forceDiscover: false,
};

async function seedRow(p: { filePath: string; status?: string; lastChecked?: Date | null }) {
  return testDB.db.fileCheck.create({
    data: {
      filePath: p.filePath,
      mediaDir: "special",
      status: p.status ?? "pending",
      lastChecked: p.lastChecked ?? null,
    },
  });
}

describe("pollOnce", () => {
  test("discovery: upserts each seed", async () => {
    discoverFilesMock = mock(async () => [
      { filePath: "/mnt/debrid/media/movies/a.mkv", mediaDir: "movies", symlinkTarget: "x", fileSize: 100 },
      { filePath: "/mnt/debrid/media/special/b.mp4", mediaDir: "special", symlinkTarget: "y", fileSize: 200 },
    ]);
    const { pollOnce } = await loadWorker();
    const result = await pollOnce({ ...defaultOpts, forceDiscover: true });
    expect(result.discovered).toBe(2);
    const rows = await testDB.db.fileCheck.findMany({ orderBy: { filePath: "asc" } });
    expect(rows).toHaveLength(2);
    expect(rows[0].filePath).toContain("a.mkv");
    expect(rows[1].filePath).toContain("b.mp4");
  });

  test("check: marks files checking → ok → updates lastChecked and counts", async () => {
    await seedRow({ filePath: "/m/a.mkv" });
    await seedRow({ filePath: "/m/b.mkv" });
    probeFileReadableMock = mock(async () => ({ ok: true, packets: 5, elapsedMs: 1 }));

    const { pollOnce } = await loadWorker();
    const result = await pollOnce(defaultOpts);

    expect(result.checked).toBe(2);
    expect(result.ok).toBe(2);
    expect(result.broken).toBe(0);
    const rows = await testDB.db.fileCheck.findMany({ orderBy: { filePath: "asc" } });
    for (const r of rows) {
      expect(r.status).toBe("ok");
      expect(r.checkCount).toBe(1);
      expect(r.lastChecked).not.toBeNull();
      expect(r.errorMessage).toBeNull();
    }
  });

  test("check: broken probe increments brokenCount and stores errorMessage", async () => {
    await seedRow({ filePath: "/m/broken.mkv" });
    probeFileReadableMock = mock(async () => ({
      ok: false,
      packets: 0,
      error: "Invalid data found",
      elapsedMs: 1,
    }));

    const { pollOnce } = await loadWorker();
    const result = await pollOnce(defaultOpts);

    expect(result.broken).toBe(1);
    expect(result.ok).toBe(0);
    const row = await testDB.db.fileCheck.findFirstOrThrow();
    expect(row.status).toBe("broken");
    expect(row.brokenCount).toBe(1);
    expect(row.errorMessage).toMatch(/Invalid data found/);
  });

  test("skips ignored rows", async () => {
    await seedRow({ filePath: "/m/ignored.mkv" });
    await testDB.db.fileCheck.update({
      where: { filePath: "/m/ignored.mkv" },
      data: { isIgnored: true },
    });
    const { pollOnce } = await loadWorker();
    const result = await pollOnce(defaultOpts);
    expect(result.checked).toBe(0);
    expect(probeFileReadableMock.mock.calls).toHaveLength(0);
  });

  test("skips rows that are within the recheck-age window", async () => {
    const recent = new Date(Date.now() - 1 * 24 * 60 * 60 * 1000); // 1 day ago
    await seedRow({
      filePath: "/m/recent.mkv",
      status: "ok",
      lastChecked: recent,
    });
    const { pollOnce } = await loadWorker();
    const result = await pollOnce({ ...defaultOpts, recheckAgeDays: 7 });
    expect(result.checked).toBe(0);
  });

  test("rechecks rows older than recheckAgeDays even if previously ok", async () => {
    const ancient = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    await seedRow({
      filePath: "/m/old.mkv",
      status: "ok",
      lastChecked: ancient,
    });
    const { pollOnce } = await loadWorker();
    const result = await pollOnce({ ...defaultOpts, recheckAgeDays: 7 });
    expect(result.checked).toBe(1);
  });

  test("does not pick rows currently in 'checking' state", async () => {
    await seedRow({ filePath: "/m/c.mkv", status: "checking" });
    const { pollOnce } = await loadWorker();
    const result = await pollOnce(defaultOpts);
    expect(result.checked).toBe(0);
  });

  test("respects batchSize", async () => {
    for (let i = 0; i < 10; i++) {
      await seedRow({ filePath: `/m/file-${i}.mkv` });
    }
    const { pollOnce } = await loadWorker();
    const result = await pollOnce({ ...defaultOpts, batchSize: 3 });
    expect(result.checked).toBe(3);
    // The rest are still pending.
    const remaining = await testDB.db.fileCheck.count({ where: { status: "pending" } });
    expect(remaining).toBe(7);
  });

  test("resetStaleChecking flips rows whose lastChecked is older than the grace", async () => {
    const ancient = new Date(Date.now() - 10 * 60 * 1000); // 10 min ago
    await seedRow({ filePath: "/m/stuck.mkv", status: "checking", lastChecked: ancient });
    const { pollOnce } = await loadWorker();
    await pollOnce({ ...defaultOpts, timeoutSec: 5 }); // grace = 5s + 30s = 35s
    const row = await testDB.db.fileCheck.findFirstOrThrow();
    // 10 min ago > 35s grace, so the row is reset to pending and then
    // immediately picked up + marked checking by this very pass.
    // The final state is therefore `checking` (in-flight) or `ok` (if the
    // probe ran). Either way it's not stuck on `checking` from the past.
    expect(["checking", "ok", "broken"]).toContain(row.status);
    expect(probeFileReadableMock.mock.calls).toHaveLength(1);
  });

  test("status: updates blfinder_status with the pass summary", async () => {
    await seedRow({ filePath: "/m/a.mkv" });
    probeFileReadableMock = mock(async () => ({ ok: false, packets: 0, error: "x", elapsedMs: 1 }));
    const { pollOnce } = await loadWorker();
    await pollOnce(defaultOpts);
    const row = await testDB.db.setting.findUniqueOrThrow({ where: { key: "blfinder_status" } });
    const body = JSON.parse(row.value!);
    expect(body.running).toBe(false);
    expect(body.processed).toBe(1);
    expect(body.broken).toBe(1);
    expect(body.ok).toBe(0);
    expect(body.lastPassAt).not.toBeNull();
  });

  test("returns immediately when enabled=false in config", async () => {
    await seedRow({ filePath: "/m/a.mkv" });
    // Set config to disabled.
    const configVal = JSON.stringify({ enabled: false, intervalSec: 60, batchSize: 5, concurrency: 2, timeoutSec: 30, recheckAgeDays: 7, discoverIntervalSec: 1800, mediaDirs: [] });
    await testDB.db.setting.create({
      data: { key: "blfinder_config", value: configVal },
    });
    const { pollOnce } = await loadWorker();
    const result = await pollOnce(defaultOpts);
    // No files were checked.
    expect(result.checked).toBe(0);
    expect(result.discovered).toBe(0);
    // The probe was never called.
    expect(probeFileReadableMock.mock.calls).toHaveLength(0);
  });
});
