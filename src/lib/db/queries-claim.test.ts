import { afterAll, beforeAll, describe, expect, mock, test } from "bun:test";
import { makeTestDB, type TestDB } from "./test-helpers";

let testDB: TestDB;
let claimInternalMacro: (id: number) => Promise<"normal" | "claimed" | "consumed">;

beforeAll(async () => {
  testDB = await makeTestDB();
  mock.module("@/lib/db", () => ({ db: testDB.db }));
  ({ claimInternalMacro } = await import(`./queries?bust=${Date.now()}`));
});

afterAll(async () => {
  await testDB.cleanup();
});

describe("claimInternalMacro", () => {
  test("atomically allows exactly one claim for a generated action", async () => {
    const internal = await testDB.db.macro.create({
      data: { name: "prepared restart", isInternal: true },
    });

    const claims = await Promise.all([
      claimInternalMacro(internal.id),
      claimInternalMacro(internal.id),
    ]);
    expect(claims.filter((claim) => claim === "claimed")).toHaveLength(1);
    expect(claims.filter((claim) => claim === "consumed")).toHaveLength(1);
    expect((await testDB.db.macro.findUniqueOrThrow({ where: { id: internal.id } })).isConsumed).toBe(true);
  });

  test("leaves normal macros repeatable", async () => {
    const normal = await testDB.db.macro.create({ data: { name: "normal" } });
    expect(await claimInternalMacro(normal.id)).toBe("normal");
    expect((await testDB.db.macro.findUniqueOrThrow({ where: { id: normal.id } })).isConsumed).toBe(false);
  });
});
