/**
 * Pi Settings Manager
 *
 * Discovers available skills and tools, and persists what's enabled/disabled
 * in the Setting table (key/value store in SQLite).
 *
 * Keys used:
 *   pi:tools:disabled  — JSON array of tool names the user has disabled
 *   pi:skills:disabled — JSON array of skill names the user has disabled
 */

import { db } from "@/lib/db";
import { readFileSync, readdirSync, existsSync } from "fs";
import { homedir } from "os";
import { join } from "path";
import type { PiSpawnOptions } from "./event-types";

// ── Built-in tool catalog ──────────────────────────────────────────────────

export interface ToolInfo {
  name: string;
  label: string;
  description: string;
  /** Tools annotated as dangerous (e.g. that can modify the system). */
  dangerous: boolean;
  /** Always enabled and can't be disabled. */
  required: boolean;
}

export const BUILTIN_TOOLS: ToolInfo[] = [
  { name: "read", label: "Read", description: "Read file contents", dangerous: false, required: false },
  { name: "bash", label: "Bash", description: "Execute shell commands", dangerous: true, required: false },
  { name: "edit", label: "Edit", description: "Edit existing files", dangerous: true, required: false },
  { name: "write", label: "Write", description: "Create new files", dangerous: true, required: false },
  { name: "grep", label: "Grep", description: "Search file contents", dangerous: false, required: false },
  { name: "find", label: "Find", description: "Find files and directories", dangerous: false, required: false },
  { name: "ls", label: "List", description: "List directory contents", dangerous: false, required: false },
];

// ── Skill discovery ────────────────────────────────────────────────────────

export interface SkillInfo {
  name: string;
  description: string;
  /** Absolute path to the SKILL.md file. */
  filePath: string;
  /** Source label (user, project, package). */
  source: "user" | "project" | "package";
}

/**
 * Directories Pi scans for skills, in priority order.
 */
function skillSearchPaths(): string[] {
  const home = homedir();
  return [
    join(home, ".pi", "agent", "skills"),
    join(home, ".agents", "skills"),
    // Project-level skills (checked relative to cwd)
    join(process.cwd(), ".pi", "skills"),
    join(process.cwd(), ".agents", "skills"),
  ];
}

/**
 * Parse the YAML frontmatter from a SKILL.md file (simple line-by-line parser).
 * Returns { name, description } or null if parsing fails.
 */
function parseSkillFrontmatter(filePath: string): { name: string; description: string } | null {
  try {
    const content = readFileSync(filePath, "utf-8");
    const lines = content.split("\n");

    // Check for opening `---`
    if (lines.length < 2 || lines[0].trim() !== "---") return null;

    let name = "";
    let description = "";
    let inFrontmatter = false;

    for (let i = 1; i < lines.length; i++) {
      const line = lines[i];
      if (line.trim() === "---") break; // end of frontmatter
      inFrontmatter = true;

      if (line.startsWith("name:")) {
        name = line.slice(5).trim();
      } else if (line.startsWith("description:")) {
        description = line.slice(12).trim();
      }
    }

    if (!inFrontmatter || !name) return null;
    return { name, description };
  } catch {
    return null;
  }
}

/**
 * Discover all available skills by scanning Pi's skill directories.
 * Returns a deduplicated list (first found wins).
 */
export function discoverSkills(): SkillInfo[] {
  const seen = new Set<string>();
  const skills: SkillInfo[] = [];

  const paths = skillSearchPaths();
  const sourceLabels: ("user" | "project" | "package")[] = ["user", "user", "project", "project"];

  for (let i = 0; i < paths.length; i++) {
    const dir = paths[i];
    if (!existsSync(dir)) continue;

    const entries = readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;

      const skillName = entry.name;
      if (seen.has(skillName)) continue; // dedup

      const skillDir = join(dir, skillName);
      const skillFile = join(skillDir, "SKILL.md");
      if (!existsSync(skillFile)) continue;

      const parsed = parseSkillFrontmatter(skillFile);
      if (!parsed) continue;

      seen.add(skillName);
      skills.push({
        name: skillName,
        description: parsed.description,
        filePath: skillFile,
        source: sourceLabels[i],
      });
    }
  }

  return skills;
}

// ── Persisted settings ─────────────────────────────────────────────────────

const KEY_TOOLS_DISABLED = "pi:tools:disabled";
const KEY_SKILLS_DISABLED = "pi:skills:disabled";

async function getJsonSet(key: string): Promise<Set<string>> {
  try {
    const val = await db.setting.findUnique({ where: { key } });
    if (!val?.value) return new Set();
    const arr = JSON.parse(val.value) as string[];
    return new Set(arr);
  } catch {
    return new Set();
  }
}

async function setJsonSet(key: string, set: Set<string>): Promise<void> {
  const arr = Array.from(set).sort();
  await db.setting.upsert({
    where: { key },
    update: { value: JSON.stringify(arr) },
    create: { key, value: JSON.stringify(arr) },
  });
}

/**
 * Get the set of disabled tool names.
 */
export async function getDisabledTools(): Promise<Set<string>> {
  return getJsonSet(KEY_TOOLS_DISABLED);
}

/**
 * Set which tools are disabled.
 */
export async function setDisabledTools(tools: Set<string>): Promise<void> {
  return setJsonSet(KEY_TOOLS_DISABLED, tools);
}

/**
 * Toggle a single tool's disabled state. Returns the new state (true = disabled).
 */
export async function toggleTool(name: string, disabled?: boolean): Promise<boolean> {
  const disabledSet = await getDisabledTools();
  if (disabled !== undefined) {
    if (disabled) disabledSet.add(name);
    else disabledSet.delete(name);
  } else {
    if (disabledSet.has(name)) disabledSet.delete(name);
    else disabledSet.add(name);
  }
  await setDisabledTools(disabledSet);
  clearToolsCache();
  return disabledSet.has(name);
}

/**
 * Get the set of disabled skill names.
 */
export async function getDisabledSkills(): Promise<Set<string>> {
  return getJsonSet(KEY_SKILLS_DISABLED);
}

/**
 * Set which skills are disabled.
 */
export async function setDisabledSkills(skills: Set<string>): Promise<void> {
  return setJsonSet(KEY_SKILLS_DISABLED, skills);
}

/**
 * Toggle a single skill's disabled state. Returns the new state (true = disabled).
 */
export async function toggleSkill(name: string, disabled?: boolean): Promise<boolean> {
  const disabledSet = await getDisabledSkills();
  if (disabled !== undefined) {
    if (disabled) disabledSet.add(name);
    else disabledSet.delete(name);
  } else {
    if (disabledSet.has(name)) disabledSet.delete(name);
    else disabledSet.add(name);
  }
  await setDisabledSkills(disabledSet);
  clearToolsCache();
  return disabledSet.has(name);
}

// ── Extension tool discovery ───────────────────────────────────────────────

/**
 * Discover tools registered by Pi extensions.
 * Scans ~/.pi/agent/extensions/ directories for package.json
 * files that register tools via contributes.tools or pi.tools.
 */
export function discoverExtensionTools(): ToolInfo[] {
  const extDir = join(homedir(), ".pi", "agent", "extensions");
  if (!existsSync(extDir)) return [];

  const tools: ToolInfo[] = [];
  const entries = readdirSync(extDir, { withFileTypes: true });

  for (const entry of entries) {
    if (!entry.isDirectory()) continue;

    const pkgPath = join(extDir, entry.name, "package.json");
    if (!existsSync(pkgPath)) continue;

    try {
      const pkg = JSON.parse(readFileSync(pkgPath, "utf-8"));
      // Pi extensions register tools in contributes.tools or pi.tools
      const extTools = pkg.contributes?.tools ?? pkg.pi?.tools ?? [];
      if (!Array.isArray(extTools)) continue;

      for (const t of extTools) {
        if (!t?.name) continue;
        tools.push({
          name: t.name,
          label: t.label ?? t.name,
          description: t.description ?? "",
          dangerous: t.dangerous ?? false,
          required: false,
        });
      }
    } catch {
      // skip malformed package.json
    }
  }

  // Dedup by name — extension wins over built-in
  const seen = new Set(tools.map((t) => t.name));
  const dedupedBuiltin = BUILTIN_TOOLS.filter((t) => !seen.has(t.name));
  return [...tools, ...dedupedBuiltin];
}

/** Module-level cache for getAllTools(). */
let toolsCache: { tools: ToolInfo[]; timestamp: number } | null = null;
const TOOLS_CACHE_TTL_MS = 30_000;

/**
 * Get all available tools (built-in + extension-registered).
 * Results are cached for 30s.
 */
export function getAllTools(): ToolInfo[] {
  if (toolsCache && Date.now() - toolsCache.timestamp < TOOLS_CACHE_TTL_MS) {
    return toolsCache.tools;
  }
  const all = discoverExtensionTools();
  toolsCache = { tools: all, timestamp: Date.now() };
  return all;
}

/** Invalidate the tools cache (e.g. after a settings toggle). */
export function clearToolsCache(): void {
  toolsCache = null;
}

// ── Spawn options from settings ────────────────────────────────────────────

/**
 * Compute PiSpawnOptions from a ResourceState.
 * Returns only the options that differ from defaults (empty object = all defaults).
 */
export function computeSpawnOptions(state: ResourceState): PiSpawnOptions {
  const disabledTools = state.tools.filter((t) => !t.enabled).map((t) => t.name);
  const disabledSkills = state.skills.filter((s) => !s.enabled).map((s) => s.name);

  const opts: PiSpawnOptions = {};

  if (disabledTools.length > 0) {
    opts.excludeTools = disabledTools;
  }

  if (disabledSkills.length > 0) {
    const enabledSkills = state.skills.filter((s) => s.enabled).map((s) => s.name);
    if (enabledSkills.length > 0) {
      opts.skills = enabledSkills;
    } else {
      opts.noSkills = true;
    }
  }

  return opts;
}

// ── Comprehensive snapshot ─────────────────────────────────────────────────

export interface ResourceState {
  tools: Array<ToolInfo & { enabled: boolean }>;
  skills: Array<SkillInfo & { enabled: boolean }>;
}

/**
 * Get the full resource state: all available tools and skills with enabled/disabled status.
 */
export async function getResourceState(): Promise<ResourceState> {
  const [disabledTools, disabledSkills, allSkills] = await Promise.all([
    getDisabledTools(),
    getDisabledSkills(),
    discoverSkills(),
  ]);

  const tools: ResourceState["tools"] = getAllTools().map((t) => ({
    ...t,
    enabled: !disabledTools.has(t.name),
  }));

  const skills: ResourceState["skills"] = allSkills.map((s) => ({
    ...s,
    enabled: !disabledSkills.has(s.name),
  }));

  return { tools, skills };
}
