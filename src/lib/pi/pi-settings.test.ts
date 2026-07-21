/**
 * Tests for src/lib/pi/pi-settings.ts
 *
 * Covers:
 *  - Built-in tool catalog
 *  - Skill discovery (path scanning, frontmatter parsing)
 *  - Persisted settings (get/set/toggle via DB)
 *  - Full resource state snapshot
 */

import { describe, test, expect, beforeAll, afterAll, beforeEach, afterEach, mock } from "bun:test";
import { makeTestDB, type TestDB } from "@/lib/db/test-helpers";
import type { ResourceState } from "./pi-settings";

// Mock the DB module so our settings use the test database
let testDB: TestDB;

beforeAll(async () => {
  testDB = await makeTestDB();
  mock.module("@/lib/db", () => ({ db: testDB.db }));
});

afterAll(async () => {
  await testDB.cleanup();
});

// Use dynamic imports so the mock applies before the module loads
let settings: typeof import("./pi-settings");

beforeEach(async () => {
  // Clean the settings table
  await testDB.db.setting.deleteMany();
  // Re-import to get fresh state
  settings = await import(`./pi-settings?bust=${Date.now()}`);
});

// ── Tool catalog ────────────────────────────────────────────────────────────

describe("BUILTIN_TOOLS", () => {
  test("contains all expected tools", () => {
    const names = settings.BUILTIN_TOOLS.map((t) => t.name).sort();
    expect(names).toEqual(["bash", "edit", "find", "grep", "ls", "read", "write"]);
  });

  test("bash and edit and write are marked dangerous", () => {
    const dangerous = settings.BUILTIN_TOOLS.filter((t) => t.dangerous).map((t) => t.name);
    expect(dangerous).toEqual(["bash", "edit", "write"]);
  });
});

// ── Skill discovery ────────────────────────────────────────────────────────

describe("discoverSkills", () => {
  test("discovers skills from the real user skill directories", () => {
    const skills = settings.discoverSkills();
    expect(skills.length).toBeGreaterThan(5);
    // Should find common skills
    const names = skills.map((s) => s.name);
    expect(names).toContain("code-review");
    expect(names).toContain("research");
    // Each skill should have name, description, filePath, source
    for (const s of skills) {
      expect(s.name).toBeTruthy();
      expect(s.description).toBeTruthy();
      expect(s.filePath).toBeTruthy();
      expect(["user", "project", "package"]).toContain(s.source);
    }
  });

  test("deduplicates skills (user dir takes priority)", () => {
    const skills = settings.discoverSkills();
    const names = skills.map((s) => s.name);
    const unique = new Set(names);
    expect(names.length).toBe(unique.size);
  });
});

// ── Persisted settings ─────────────────────────────────────────────────────

describe("persisted settings", () => {
  test("defaults: nothing disabled", async () => {
    const disabled = await settings.getDisabledTools();
    expect(disabled.size).toBe(0);
  });

  test("toggle a tool on and off", async () => {
    // Initially enabled
    expect((await settings.getDisabledTools()).has("bash")).toBe(false);

    // Disable it
    const result = await settings.toggleTool("bash", true);
    expect(result).toBe(true);
    expect((await settings.getDisabledTools()).has("bash")).toBe(true);

    // Re-enable it
    const result2 = await settings.toggleTool("bash", false);
    expect(result2).toBe(false);
    expect((await settings.getDisabledTools()).has("bash")).toBe(false);
  });

  test("toggle a skill on and off", async () => {
    // Pick the first discovered skill
    const skills = settings.discoverSkills();
    if (skills.length === 0) return; // skip if no skills
    const skillName = skills[0].name;

    // Disable it
    await settings.toggleSkill(skillName, true);
    const disabled = await settings.getDisabledSkills();
    expect(disabled.has(skillName)).toBe(true);

    // Re-enable
    await settings.toggleSkill(skillName, false);
    const reEnabled = await settings.getDisabledSkills();
    expect(reEnabled.has(skillName)).toBe(false);
  });

  test("setDisabledTools replaces the set", async () => {
    await settings.setDisabledTools(new Set(["bash", "edit", "write"]));
    const disabled = await settings.getDisabledTools();
    expect(disabled).toEqual(new Set(["bash", "edit", "write"]));
  });

  test("setDisabledSkills replaces the set", async () => {
    await settings.setDisabledSkills(new Set(["code-review", "research"]));
    const disabled = await settings.getDisabledSkills();
    expect(disabled).toEqual(new Set(["code-review", "research"]));
  });
});

// ── Resource state snapshot ────────────────────────────────────────────────

describe("getResourceState", () => {
  test("returns all tools and skills with enabled state", async () => {
    // Disable one tool and one skill first
    await settings.toggleTool("bash", true);
    const allSkills = settings.discoverSkills();
    if (allSkills.length > 0) {
      await settings.toggleSkill(allSkills[0].name, true);
    }

    const state = await settings.getResourceState();
    // Should include built-in + any extension tools
    expect(state.tools.length).toBeGreaterThanOrEqual(settings.BUILTIN_TOOLS.length);

    // bash should be disabled
    const bash = state.tools.find((t) => t.name === "bash");
    expect(bash?.enabled).toBe(false);

    // read should still be enabled
    const read = state.tools.find((t) => t.name === "read");
    expect(read?.enabled).toBe(true);

    // Skills should match discovered
    expect(state.skills.length).toBe(allSkills.length);
  });
});

// ── computeSpawnOptions ────────────────────────────────────────────────────

describe("computeSpawnOptions", () => {
  test("returns empty object when everything is enabled", () => {
    const allEnabled: ResourceState = {
      tools: settings.BUILTIN_TOOLS.map((t) => ({ ...t, enabled: true })),
      skills: [],
    };
    const opts = settings.computeSpawnOptions(allEnabled);
    expect(opts).toEqual({});
  });

  test("excludes disabled tools", () => {
    const state: ResourceState = {
      tools: [
        { name: "read", label: "Read", description: "", dangerous: false, required: false, enabled: true },
        { name: "bash", label: "Bash", description: "", dangerous: true, required: false, enabled: false },
        { name: "edit", label: "Edit", description: "", dangerous: true, required: false, enabled: true },
      ],
      skills: [],
    };
    const opts = settings.computeSpawnOptions(state);
    expect(opts).toEqual({ excludeTools: ["bash"] });
  });

  test("lists only enabled skills when some are disabled", () => {
    const state: ResourceState = {
      tools: settings.BUILTIN_TOOLS.map((t) => ({ ...t, enabled: true })),
      skills: [
        { name: "code-review", description: "", filePath: "/a", source: "user", enabled: true },
        { name: "research", description: "", filePath: "/b", source: "user", enabled: false },
      ],
    };
    const opts = settings.computeSpawnOptions(state);
    expect(opts).toEqual({ skills: ["code-review"] });
  });

  test("noSkills when all skills are disabled", () => {
    const state: ResourceState = {
      tools: settings.BUILTIN_TOOLS.map((t) => ({ ...t, enabled: true })),
      skills: [
        { name: "code-review", description: "", filePath: "/a", source: "user", enabled: false },
        { name: "research", description: "", filePath: "/b", source: "user", enabled: false },
      ],
    };
    const opts = settings.computeSpawnOptions(state);
    expect(opts).toEqual({ noSkills: true });
  });

  test("combines excludeTools and skills options", () => {
    const state: ResourceState = {
      tools: [
        { name: "read", label: "Read", description: "", dangerous: false, required: false, enabled: true },
        { name: "bash", label: "Bash", description: "", dangerous: true, required: false, enabled: false },
        { name: "write", label: "Write", description: "", dangerous: true, required: false, enabled: true },
      ],
      skills: [
        { name: "research", description: "", filePath: "/a", source: "user", enabled: true },
        { name: "tdd", description: "", filePath: "/b", source: "user", enabled: false },
      ],
    };
    const opts = settings.computeSpawnOptions(state);
    expect(opts).toEqual({ excludeTools: ["bash"], skills: ["research"] });
  });
});

// ── discoverExtensionTools ─────────────────────────────────────────────────

describe("discoverExtensionTools", () => {
  test("returns empty when extension dir does not exist", () => {
    const tools = settings.discoverExtensionTools();
    expect(Array.isArray(tools)).toBe(true);
  });

  test("getAllTools returns built-in tools plus any extensions", () => {
    const all = settings.getAllTools();
    const names = all.map((t) => t.name).sort();
    expect(names).toContain("bash");
    expect(names).toContain("read");
    expect(names).toContain("edit");
    expect(names).toContain("write");
    expect(names).toContain("grep");
    expect(names).toContain("find");
    expect(names).toContain("ls");
  });

  test("clearToolsCache resets the cache", () => {
    const before = settings.getAllTools();
    settings.clearToolsCache();
    const after = settings.getAllTools();
    expect(after).toEqual(before);
  });
});
