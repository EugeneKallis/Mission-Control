/**
 * Tests for SkillsToolsDropdowns — interactive tool/skill toggles.
 *
 * Covers: initial GET renders counts, opening the tools dropdown lists
 * all tools, clicking a tool POSTs the toggle, optimistic flip applies
 * immediately, and the server's authoritative state overrides after
 * the response. Also covers the error/revert path.
 */

import { describe, test, expect, afterEach, beforeEach, mock } from "bun:test";
import { render, screen, fireEvent, cleanup, waitFor } from "@/test-utils/render";
import { SkillsToolsDropdowns } from "./skills-tools-dropdowns";

const MOCK_RESOURCES = {
  tools: [
    { name: "read", label: "Read", enabled: true, dangerous: false },
    { name: "bash", label: "Bash", enabled: true, dangerous: true },
    { name: "grep", label: "Grep", enabled: false, dangerous: false },
  ],
  skills: [
    { name: "code-review", description: "Review code", enabled: true },
    { name: "ponytail", description: "Be lazy", enabled: false },
  ],
};

let originalFetch: typeof globalThis.fetch;

beforeEach(() => {
  originalFetch = globalThis.fetch;
});

afterEach(() => {
  cleanup();
  globalThis.fetch = originalFetch;
});

function mockFetch(opts: {
  get?: typeof MOCK_RESOURCES | { error: string };
  postStatus?: number;
  postBody?: unknown;
  postThrows?: boolean;
}) {
  const fn = mock(async (input: URL | RequestInfo, init?: RequestInit) => {
    const method = (init?.method ?? "GET").toUpperCase();
    if (method === "GET") {
      const payload = opts.get ?? MOCK_RESOURCES;
      return new Response(JSON.stringify(payload), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }
    // POST toggle
    if (opts.postThrows) {
      throw new Error("network failure");
    }
    // Toggle flips the named entry in the returned state to simulate the server.
    const body = init?.body ? JSON.parse(init.body as string) : {};
    const toggled = JSON.parse(JSON.stringify(MOCK_RESOURCES)) as typeof MOCK_RESOURCES;
    if (body.type === "tool" && body.name === "bash") {
      const t = toggled.tools.find((x) => x.name === "bash")!;
      t.enabled = !t.enabled;
    }
    if (body.type === "skill" && body.name === "ponytail") {
      const s = toggled.skills.find((x) => x.name === "ponytail")!;
      s.enabled = !s.enabled;
    }
    const status = opts.postStatus ?? 200;
    const responseBody = opts.postBody ?? { ok: true, state: toggled };
    return new Response(JSON.stringify(responseBody), {
      status,
      headers: { "Content-Type": "application/json" },
    });
  });
  globalThis.fetch = fn as unknown as typeof globalThis.fetch;
  return fn;
}

describe("SkillsToolsDropdowns", () => {
  test("renders tool and skill counts from the resources API", async () => {
    mockFetch({});
    render(<SkillsToolsDropdowns />);

    await waitFor(() => {
      expect(screen.getByText(/2\/3 tools/)).toBeInTheDocument();
      expect(screen.getByText(/1\/2 skills/)).toBeInTheDocument();
    });
  });

  test("opening tools dropdown lists all tools (enabled + disabled)", async () => {
    mockFetch({});
    render(<SkillsToolsDropdowns />);

    await waitFor(() => screen.getByText(/2\/3 tools/));
    fireEvent.click(screen.getByTitle(/Enabled tools/));

    await waitFor(() => {
      expect(screen.getByText("Read")).toBeInTheDocument();
      expect(screen.getByText("Bash")).toBeInTheDocument();
      expect(screen.getByText("Grep")).toBeInTheDocument();
    });
  });

  test("clicking a tool POSTs a toggle and applies the server's state", async () => {
    const fetchFn = mockFetch({});
    render(<SkillsToolsDropdowns />);

    await waitFor(() => screen.getByText(/2\/3 tools/));
    fireEvent.click(screen.getByTitle(/Enabled tools/));

    await waitFor(() => screen.getByText("Bash"));
    fireEvent.click(screen.getByText("Bash"));

    // Optimistic flip: bash disabled → count drops to 1/3 immediately.
    await waitFor(() => expect(screen.getByText(/1\/3 tools/)).toBeInTheDocument());

    // Server state applied (bash stayed disabled per mock).
    await waitFor(() => {
      expect(screen.getByText(/1\/3 tools/)).toBeInTheDocument();
    });

    // Verify a POST was actually sent.
    const postCalls = fetchFn.mock.calls.filter(([, init]) =>
      (init?.method ?? "").toString().toUpperCase() === "POST",
    );
    expect(postCalls.length).toBeGreaterThanOrEqual(1);
  });

  test("reverts the optimistic flip when the POST fails", async () => {
    mockFetch({ postStatus: 500, postBody: { error: "boom" } });
    render(<SkillsToolsDropdowns />);

    await waitFor(() => screen.getByText(/2\/3 tools/));
    fireEvent.click(screen.getByTitle(/Enabled tools/));
    await waitFor(() => screen.getByText("Bash"));
    fireEvent.click(screen.getByText("Bash"));

    // After failure the GET re-fetch restores the original counts (2 enabled).
    await waitFor(() => expect(screen.getByText(/2\/3 tools/)).toBeInTheDocument());
  });

  test("toggling a skill POSTs with type=skill", async () => {
    const fetchFn = mockFetch({});
    render(<SkillsToolsDropdowns />);

    await waitFor(() => screen.getByText(/1\/2 skills/));
    fireEvent.click(screen.getByTitle(/Enabled skills/));
    await waitFor(() => screen.getByText("ponytail"));
    fireEvent.click(screen.getByText("ponytail"));

    await waitFor(() => expect(screen.getByText(/2\/2 skills/)).toBeInTheDocument());

    const skillPosts = fetchFn.mock.calls.filter(([, init]) => {
      if ((init?.method ?? "").toString().toUpperCase() !== "POST") return false;
      const body = JSON.parse((init?.body as string | undefined) ?? "{}");
      return body.type === "skill" && body.name === "ponytail";
    });
    expect(skillPosts.length).toBe(1);
  });
});