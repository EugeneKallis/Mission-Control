import { afterEach, beforeEach, expect, test } from "bun:test";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";
import { pollOnce } from "./zurg-queue-cleaner";

let root: string;

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), "zurg-queue-"));
});

afterEach(async () => {
  await rm(root, { recursive: true, force: true });
});

test("retains incomplete and invisible completed jobs", async () => {
  const removed: string[] = [];
  const client = { listTorrents: async () => [
    { hash: "incomplete", name: "a", category: "special", state: "downloading", content_path: "/all/a" },
    { hash: "missing", name: "b", category: "special", state: "pausedUP", content_path: "/all/b" },
  ], removeTorrent: async (hash: string) => { removed.push(hash); } };
  await pollOnce(client, root);
  expect(removed).toEqual([]);
});

test("removes visible completed jobs, retains their files, and continues after one failure", async () => {
  await mkdir(join(root, "good"), { recursive: true });
  await mkdir(join(root, "later"), { recursive: true });
  await writeFile(join(root, "good", "marker"), "first");
  await writeFile(join(root, "later", "marker"), "second");
  const removed: string[] = [];
  const client = {
    listTorrents: async () => [
      { hash: "bad", name: "bad", category: "special", state: "pausedUP", content_path: "/all/good" },
      { hash: "good", name: "good", category: "special", state: "pausedUP", content_path: "/all/later" },
    ],
    removeTorrent: async (hash: string) => {
      if (hash === "bad") throw new Error("boom");
      removed.push(hash);
    },
  };
  await pollOnce(client, root);
  expect(removed).toEqual(["good"]);
  expect(await readFile(join(root, "good", "marker"), "utf8")).toBe("first");
  expect(await readFile(join(root, "later", "marker"), "utf8")).toBe("second");
});
