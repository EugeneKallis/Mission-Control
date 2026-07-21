/**
 * Headless agent task prompt helpers.
 *
 * Pure functions for building Pi CLI arguments for headless (--mode json)
 * agent task execution. No child_process, no fs, no DB.
 *
 * The headless directive tells the Pi agent it is running unattended
 * on a cron job and must not expect user interaction.
 */

import { homedir } from "os";
import { join } from "path";

/**
 * System prompt appended (via --append-system-prompt) to tell the agent
 * it is running headless on an unattended cron job — no user present,
 * do not halt on prompts/permission requests, complete autonomously.
 */
export const HEADLESS_SYSTEM_APPEND = [
  "You are running in headless mode as an unattended cron job.",
  "There is no user present to interact with.",
  "Do not expect any user input.",
  "Do not halt on prompts, permission requests, or confirmation dialogs.",
  "Complete the task autonomously and finalize without human intervention.",
  "Treat this as an automated scheduled task — complete all work without asking for approval.",
].join(" ");

/**
 * Configuration for spawning a headless agent task.
 */
export interface AgentTaskSpawnConfig {
  /** The user prompt to execute. */
  prompt: string;
  /** Provider name (e.g. "anthropic"). */
  provider?: string;
  /** Model identifier/pattern. */
  model?: string;
  /** Thinking level ("off", "minimal", "low", "medium", "high", "xhigh", "max"). */
  thinkingLevel?: string;
  /** Allowlisted tool names (passed via --tools). If omitted, all default tools. */
  enabledTools?: string[];
  /** Tool names to exclude (passed via --exclude-tools). */
  disabledTools?: string[];
  /** Allowlisted skill names (passed via --skill per skill). */
  enabledSkills?: string[];
  /** If true, pass --no-skills to disable all skills. */
  noSkills?: boolean;
  /** Extra text appended to the headless system prompt. */
  appendSystem?: string;
  /** If true, use --session instead of --no-session for state persistence. */
  persistSession?: boolean;
  /** Custom session file path. Only used when persistSession is true. */
  sessionPath?: string;
}

/**
 * Build the CLI argument array for spawning `pi` in headless print+JSON mode.
 *
 * Flag names and ordering mirror the singleton's `buildArgs` in process-manager.ts
 * but adapted for print+json mode (--mode json, -p, -a).
 *
 * @returns string[] suitable for passing to child_process.spawn(argv)
 */
export function buildAgentTaskSpawnArgs(task: AgentTaskSpawnConfig): string[] {
  const args: string[] = [
    "-p",
    task.prompt,
    "--mode",
    "json",
    "-a", // auto-approve project trust
  ];

  // Session persistence
  if (task.persistSession && task.sessionPath) {
    args.push("--session", task.sessionPath);
  } else if (task.persistSession) {
    args.push("--session", defaultScheduledSessionPath("default"));
  } else {
    args.push("--no-session");
  }

  // Append system prompt — headless directive + optional extra
  const systemAppend = HEADLESS_SYSTEM_APPEND + (task.appendSystem ?? "");
  args.push("--append-system-prompt", systemAppend);

  // Provider / Model / Thinking level
  if (task.provider) {
    args.push("--provider", task.provider);
  }
  if (task.model) {
    args.push("--model", task.model);
  }
  if (task.thinkingLevel) {
    args.push("--thinking", task.thinkingLevel);
  }

  // Tools allowlist (comma-joined, matching buildArgs)
  if (task.enabledTools && task.enabledTools.length > 0) {
    args.push("--tools", task.enabledTools.join(","));
  }

  // Tools denylist (comma-joined, matching buildArgs)
  if (task.disabledTools && task.disabledTools.length > 0) {
    args.push("--exclude-tools", task.disabledTools.join(","));
  }

  // Skills
  if (task.noSkills) {
    args.push("--no-skills");
  }
  if (task.enabledSkills && task.enabledSkills.length > 0) {
    for (const skill of task.enabledSkills) {
      args.push("--skill", skill);
    }
  }

  return args;
}

/**
 * Build the full user prompt text. Currently just returns the raw prompt;
 * exported so the scheduler can use it consistently.
 */
export function buildFullPrompt(task: AgentTaskSpawnConfig): string {
  return task.prompt;
}

/**
 * Default session directory path for scheduled agent tasks.
 * Path: ~/.pi/agent/sessions/mc-scheduled/<projectSlug>.jsonl
 */
export function defaultScheduledSessionPath(projectSlug: string): string {
  return join(homedir(), ".pi", "agent", "sessions", "mc-scheduled", `${projectSlug}.jsonl`);
}
