/**
 * Test helpers for the DB integration tests.
 *
 * The Prisma 7 + libsql stack in src/lib/db/index.ts is a module-level
 * singleton pointed at the dev DB. Tests don't want to talk to that
 * singleton (it would pollute the dev DB) and they don't want a separate
 * dev DB just for tests. So this helper:
 *
 *   1. Creates a fresh temp-file SQLite database.
 *   2. Runs the Prisma migration SQL against it.
 *   3. Returns a Prisma client that talks to that file.
 *
 * The test file then uses `mock.module("@/lib/db", ...)` to inject this
 * client into the queries module.
 */

import { PrismaClient } from "@prisma/client";
import { PrismaLibSql } from "@prisma/adapter-libsql";
import { readFile, readdir, unlink } from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";
import { createHash } from "crypto";

let counter = 0;

export interface TestDB {
  db: PrismaClient;
  cleanup: () => Promise<void>;
  filePath: string;
}

export async function makeTestDB(): Promise<TestDB> {
  // Use a unique temp file per test to avoid collisions across
  // parallel test runs.
  const id = `${process.pid}-${Date.now()}-${counter++}-${createHash("sha1")
    .update(Math.random().toString())
    .digest("hex")
    .slice(0, 8)}`;
  const filePath = join(tmpdir(), `mc-test-${id}.db`);
  const url = `file:${filePath}`;

  const db = new PrismaClient({ adapter: new PrismaLibSql({ url }) });

  // Apply ALL migrations in order, not just the init one. New migrations
  // (e.g. the blfinder fields on file_checks) would otherwise be invisible
  // to test DBs and the columns would be missing when tests run.
  const migrationsRoot = join(process.cwd(), "prisma", "migrations");
  let migrationDirs: string[];
  try {
    migrationDirs = (await readdir(migrationsRoot, { withFileTypes: true }))
      .filter((d) => d.isDirectory())
      .map((d) => d.name)
      .sort();
  } catch {
    migrationDirs = [];
  }

  for (const dir of migrationDirs) {
    const migrationPath = join(migrationsRoot, dir, "migration.sql");
    let raw: string;
    try {
      raw = await readFile(migrationPath, "utf8");
    } catch {
      continue;
    }
    // Strip line comments, then split on `;`. Migrations in this repo use
    // simple `;\n\n` separation (no Prisma `--> statement-breakpoint`
    // markers), so splitting on `;` is sufficient. We also strip `-- ...`
    // line comments because libsql doesn't always accept them in the
    // middle of multi-statement scripts.
    const noComments = raw
      .split("\n")
      .filter((line) => !line.trim().startsWith("--"))
      .join("\n");
    const statements = noComments
      .split(";")
      .map((s) => s.trim())
      .filter((s) => s.length > 0);

    for (const stmt of statements) {
      await db.$executeRawUnsafe(stmt);
    }
  }

  return {
    db,
    filePath,
    cleanup: async () => {
      await db.$disconnect();
      await unlink(filePath).catch(() => {});
    },
  };
}
