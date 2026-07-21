/**
 * Tests for src/lib/pi/headless-prompt.ts
 *
 * Covers:
 *  - HEADLESS_SYSTEM_APPEND contains expected concepts
 *  - buildAgentTaskSpawnArgs: minimal, tools/skills flags, session, provider/model/thinking
 *  - buildFullPrompt returns the raw prompt
 *  - defaultScheduledSessionPath constructs the correct path
 */

import { describe, test, expect } from "bun:test";
import {
  HEADLESS_SYSTEM_APPEND,
  buildAgentTaskSpawnArgs,
  buildFullPrompt,
  defaultScheduledSessionPath,
} from "./headless-prompt";

// ── HEADLESS_SYSTEM_APPEND ─────────────────────────────────────────────────

describe("HEADLESS_SYSTEM_APPEND", () => {
  test("contains the word 'headless'", () => {
    expect(HEADLESS_SYSTEM_APPEND.toLowerCase()).toContain("headless");
  });

  test("contains the word 'cron'", () => {
    expect(HEADLESS_SYSTEM_APPEND.toLowerCase()).toContain("cron");
  });

  test("contains the concept of unattended operation", () => {
    expect(HEADLESS_SYSTEM_APPEND.toLowerCase()).toContain("unattended");
  });

  test("mentions no user input/autonomous completion", () => {
    const lower = HEADLESS_SYSTEM_APPEND.toLowerCase();
    expect(lower).toContain("no user");
    expect(lower).toContain("autonomously");
  });
});

// ── buildAgentTaskSpawnArgs ────────────────────────────────────────────────

describe("buildAgentTaskSpawnArgs", () => {
  test("minimal task (prompt only)", () => {
    const args = buildAgentTaskSpawnArgs({ prompt: "Hello, list files" });
    // First arg: -p, second: prompt
    expect(args[0]).toBe("-p");
    expect(args[1]).toBe("Hello, list files");
    // Contains --mode json
    expect(args).toContain("--mode");
    const modeIdx = args.indexOf("--mode");
    expect(args[modeIdx + 1]).toBe("json");
    // Contains -a (approve project trust)
    expect(args).toContain("-a");
    // Contains --no-session by default
    expect(args).toContain("--no-session");
    // Contains --append-system-prompt with HEADLESS_SYSTEM_APPEND
    expect(args).toContain("--append-system-prompt");
    const appendIdx = args.indexOf("--append-system-prompt");
    expect(args[appendIdx + 1]).toBe(HEADLESS_SYSTEM_APPEND);
  });

  test("with enabledTools allowlist → --tools comma-joined", () => {
    const args = buildAgentTaskSpawnArgs({
      prompt: "test",
      enabledTools: ["read", "grep", "find"],
    });
    const toolsIdx = args.indexOf("--tools");
    expect(toolsIdx).not.toBe(-1);
    expect(args[toolsIdx + 1]).toBe("read,grep,find");
  });

  test("with disabledTools → --exclude-tools comma-joined", () => {
    const args = buildAgentTaskSpawnArgs({
      prompt: "test",
      disabledTools: ["bash", "edit", "write"],
    });
    const excludeIdx = args.indexOf("--exclude-tools");
    expect(excludeIdx).not.toBe(-1);
    expect(args[excludeIdx + 1]).toBe("bash,edit,write");
  });

  test("with noSkills true → --no-skills", () => {
    const args = buildAgentTaskSpawnArgs({
      prompt: "test",
      noSkills: true,
    });
    expect(args).toContain("--no-skills");
  });

  test("with enabledSkills → --skill per skill", () => {
    const args = buildAgentTaskSpawnArgs({
      prompt: "test",
      enabledSkills: ["code-review", "research"],
    });
    // Each skill gets its own --skill flag
    const skillFlags = args.filter((a) => a === "--skill");
    expect(skillFlags).toHaveLength(2);
    const skillIdx1 = args.indexOf("--skill");
    expect(args[skillIdx1 + 1]).toBe("code-review");
    const skillIdx2 = args.lastIndexOf("--skill");
    expect(args[skillIdx2 + 1]).toBe("research");
  });

  test("persistSession → --session with path, no --no-session", () => {
    const args = buildAgentTaskSpawnArgs({
      prompt: "test",
      persistSession: true,
    });
    expect(args).not.toContain("--no-session");
    expect(args).toContain("--session");
    const sessionIdx = args.indexOf("--session");
    expect(sessionIdx).not.toBe(-1);
    expect(args[sessionIdx + 1]).toContain("mc-scheduled");
    expect(args[sessionIdx + 1]).toContain(".jsonl");
  });

  test("persistSession with custom sessionPath", () => {
    const args = buildAgentTaskSpawnArgs({
      prompt: "test",
      persistSession: true,
      sessionPath: "/tmp/custom-session.jsonl",
    });
    expect(args).toContain("--session");
    const sessionIdx = args.indexOf("--session");
    expect(args[sessionIdx + 1]).toBe("/tmp/custom-session.jsonl");
    expect(args).not.toContain("--no-session");
  });

  test("provider/model/thinking → respective flags", () => {
    const args = buildAgentTaskSpawnArgs({
      prompt: "test",
      provider: "anthropic",
      model: "claude-sonnet-4-20250514",
      thinkingLevel: "high",
    });
    expect(args).toContain("--provider");
    expect(args[args.indexOf("--provider") + 1]).toBe("anthropic");
    expect(args).toContain("--model");
    expect(args[args.indexOf("--model") + 1]).toBe("claude-sonnet-4-20250514");
    expect(args).toContain("--thinking");
    expect(args[args.indexOf("--thinking") + 1]).toBe("high");
  });

  test("all flags combined produces --tools, --exclude-tools, --skill, --no-session, --no-skills", () => {
    const args = buildAgentTaskSpawnArgs({
      prompt: "do everything",
      enabledTools: ["read", "ls"],
      disabledTools: ["bash"],
      enabledSkills: ["research"],
      noSkills: false,
      persistSession: false,
    });
    expect(args).toContain("--tools");
    expect(args[args.indexOf("--tools") + 1]).toBe("read,ls");
    expect(args).toContain("--exclude-tools");
    expect(args[args.indexOf("--exclude-tools") + 1]).toBe("bash");
    expect(args).toContain("--skill");
    expect(args[args.indexOf("--skill") + 1]).toBe("research");
    expect(args).toContain("--no-session");
  });

  test("enabledTools empty array does not emit --tools", () => {
    const args = buildAgentTaskSpawnArgs({
      prompt: "test",
      enabledTools: [],
    });
    expect(args).not.toContain("--tools");
  });

  test("appendSystem is appended to HEADLESS_SYSTEM_APPEND", () => {
    const args = buildAgentTaskSpawnArgs({
      prompt: "test",
      appendSystem: " EXTRA_CONTEXT",
    });
    const appendIdx = args.indexOf("--append-system-prompt");
    const value = args[appendIdx + 1];
    expect(value).toBe(HEADLESS_SYSTEM_APPEND + " EXTRA_CONTEXT");
  });
});

// ── buildFullPrompt ────────────────────────────────────────────────────────

describe("buildFullPrompt", () => {
  test("returns the raw prompt", () => {
    expect(buildFullPrompt({ prompt: "do stuff" })).toBe("do stuff");
  });
});

// ── defaultScheduledSessionPath ────────────────────────────────────────────

describe("defaultScheduledSessionPath", () => {
  test("returns path containing slug and mc-scheduled", () => {
    const path = defaultScheduledSessionPath(1, "my-task");
    expect(path).toContain("mc-scheduled");
    expect(path).toContain("1-my-task.jsonl");
    expect(path).toContain(".pi/agent/sessions");
  });

  test("different slugs produce different paths", () => {
    const a = defaultScheduledSessionPath(1, "task-a");
    const b = defaultScheduledSessionPath(2, "task-b");
    expect(a).not.toBe(b);
    expect(a).toContain("1-task-a.jsonl");
    expect(b).toContain("2-task-b.jsonl");
  });
});
