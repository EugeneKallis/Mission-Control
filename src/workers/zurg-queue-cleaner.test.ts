import { afterEach, beforeEach, expect, test } from "bun:test";
import { access, mkdir, mkdtemp, readFile, rm, writeFile } from "fs/promises";
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

test("retains incomplete and missing completed jobs", async () => {
  const incompletePath = join(root, "__all__", "a");
  await mkdir(incompletePath, { recursive: true });
  const specialPath = join(root, "special");
  const removed: string[] = [];
  const client = { listTorrents: async () => [
    { hash: "incomplete", name: "a", category: "special", state: "downloading", content_path: incompletePath },
    { hash: "missing", name: "b", category: "special", state: "pausedUP", content_path: join(root, "__all__", "b") },
  ], removeTorrent: async (hash: string) => { removed.push(hash); } };
  await pollOnce(client, specialPath);
  expect(removed).toEqual([]);
  await access(incompletePath);
});

test("moves each completed directory from content_path before clearing its queue entry", async () => {
  const allPath = join(root, "__all__");
  const specialPath = join(root, "special");
  const firstPath = join(allPath, "ABF-358");
  const secondPath = join(allPath, "later");
  await mkdir(firstPath, { recursive: true });
  await mkdir(secondPath, { recursive: true });
  await writeFile(join(firstPath, "marker"), "first");
  await writeFile(join(secondPath, "marker"), "second");
  const removed: string[] = [];
  const client = {
    listTorrents: async () => [
      { hash: "bad", name: "bad", category: "special", state: "pausedUP", content_path: firstPath },
      { hash: "good", name: "good", category: "special", state: "pausedUP", content_path: secondPath },
    ],
    removeTorrent: async (hash: string) => {
      if (hash === "bad") throw new Error("boom");
      removed.push(hash);
    },
  };
  await pollOnce(client, specialPath);
  expect(removed).toEqual(["good"]);
  await expect(access(firstPath)).rejects.toThrow();
  await expect(access(secondPath)).rejects.toThrow();
  expect(await readFile(join(specialPath, "ABF-358", "marker"), "utf8")).toBe("first");
  expect(await readFile(join(specialPath, "later", "marker"), "utf8")).toBe("second");
});
