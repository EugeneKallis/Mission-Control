/**
 * Unit tests for src/app/api/macros/[id]/commands/route.ts
 *
 * Tests the GET / POST / PUT / DELETE handlers for a macro's command array.
 * Commands are stored as a JSON string in macro.commands; the handlers
 * parse, mutate, and re-serialize.
 *
 * Note: there is a PUT handler as well that I missed in the plan — it
 * is for editing a command in place. Covered here.
 */

import { describe, test, expect, mock, beforeAll, afterAll, beforeEach } from "bun:test";
import { makeTestDB, type TestDB } from "@/lib/db/test-helpers";
import { jsonRequest, deleteRequest } from "@/test-utils/route-helpers";
import type { MacroCommand } from "@/types";

let testDB: TestDB;

beforeAll(async () => {
  testDB = await makeTestDB();
  mock.module("@/lib/db", () => ({ db: testDB.db }));
});

afterAll(async () => {
  await testDB.cleanup();
});

beforeEach(async () => {
  await testDB.db.history.deleteMany();
  await testDB.db.schedule.deleteMany();
  await testDB.db.scrapeResult.deleteMany();
  await testDB.db.macro.deleteMany();
  await testDB.db.macroGroup.deleteMany();
  await testDB.db.setting.deleteMany();
  await testDB.db.config.deleteMany();
  await testDB.db.serverAgent.deleteMany();
  await testDB.db.nzbFile.deleteMany();
  await testDB.db.debridFile.deleteMany();
});

async function loadRoute(suffix: string) {
  return import(`./route.ts?bust=${Date.now()}-${suffix}`);
}

const paramsFor = (id: string | number) => ({ params: Promise.resolve({ id: String(id) }) });

async function seedMacroWithCommands(commands: MacroCommand[]): Promise<{ id: number; commands: string }> {
  const m = await testDB.db.macro.create({
    data: { name: "m", commands: JSON.stringify(commands) },
  });
  return { id: m.id, commands: m.commands };
}

describe("GET /api/macros/[id]/commands", () => {
  test("returns the parsed commands array", async () => {
    const m = await seedMacroWithCommands([{ ord: 0, cmd: "echo a" }, { ord: 1, cmd: "echo b" }]);
    const { GET } = await loadRoute("get-ok");
    const res = await GET(jsonRequest(`/api/macros/${m.id}/commands`, {}), paramsFor(m.id));
    expect(res.status).toBe(200);
    const body = (await res.json()) as MacroCommand[];
    expect(body).toHaveLength(2);
    expect(body[0].cmd).toBe("echo a");
  });

  test("returns [] when commands is empty string", async () => {
    const m = await seedMacroWithCommands([]);
    const { GET } = await loadRoute("get-empty");
    const res = await GET(jsonRequest(`/api/macros/${m.id}/commands`, {}), paramsFor(m.id));
    expect(res.status).toBe(200);
    const body = (await res.json()) as MacroCommand[];
    expect(body).toEqual([]);
  });

  test("returns 404 when the macro does not exist", async () => {
    const { GET } = await loadRoute("get-404");
    const res = await GET(jsonRequest("/api/macros/9999/commands", {}), paramsFor(9999));
    expect(res.status).toBe(404);
  });
});

describe("POST /api/macros/[id]/commands", () => {
  test("appends a command with default ord = current length", async () => {
    const m = await seedMacroWithCommands([{ ord: 0, cmd: "first" }]);
    const { POST } = await loadRoute("post-append");
    const res = await POST(jsonRequest(`/api/macros/${m.id}/commands`, { cmd: "second" }), paramsFor(m.id));
    expect(res.status).toBe(201);
    const body = (await res.json()) as MacroCommand;
    expect(body.cmd).toBe("second");
    expect(body.ord).toBe(1);

    const stored = await testDB.db.macro.findUnique({ where: { id: m.id } });
    const cmds = JSON.parse(stored!.commands) as MacroCommand[];
    expect(cmds).toHaveLength(2);
    expect(cmds[1].cmd).toBe("second");
  });

  test("accepts an explicit ord and working_dir", async () => {
    const m = await seedMacroWithCommands([]);
    const { POST } = await loadRoute("post-full");
    const res = await POST(
      jsonRequest(`/api/macros/${m.id}/commands`, { cmd: "ls", ord: 5, working_dir: "/tmp" }),
      paramsFor(m.id),
    );
    expect(res.status).toBe(201);
    const body = (await res.json()) as MacroCommand;
    expect(body.ord).toBe(5);
    expect(body.cmd).toBe("ls");
    expect(body.working_dir).toBe("/tmp");
  });

  test("returns 400 when cmd is missing", async () => {
    const m = await seedMacroWithCommands([]);
    const { POST } = await loadRoute("post-missing");
    const res = await POST(jsonRequest(`/api/macros/${m.id}/commands`, {}), paramsFor(m.id));
    expect(res.status).toBe(400);
  });

  test("returns 400 on empty cmd", async () => {
    const m = await seedMacroWithCommands([]);
    const { POST } = await loadRoute("post-empty");
    const res = await POST(jsonRequest(`/api/macros/${m.id}/commands`, { cmd: "" }), paramsFor(m.id));
    expect(res.status).toBe(400);
  });
});

describe("PUT /api/macros/[id]/commands", () => {
  test("edits a command in place by index", async () => {
    const m = await seedMacroWithCommands([{ ord: 0, cmd: "old", working_dir: "/a" }]);
    const { PUT } = await loadRoute("put-edit");
    const res = await PUT(
      jsonRequest(`/api/macros/${m.id}/commands`, { index: 0, cmd: "new", working_dir: "/b" }),
      paramsFor(m.id),
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as MacroCommand;
    expect(body.cmd).toBe("new");
    expect(body.working_dir).toBe("/b");
  });

  test("returns 400 on out-of-range index", async () => {
    const m = await seedMacroWithCommands([{ ord: 0, cmd: "x" }]);
    const { PUT } = await loadRoute("put-oor");
    const res = await PUT(
      jsonRequest(`/api/macros/${m.id}/commands`, { index: 99, cmd: "y" }),
      paramsFor(m.id),
    );
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe("Invalid command index");
  });

  test("returns 400 on negative index", async () => {
    const m = await seedMacroWithCommands([{ ord: 0, cmd: "x" }]);
    const { PUT } = await loadRoute("put-neg");
    const res = await PUT(
      jsonRequest(`/api/macros/${m.id}/commands`, { index: -1, cmd: "y" }),
      paramsFor(m.id),
    );
    expect(res.status).toBe(400);
  });

  test("returns 400 on validation failure (empty cmd)", async () => {
    const m = await seedMacroWithCommands([{ ord: 0, cmd: "x" }]);
    const { PUT } = await loadRoute("put-bad");
    const res = await PUT(
      jsonRequest(`/api/macros/${m.id}/commands`, { index: 0, cmd: "" }),
      paramsFor(m.id),
    );
    expect(res.status).toBe(400);
  });
});

describe("DELETE /api/macros/[id]/commands", () => {
  test("removes a command by ?index= and re-indexes", async () => {
    const m = await seedMacroWithCommands([
      { ord: 0, cmd: "a" },
      { ord: 1, cmd: "b" },
      { ord: 2, cmd: "c" },
    ]);
    const { DELETE } = await loadRoute("del-ok");
    // DELETE reads index from query string
    const res = await DELETE(
      deleteRequest(`/api/macros/${m.id}/commands?index=1`),
      paramsFor(m.id),
    );
    expect(res.status).toBe(200);
    const stored = await testDB.db.macro.findUnique({ where: { id: m.id } });
    const cmds = JSON.parse(stored!.commands) as MacroCommand[];
    expect(cmds.map((c) => c.cmd)).toEqual(["a", "c"]);
    expect(cmds.map((c) => c.ord)).toEqual([0, 1]);
  });

  test("returns 400 on missing or invalid index", async () => {
    const m = await seedMacroWithCommands([{ ord: 0, cmd: "a" }]);
    const { DELETE } = await loadRoute("del-bad");
    const res = await DELETE(
      deleteRequest(`/api/macros/${m.id}/commands?index=abc`),
      paramsFor(m.id),
    );
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe("Invalid command index");
  });

  test("returns 400 on out-of-range index", async () => {
    const m = await seedMacroWithCommands([{ ord: 0, cmd: "a" }]);
    const { DELETE } = await loadRoute("del-oor");
    const res = await DELETE(
      deleteRequest(`/api/macros/${m.id}/commands?index=10`),
      paramsFor(m.id),
    );
    expect(res.status).toBe(400);
  });
});
