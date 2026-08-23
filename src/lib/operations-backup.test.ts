import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";
import { mkdtemp, readdir, rm } from "node:fs/promises";
import { join } from "node:path";
import { makeTestDB, type TestDB } from "@/lib/db/test-helpers";

let testDB: TestDB;
let backupRoot: string;
let originalDatabaseUrl: string | undefined;

beforeEach(async () => {
  testDB = await makeTestDB();
  backupRoot = await mkdtemp(join(process.cwd(), ".operations-backup-test-"));
  originalDatabaseUrl = process.env.DATABASE_URL;
  process.env.DATABASE_URL = `file:${testDB.filePath}`;
  mock.module("@/lib/db", () => ({ db: testDB.db }));
});

afterEach(async () => {
  if (originalDatabaseUrl === undefined) delete process.env.DATABASE_URL;
  else process.env.DATABASE_URL = originalDatabaseUrl;
  await testDB.cleanup();
  await rm(backupRoot, { recursive: true, force: true });
  mock.restore();
});

describe("database backup", () => {
  test("creates and independently verifies a consistent SQLite copy", async () => {
    await testDB.db.setting.create({ data: { key: "proof", value: "present" } });
    const operations = await import(`./operations.ts?backup=${Date.now()}-${Math.random()}`);
    await operations.saveOperationsConfig({ backupDir: backupRoot, backupRetention: 2, githubRepos: [] });

    const result = await operations.createDatabaseBackup();

    expect(result.integrity).toBe("ok");
    expect(result.foreignKeyErrors).toBe(0);
    expect(result.size).toBeGreaterThan(0);
    expect((await readdir(backupRoot))).toEqual([result.name]);
  });

  test("retains only the configured number of newest copies", async () => {
    const operations = await import(`./operations.ts?retention=${Date.now()}-${Math.random()}`);
    await operations.saveOperationsConfig({ backupDir: backupRoot, backupRetention: 2, githubRepos: [] });

    await operations.createDatabaseBackup();
    await Bun.sleep(5);
    await operations.createDatabaseBackup();
    await Bun.sleep(5);
    await operations.createDatabaseBackup();

    expect((await readdir(backupRoot)).length).toBe(2);
  });
});
