/**
 * Prisma client singleton for use across the app.
 *
 * Prisma 7 requires a driver adapter. We use `@prisma/adapter-libsql` with
 * `@libsql/client` for the SQLite datasource. libsql is a wire-compatible
 * SQLite fork that runs natively in both Node.js and Bun, which lets the
 * web server (Node) and the scraper/file-scanner workers (Bun) share the
 * same Prisma client code path.
 *
 * The database URL is read from `prisma.config.ts` (Prisma 7 moved
 * datasource config out of the schema and into the config file) and
 * re-read here for the client adapter. If the env var is missing, fall
 * back to the local dev DB.
 */

import { PrismaClient } from "@prisma/client";
import { PrismaLibSql } from "@prisma/adapter-libsql";

const DEFAULT_DB_URL = "file:./prisma/dev.db";

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

function makeClient(): PrismaClient {
  const url = process.env.DATABASE_URL || DEFAULT_DB_URL;
  // The Prisma libsql adapter accepts a config object directly — it
  // instantiates the libsql client internally.
  //
  // `timeout` sets SQLite's busy_timeout (ms) so concurrent requests don't
  // immediately fail with SQLITE_BUSY. The Prisma adapter maps SQLITE_BUSY
  // to SocketTimeout / P1008, which surfaces as "Operation has timed out".
  // 10 seconds gives enough headroom for brief lock contention on a local
  // SQLite file in a multi-request server environment.
  const adapter = new PrismaLibSql({ url, timeout: 10_000 });
  return new PrismaClient({ adapter });
}

export const db: PrismaClient = globalForPrisma.prisma ?? makeClient();

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = db;
}
