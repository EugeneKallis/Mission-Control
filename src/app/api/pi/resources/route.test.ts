/**
 * Tests for GET /api/pi/resources
 *
 * Returns available Pi tools and skills with their enabled/disabled state.
 */

import { describe, test, expect, mock, beforeAll, afterAll, beforeEach } from "bun:test";
import { makeTestDB, type TestDB } from "@/lib/db/test-helpers";
import { getRequest, jsonRequest } from "@/test-utils/route-helpers";

let testDB: TestDB;

beforeAll(async () => {
  testDB = await makeTestDB();
  mock.module("@/lib/db", () => ({ db: testDB.db }));
});

afterAll(async () => {
  await testDB.cleanup();
});

beforeEach(async () => {
  await testDB.db.setting.deleteMany();
});

async function loadRoute(suffix: string) {
  return import(`./route.ts?bust=${Date.now()}-${suffix}`);
}

describe("GET /api/pi/resources", () => {
  test("returns tools and skills arrays", async () => {
    const { GET } = await loadRoute("all");
    const res = await GET();
    expect(res.status).toBe(200);

    const body = (await res.json()) as { tools: unknown[]; skills: unknown[] };
    expect(body).toHaveProperty("tools");
    expect(body).toHaveProperty("skills");
    expect(Array.isArray(body.tools)).toBe(true);
    expect(Array.isArray(body.skills)).toBe(true);
  });

  test("tools have the expected shape", async () => {
    const { GET } = await loadRoute("shape");
    const res = await GET();
    const body = (await res.json()) as {
      tools: Array<{ name: string; label: string; description: string; enabled: boolean }>;
    };

    expect(body.tools.length).toBeGreaterThan(0);
    for (const tool of body.tools) {
      expect(tool).toHaveProperty("name");
      expect(tool).toHaveProperty("label");
      expect(tool).toHaveProperty("description");
      expect(typeof tool.enabled).toBe("boolean");
    }
  });

  test("skills have the expected shape", async () => {
    const { GET } = await loadRoute("skills");
    const res = await GET();
    const body = (await res.json()) as {
      skills: Array<{ name: string; description: string; filePath: string; enabled: boolean }>;
    };

    if (body.skills.length > 0) {
      for (const skill of body.skills) {
        expect(skill).toHaveProperty("name");
        expect(skill).toHaveProperty("description");
        expect(skill).toHaveProperty("filePath");
        expect(typeof skill.enabled).toBe("boolean");
      }
    }
  });

  test("all tools default to enabled", async () => {
    const { GET } = await loadRoute("default");
    const res = await GET();
    const body = (await res.json()) as { tools: Array<{ name: string; enabled: boolean }> };

    for (const tool of body.tools) {
      expect(tool.enabled).toBe(true);
    }
  });

  test("tools disabled via settings show as disabled", async () => {
    // Disable bash in the DB
    await testDB.db.setting.upsert({
      where: { key: "pi:tools:disabled" },
      update: { value: '["bash"]' },
      create: { key: "pi:tools:disabled", value: '["bash"]' },
    });

    const { GET } = await loadRoute("disabled");
    const res = await GET();
    const body = (await res.json()) as { tools: Array<{ name: string; enabled: boolean }> };

    const bash = body.tools.find((t) => t.name === "bash");
    expect(bash?.enabled).toBe(false);

    // Other tools remain enabled
    for (const tool of body.tools) {
      if (tool.name !== "bash") {
        expect(tool.enabled).toBe(true);
      }
    }
  });
});

describe("POST /api/pi/resources", () => {
  test("toggles a tool on and off", async () => {
    const { POST } = await loadRoute("toggle-tool");

    // Disable bash
    const req1 = jsonRequest("/api/pi/resources", {
      action: "toggle",
      type: "tool",
      name: "bash",
    });
    const res1 = await POST(req1);
    expect(res1.status).toBe(200);

    // Verify it's disabled
    const { GET } = await loadRoute("verify-tool");
    const getRes = await GET();
    const body = (await getRes.json()) as { tools: Array<{ name: string; enabled: boolean }> };
    expect(body.tools.find((t) => t.name === "bash")?.enabled).toBe(false);

    // Re-enable
    const req2 = jsonRequest("/api/pi/resources", {
      action: "toggle",
      type: "tool",
      name: "bash",
    });
    const res2 = await POST(req2);
    expect(res2.status).toBe(200);

    // Verify it's enabled again
    const { GET: GET2 } = await loadRoute("verify-tool2");
    const getRes2 = await GET2();
    const body2 = (await getRes2.json()) as { tools: Array<{ name: string; enabled: boolean }> };
    expect(body2.tools.find((t) => t.name === "bash")?.enabled).toBe(true);
  });

  test("toggles a skill on and off", async () => {
    const { POST } = await loadRoute("toggle-skill");

    const req1 = jsonRequest("/api/pi/resources", {
      action: "toggle",
      type: "skill",
      name: "code-review",
    });
    const res1 = await POST(req1);
    expect(res1.status).toBe(200);

    const req2 = jsonRequest("/api/pi/resources", {
      action: "toggle",
      type: "skill",
      name: "code-review",
    });
    const res2 = await POST(req2);
    expect(res2.status).toBe(200);
  });

  test("returns 400 for missing action", async () => {
    const { POST } = await loadRoute("bad-action");
    const req = jsonRequest("/api/pi/resources", { type: "tool", name: "bash" });
    const res = await POST(req);
    expect(res.status).toBe(400);
  });

  test("returns 400 for invalid type", async () => {
    const { POST } = await loadRoute("bad-type");
    const req = jsonRequest("/api/pi/resources", {
      action: "toggle",
      type: "invalid",
      name: "bash",
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
  });
});
