import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { makeTestDB, type TestDB } from "@/lib/db/test-helpers";
import { repairProjectJAVMagnets } from "./fix-projectjav-magnets";

const magnet = "magnet:?xt=urn:btih:29ca1178bf03028c80462970c39841bc350d3072&dn=Example&tr=udp%3A%2F%2Ftracker.example";
const escaped = magnet.replaceAll("&", "&amp;");
let target: TestDB;

beforeEach(async () => { target = await makeTestDB(); });
afterEach(async () => { await target.cleanup(); });

async function seed(source = "projectjav", link = escaped) {
  return target.db.scrapeResult.create({
    data: {
      source,
      title: "Example",
      magnetLink: link,
      uniqueKey: `${link}|${source === "projectjav" ? "" : source}`,
      createdAt: new Date("2026-06-30T03:30:22.970Z"),
      isHidden: true,
      isDownloaded: false,
      hiddenAt: new Date("2026-10-13T00:00:00.000Z"),
    },
  });
}

describe("repairProjectJAVMagnets", () => {
  test("dry-run reports escaped rows without changing them", async () => {
    const row = await seed();
    expect(await repairProjectJAVMagnets(target.db)).toBe(1);
    expect(await target.db.scrapeResult.findUnique({ where: { id: row.id } })).toEqual(row);
  });

  test("repairs links and keys, preserves state and other sources, and is idempotent", async () => {
    const row = await seed();
    const other = await seed("pornrips");
    expect(await repairProjectJAVMagnets(target.db, true)).toBe(1);
    expect(await target.db.scrapeResult.findUnique({ where: { id: row.id } })).toEqual({
      ...row, magnetLink: magnet, uniqueKey: `${magnet}|`,
    });
    expect(await target.db.scrapeResult.findUnique({ where: { id: other.id } })).toEqual(other);
    expect(await repairProjectJAVMagnets(target.db, true)).toBe(0);
    expect(await repairProjectJAVMagnets(target.db)).toBe(0);
  });

  test("unique-key conflicts leave every row unchanged", async () => {
    await seed();
    await seed("projectjav", magnet);
    await seed("projectjav", escaped.replace("Example", "Another"));
    const before = await target.db.scrapeResult.findMany({ orderBy: { id: "asc" } });
    await expect(repairProjectJAVMagnets(target.db, true)).rejects.toThrow();
    expect(await target.db.scrapeResult.findMany({ orderBy: { id: "asc" } })).toEqual(before);
  });
});
