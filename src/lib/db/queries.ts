/**
 * Composable Prisma query helpers for Mission Control.
 * Mirrors the sqlc query interface from ~/ServerTool/query.sql
 */

import { db } from "./index";
import type { Prisma } from "@prisma/client";

// ── Constants ─────────────────────────────────────────────────────────────

/** The number of days after which hidden scrape results are auto-cleaned. */
export const SCRAPE_CLEANUP_DAYS = 20;

// ═══════════════════════════════════════════════════════════════════════════
//  MACROS
// ═══════════════════════════════════════════════════════════════════════════

export async function getMacros() {
  return db.macro.findMany({ orderBy: [{ groupName: "asc" }, { ord: "asc" }, { name: "asc" }] });
}

export async function getMacro(id: number) {
  return db.macro.findUniqueOrThrow({ where: { id } });
}

export async function createMacro(data: {
  name: string;
  description?: string;
  groupName?: string;
  ord?: number;
  runOnAgent?: boolean;
  agentHostname?: string;
  commands?: string;
}) {
  return db.macro.create({ data });
}

export async function updateMacro(
  id: number,
  data: Prisma.MacroUpdateInput
) {
  return db.macro.update({ where: { id }, data });
}

export async function deleteMacro(id: number) {
  return db.macro.delete({ where: { id } });
}

export async function getGroupedMacros() {
  const groups = await db.macroGroup.findMany({ orderBy: { ord: "asc" } });
  const macros = await db.macro.findMany({ orderBy: [{ groupName: "asc" }, { ord: "asc" }, { name: "asc" }] });

  // Ensure "Ungrouped" group exists
  const hasUngrouped = groups.some((g) => g.name === "Ungrouped");
  if (!hasUngrouped) {
    const maxOrd = groups.length > 0 ? groups[groups.length - 1].ord + 1 : 0;
    const grp = await db.macroGroup.create({
      data: { name: "Ungrouped", ord: maxOrd },
    });
    groups.push(grp);
  }

  // Build group → macros mapping, preserving order
  const grouped: { group: { id: number; name: string; ord: number }; macros: typeof macros }[] = [];
  const macroMap = new Map<string, typeof macros>();

  for (const m of macros) {
    const arr = macroMap.get(m.groupName) ?? [];
    arr.push(m);
    macroMap.set(m.groupName, arr);
  }

  for (const g of groups) {
    const groupMacros = macroMap.get(g.name) ?? [];
    grouped.push({ group: { id: g.id, name: g.name, ord: g.ord }, macros: groupMacros });
  }

  return grouped;
}

// ── Macro Groups ──────────────────────────────────────────────────────────

export async function listMacroGroups() {
  return db.macroGroup.findMany({ orderBy: { ord: "asc" } });
}

export async function createMacroGroup(name: string, ord?: number) {
  const maxOrd = ord ?? ((await db.macroGroup.count()) + 1);
  return db.macroGroup.create({ data: { name, ord: maxOrd } });
}

export async function updateMacroGroup(id: number, data: Prisma.MacroGroupUpdateInput) {
  return db.macroGroup.update({ where: { id }, data });
}

export async function deleteMacroGroup(id: number) {
  return db.macroGroup.delete({ where: { id } });
}

// ═══════════════════════════════════════════════════════════════════════════
//  HISTORY
// ═══════════════════════════════════════════════════════════════════════════

export async function createHistory(data: {
  macroId: number;
  startTime?: Date;
  status?: string;
  output?: string;
  triggeredBy?: string;
}) {
  return db.history.create({
    data: {
      macroId: data.macroId,
      startTime: data.startTime ?? new Date(),
      status: data.status ?? "running",
      output: data.output,
      triggeredBy: data.triggeredBy ?? "user",
    },
  });
}

export async function updateHistory(
  id: number,
  data: {
    endTime: Date;
    status: string;
    output: string;
  }
) {
  return db.history.update({
    where: { id },
    data: {
      endTime: data.endTime,
      status: data.status,
      output: data.output,
    },
  });
}

/**
 * Flush the in-memory output buffer to the database mid-run. Called by
 * the runner on a short interval so /history/[id] can show partial
 * output for a still-running macro without waiting for the final
 * updateHistory() call.
 *
 * This only updates the `output` column — status and endTime remain
 * the runner's responsibility to set when the run finalises.
 */
export async function flushHistoryOutput(id: number, output: string) {
  return db.history.update({
    where: { id },
    data: { output },
  });
}

export async function getHistory() {
  return db.history.findMany({
    orderBy: { startTime: "desc" },
    include: { macro: { select: { name: true } } },
  });
}

export async function getHistoryItem(id: number) {
  return db.history.findUniqueOrThrow({
    where: { id },
    include: { macro: { select: { name: true } } },
  });
}

export async function deleteAllHistory() {
  return db.history.deleteMany();
}

// ═══════════════════════════════════════════════════════════════════════════
//  SCHEDULES
// ═══════════════════════════════════════════════════════════════════════════

export async function createSchedule(data: {
  macroId: number;
  cronExpression: string;
  enabled?: boolean;
}) {
  return db.schedule.create({
    data: {
      macroId: data.macroId,
      cronExpression: data.cronExpression,
      enabled: data.enabled ?? true,
    },
  });
}

export async function listSchedules() {
  return db.schedule.findMany({
    orderBy: { createdAt: "desc" },
    include: { macro: { select: { name: true } } },
  });
}

export async function getSchedule(id: number) {
  return db.schedule.findUniqueOrThrow({ where: { id } });
}

export async function updateSchedule(
  id: number,
  data: Prisma.ScheduleUpdateInput
) {
  return db.schedule.update({ where: { id }, data });
}

export async function toggleSchedule(id: number) {
  const sched = await db.schedule.findUniqueOrThrow({ where: { id } });
  return db.schedule.update({
    where: { id },
    data: { enabled: !sched.enabled },
  });
}

export async function deleteSchedule(id: number) {
  return db.schedule.delete({ where: { id } });
}

export async function getEnabledSchedules() {
  return db.schedule.findMany({
    where: { enabled: true },
    include: { macro: { select: { name: true } } },
  });
}

// ═══════════════════════════════════════════════════════════════════════════
//  SERVER AGENTS
// ═══════════════════════════════════════════════════════════════════════════

export function upsertServerAgent(data: {
  hostname: string;
  ipAddress?: string | null;
  cpuUsage?: number | null;
  memoryTotal?: number | null;
  memoryUsed?: number | null;
  version?: string | null;
  networkSent?: number | null;
  networkRecv?: number | null;
}) {
  const now = new Date();
  const payload = {
    ipAddress: data.ipAddress,
    cpuUsage: data.cpuUsage,
    memoryTotal: data.memoryTotal,
    memoryUsed: data.memoryUsed,
    lastSeen: now,
    version: data.version,
    networkSent: data.networkSent ?? 0,
    networkRecv: data.networkRecv ?? 0,
  };
  return db.serverAgent.upsert({
    where: { hostname: data.hostname },
    update: payload,
    create: { hostname: data.hostname, ...payload },
  });
}

export async function listServerAgents() {
  return db.serverAgent.findMany({ orderBy: { hostname: "asc" } });
}

export async function getServerAgent(id: number) {
  return db.serverAgent.findUniqueOrThrow({ where: { id } });
}

export async function getAgentByHostname(hostname: string) {
  return db.serverAgent.findUnique({ where: { hostname } });
}

export async function deleteServerAgent(id: number) {
  return db.serverAgent.delete({ where: { id } });
}

export async function markAgentUpdateRequested(id: number, requested: boolean) {
  return db.serverAgent.update({ where: { id }, data: { updateRequested: requested } });
}

export async function markAllAgentsUpdateRequested(requested: boolean) {
  return db.serverAgent.updateMany({ data: { updateRequested: requested } });
}

export async function markAgentRestartRequested(id: number, requested: boolean) {
  return db.serverAgent.update({ where: { id }, data: { restartRequested: requested } });
}

// ═══════════════════════════════════════════════════════════════════════════
//  SCRAPE RESULTS
// ═══════════════════════════════════════════════════════════════════════════

export async function createScrapeResult(data: {
  source: string;
  title: string;
  imageUrl?: string | null;
  magnetLink?: string | null;
  torrentLink?: string | null;
  uniqueKey: string;
  infoHash?: string | null;
  fileSize?: string | null;
  tags?: string | null;
}) {
  // ON CONFLICT(unique_key) DO NOTHING equivalent
  const existing = await db.scrapeResult.findUnique({ where: { uniqueKey: data.uniqueKey } });
  if (existing) return existing;
  return db.scrapeResult.create({ data: { ...data, isHidden: false, isDownloaded: false } });
}

export async function listScrapeResults(source: string) {
  return db.scrapeResult.findMany({
    where: { isHidden: false, source },
    orderBy: { createdAt: "desc" },
  });
}

export async function getScrapeResult(id: number) {
  return db.scrapeResult.findUniqueOrThrow({ where: { id } });
}

export async function scrapeResultExists(uniqueKey: string): Promise<boolean> {
  const r = await db.scrapeResult.findUnique({ where: { uniqueKey } });
  return r !== null;
}

export async function hideScrapeResult(id: number) {
  return db.scrapeResult.update({
    where: { id },
    data: { isHidden: true, hiddenAt: new Date() },
  });
}

export async function hideScrapeResultsBySource(source: string) {
  return db.scrapeResult.updateMany({
    where: { isHidden: false, source },
    data: { isHidden: true, hiddenAt: new Date() },
  });
}

export async function hideAllScrapeResults() {
  return db.scrapeResult.updateMany({
    where: { isHidden: false },
    data: { isHidden: true, hiddenAt: new Date() },
  });
}

export async function getLastHiddenScrapeResult(source: string) {
  return db.scrapeResult.findFirst({
    where: { isHidden: true, isDownloaded: false, source },
    orderBy: { hiddenAt: "desc" },
  });
}

export async function undoHideScrapeResult(id: number) {
  return db.scrapeResult.update({
    where: { id },
    data: { isHidden: false, hiddenAt: null },
  });
}

export async function markScrapeResultDownloaded(id: number) {
  return db.scrapeResult.update({
    where: { id },
    data: { isDownloaded: true, isHidden: true, hiddenAt: new Date() },
  });
}

export async function deleteScrapeResultsBySource(source: string) {
  return db.scrapeResult.deleteMany({
    where: { isDownloaded: false, source },
  });
}

export async function deleteAllScrapeResults() {
  return db.scrapeResult.deleteMany({ where: { isDownloaded: false } });
}

export async function cleanOldScrapeResults() {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - SCRAPE_CLEANUP_DAYS);
  return db.scrapeResult.deleteMany({
    where: { isHidden: true, createdAt: { lt: cutoff } },
  });
}

// ═══════════════════════════════════════════════════════════════════════════
//  SETTINGS
// ═══════════════════════════════════════════════════════════════════════════

export async function getSetting(key: string): Promise<string | null> {
  const r = await db.setting.findUnique({ where: { key } });
  return r?.value ?? null;
}

export async function updateSetting(key: string, value: string) {
  return db.setting.upsert({
    where: { key },
    update: { value },
    create: { key, value },
  });
}

// ═══════════════════════════════════════════════════════════════════════════
//  CONFIG
// ═══════════════════════════════════════════════════════════════════════════

export async function getConfig() {
  let config = await db.config.findUnique({ where: { id: 1 } });
  if (!config) {
    config = await db.config.create({
      data: { id: 1, configJson: '{"real_debrid_api_key":""}' },
    });
  }
  return config;
}

export async function upsertConfig(configJson: string) {
  return db.config.upsert({
    where: { id: 1 },
    update: { configJson },
    create: { id: 1, configJson },
  });
}

// ═══════════════════════════════════════════════════════════════════════════
//  NZB / DEBRID FILE TREES
// ═══════════════════════════════════════════════════════════════════════════

export function upsertNzbFile(data: {
  path: string;
  name: string;
  isDir: boolean;
  parentPath: string;
  linkTarget?: string | null;
  fileCount?: number | null;
  updatedAt?: Date;
}) {
  const payload = {
    name: data.name,
    isDir: data.isDir,
    parentPath: data.parentPath,
    linkTarget: data.linkTarget,
    fileCount: data.fileCount ?? 0,
    updatedAt: data.updatedAt ?? new Date(),
  };
  return db.nzbFile.upsert({
    where: { path: data.path },
    update: payload,
    create: { path: data.path, ...payload },
  });
}

export async function deleteNzbFilesOlderThan(date: Date) {
  return db.nzbFile.deleteMany({ where: { updatedAt: { lt: date } } });
}

export async function getNzbRootFiles() {
  return db.nzbFile.findMany({
    where: { parentPath: "" },
    orderBy: [{ isDir: "desc" }, { name: "asc" }],
  });
}

export async function getNzbChildren(parentPath: string, limit = 1000, offset = 0) {
  return db.nzbFile.findMany({
    where: { parentPath },
    orderBy: [{ isDir: "desc" }, { name: "asc" }],
    take: limit,
    skip: offset,
  });
}

export async function countNzbChildren(parentPath: string) {
  return db.nzbFile.count({ where: { parentPath } });
}

export async function searchNzbFiles(query: string, limit = 100, offset = 0) {
  return db.nzbFile.findMany({
    where: { name: { contains: query } },
    orderBy: [{ isDir: "desc" }, { name: "asc" }],
    take: limit,
    skip: offset,
  });
}

export async function countSearchNzbFiles(query: string) {
  return db.nzbFile.count({ where: { name: { contains: query } } });
}

export async function deleteNzbByPaths(paths: string[]) {
  return db.nzbFile.deleteMany({ where: { path: { in: paths } } });
}

// ── Debrid mirrors ────────────────────────────────────────────────────────

export function upsertDebridFile(data: {
  path: string;
  name: string;
  isDir: boolean;
  parentPath: string;
  linkTarget?: string | null;
  fileCount?: number | null;
  updatedAt?: Date;
}) {
  const payload = {
    name: data.name,
    isDir: data.isDir,
    parentPath: data.parentPath,
    linkTarget: data.linkTarget,
    fileCount: data.fileCount ?? 0,
    updatedAt: data.updatedAt ?? new Date(),
  };
  return db.debridFile.upsert({
    where: { path: data.path },
    update: payload,
    create: { path: data.path, ...payload },
  });
}

export async function deleteDebridFilesOlderThan(date: Date) {
  return db.debridFile.deleteMany({ where: { updatedAt: { lt: date } } });
}

export async function getDebridRootFiles() {
  return db.debridFile.findMany({
    where: { parentPath: "" },
    orderBy: [{ isDir: "desc" }, { name: "asc" }],
  });
}

export async function getDebridChildren(parentPath: string, limit = 1000, offset = 0) {
  return db.debridFile.findMany({
    where: { parentPath },
    orderBy: [{ isDir: "desc" }, { name: "asc" }],
    take: limit,
    skip: offset,
  });
}

export async function countDebridChildren(parentPath: string) {
  return db.debridFile.count({ where: { parentPath } });
}

export async function searchDebridFiles(query: string, limit = 100, offset = 0) {
  return db.debridFile.findMany({
    where: { name: { contains: query } },
    orderBy: [{ isDir: "desc" }, { name: "asc" }],
    take: limit,
    skip: offset,
  });
}

export async function countSearchDebridFiles(query: string) {
  return db.debridFile.count({ where: { name: { contains: query } } });
}

export async function deleteDebridByPaths(paths: string[]) {
  return db.debridFile.deleteMany({ where: { path: { in: paths } } });
}

// ══════════════════════════════════════════════════════════════════════════
//  FILE CHECKS (broken-link finder)
// ══════════════════════════════════════════════════════════════════════════

export type FileCheckStatus = "pending" | "checking" | "ok" | "broken";

export interface FileCheckRow {
  id: number;
  filePath: string;
  lastChecked: Date | null;
  brokenCount: number;
  isIgnored: boolean;
  errorMessage: string | null;
  status: string;
  checkCount: number;
  mediaDir: string | null;
  fileSize: number | null;
  createdAt: Date;
}

/**
 * Upsert by filePath. Only writes `mediaDir` and `fileSize` on create — on
 * update we leave the existing values alone so a probe's later `fileSize`
 * write (via `setFileCheckResult`) isn't clobbered by a stale discovery
 * walk that runs between checks.
 */
export async function upsertFileCheck(data: {
  filePath: string;
  mediaDir: string;
  fileSize?: number | null;
}) {
  return db.fileCheck.upsert({
    where: { filePath: data.filePath },
    update: {},
    create: {
      filePath: data.filePath,
      mediaDir: data.mediaDir,
      fileSize: data.fileSize ?? null,
      status: "pending",
    },
  });
}

export interface ListFileChecksOptions {
  status?: string;
  mediaDir?: string;
  search?: string;
  limit?: number;
  offset?: number;
}

export async function listFileChecks(opts: ListFileChecksOptions = {}) {
  const where: Record<string, unknown> = { isIgnored: false };
  if (opts.status) where.status = opts.status;
  if (opts.mediaDir) where.mediaDir = opts.mediaDir;
  if (opts.search) where.filePath = { contains: opts.search };
  return db.fileCheck.findMany({
    where,
    orderBy: [{ lastChecked: "asc" }],
    take: opts.limit ?? 100,
    skip: opts.offset ?? 0,
  });
}

export async function countFileChecks(opts: ListFileChecksOptions = {}) {
  const where: Record<string, unknown> = { isIgnored: false };
  if (opts.status) where.status = opts.status;
  if (opts.mediaDir) where.mediaDir = opts.mediaDir;
  if (opts.search) where.filePath = { contains: opts.search };
  return db.fileCheck.count({ where });
}

export async function getFileCheck(id: number) {
  return db.fileCheck.findUniqueOrThrow({ where: { id } });
}

export async function getFileCheckByPath(filePath: string) {
  return db.fileCheck.findUnique({ where: { filePath } });
}

/**
 * Pick the next batch of files to probe. A row is due if:
 *  - `isIgnored = false`
 *  - AND (`status = 'pending'` OR `lastChecked IS NULL` OR
 *    `lastChecked < now - recheckAgeDays`)
 *  - AND `status != 'checking'` (we never probe a row another worker has in
 *    flight). `resetStaleChecking` is expected to have already flipped
 *    timed-out `checking` rows back to `pending`.
 *
 * Ordered by oldest `lastChecked` first (NULLs sort first in SQLite), so
 * never-checked files are probed before recently-ok ones.
 */
export async function pickFilesDueForCheck(
  limit: number,
  recheckAgeDays: number,
) {
  const cutoff = new Date(Date.now() - recheckAgeDays * 24 * 60 * 60 * 1000);
  return db.fileCheck.findMany({
    where: {
      isIgnored: false,
      OR: [
        { status: "pending" },
        { lastChecked: null },
        { lastChecked: { lt: cutoff } },
      ],
      NOT: { status: "checking" },
    },
    orderBy: [{ lastChecked: "asc" }],
    take: limit,
  });
}

/** Mark a row as in-flight. */
export async function markFileChecking(id: number) {
  return db.fileCheck.update({
    where: { id },
    data: { status: "checking" },
  });
}

/** Write the result of a probe. Increments checkCount always; brokenCount
 *  only on failure. */
export async function setFileCheckResult(
  id: number,
  result: { ok: boolean; error?: string | null; fileSize?: number | null },
) {
  return db.fileCheck.update({
    where: { id },
    data: {
      status: result.ok ? "ok" : "broken",
      lastChecked: new Date(),
      errorMessage: result.ok ? null : (result.error ?? "unknown error"),
      fileSize: result.fileSize ?? undefined,
      checkCount: { increment: 1 },
      ...(result.ok ? {} : { brokenCount: { increment: 1 } }),
    },
  });
}

/**
 * Reset rows that are stuck in `checking` (i.e. the worker crashed mid-probe)
 * back to `pending` so the next tick can pick them up.
 */
export async function resetStaleChecking(graceMs: number) {
  const cutoff = new Date(Date.now() - graceMs);
  return db.fileCheck.updateMany({
    where: { status: "checking", lastChecked: { lt: cutoff } },
    data: { status: "pending" },
  });
}

export async function markFileRecheck(id: number) {
  return db.fileCheck.update({
    where: { id },
    data: { status: "pending" },
  });
}

export async function markAllFilesRecheck(opts: { mediaDir?: string } = {}) {
  return db.fileCheck.updateMany({
    where: {
      isIgnored: false,
      ...(opts.mediaDir ? { mediaDir: opts.mediaDir } : {}),
    },
    data: { status: "pending" },
  });
}

export async function deleteFileCheckRow(id: number) {
  return db.fileCheck.delete({ where: { id } });
}

export async function toggleFileCheckIgnore(id: number) {
  const row = await db.fileCheck.findUniqueOrThrow({ where: { id } });
  return db.fileCheck.update({
    where: { id },
    data: { isIgnored: !row.isIgnored },
  });
}

// ── BL Finder config + status (settings table) ──────────────────────────

export const BLFINDER_CONFIG_KEY = "blfinder_config";
export const BLFINDER_STATUS_KEY = "blfinder_status";

export interface BlFinderConfig {
  enabled: boolean;
  intervalSec: number;
  batchSize: number;
  concurrency: number;
  timeoutSec: number;
  recheckAgeDays: number;
  discoverIntervalSec: number;
  mediaDirs: string[];
}

export const DEFAULT_BLFINDER_CONFIG: BlFinderConfig = {
  enabled: true,
  intervalSec: 60,
  batchSize: 5,
  concurrency: 2,
  timeoutSec: 30,
  recheckAgeDays: 7,
  discoverIntervalSec: 30 * 60,
  mediaDirs: [],
};

export async function getBlFinderConfig(): Promise<BlFinderConfig> {
  const row = await db.setting.findUnique({ where: { key: BLFINDER_CONFIG_KEY } });
  if (!row?.value) return { ...DEFAULT_BLFINDER_CONFIG };
  try {
    const parsed = JSON.parse(row.value) as Partial<BlFinderConfig>;
    return { ...DEFAULT_BLFINDER_CONFIG, ...parsed };
  } catch {
    return { ...DEFAULT_BLFINDER_CONFIG };
  }
}

export async function setBlFinderConfig(config: Partial<BlFinderConfig>): Promise<BlFinderConfig> {
  const current = await getBlFinderConfig();
  const merged: BlFinderConfig = { ...current, ...config };
  await db.setting.upsert({
    where: { key: BLFINDER_CONFIG_KEY },
    update: { value: JSON.stringify(merged) },
    create: { key: BLFINDER_CONFIG_KEY, value: JSON.stringify(merged) },
  });
  return merged;
}

export interface BlFinderStatus {
  running: boolean;
  setAt: number;
  lastPassAt: number | null;
  processed: number;
  ok: number;
  broken: number;
  error: string | null;
}

const BLFINDER_STATUS_STALE_MS = 5 * 60 * 1000;

export const DEFAULT_BLFINDER_STATUS: BlFinderStatus = {
  running: false,
  setAt: 0,
  lastPassAt: null,
  processed: 0,
  ok: 0,
  broken: 0,
  error: null,
};

export async function getBlFinderStatus(): Promise<BlFinderStatus> {
  const row = await db.setting.findUnique({ where: { key: BLFINDER_STATUS_KEY } });
  if (!row?.value) return { ...DEFAULT_BLFINDER_STATUS };
  try {
    const parsed = JSON.parse(row.value) as BlFinderStatus;
    if (parsed.running && Date.now() - parsed.setAt > BLFINDER_STATUS_STALE_MS) {
      const cleared: BlFinderStatus = { ...parsed, running: false };
      await setBlFinderStatus(cleared).catch(() => {});
      return cleared;
    }
    return parsed;
  } catch {
    return { ...DEFAULT_BLFINDER_STATUS };
  }
}

export async function setBlFinderStatus(status: Partial<BlFinderStatus>): Promise<BlFinderStatus> {
  // Read the current row directly (bypass getBlFinderStatus to avoid
  // recursion — getBlFinderStatus calls setBlFinderStatus for stale flags).
  let current: BlFinderStatus;
  const row = await db.setting.findUnique({ where: { key: BLFINDER_STATUS_KEY } });
  if (row?.value) {
    try {
      current = JSON.parse(row.value) as BlFinderStatus;
    } catch {
      current = { ...DEFAULT_BLFINDER_STATUS };
    }
  } else {
    current = { ...DEFAULT_BLFINDER_STATUS };
  }
  const merged: BlFinderStatus = { ...current, ...status, setAt: Date.now() };
  await db.setting.upsert({
    where: { key: BLFINDER_STATUS_KEY },
    update: { value: JSON.stringify(merged) },
    create: { key: BLFINDER_STATUS_KEY, value: JSON.stringify(merged) },
  });
  return merged;
}


// ═══════════════════════════════════════════════════════════════════════════
//  DATABASE METADATA (for the Database viewer page)
// ═══════════════════════════════════════════════════════════════════════════

export async function listTableNames(): Promise<string[]> {
  const result = await db.$queryRawUnsafe<{ name: string }[]>(
    `SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE '_prisma_%' AND name != 'sqlite_sequence' ORDER BY name`
  );
  return result.map((r) => r.name);
}

export async function getTableInfo(tableName: string): Promise<{ name: string; type: string }[]> {
  return db.$queryRawUnsafe<{ name: string; type: string }[]>(
    `PRAGMA table_info(\`${tableName}\`)`
  );
}

export async function queryTable(
  tableName: string,
  filters: Record<string, string>,
  limit = 100
): Promise<Record<string, unknown>[]> {
  const whereClauses: string[] = [];
  const params: unknown[] = [];

  for (const [col, val] of Object.entries(filters)) {
    if (val) {
      whereClauses.push(`\`${col}\` LIKE ?`);
      params.push(`%${val}%`);
    }
  }

  const where =
    whereClauses.length > 0 ? `WHERE ${whereClauses.join(" AND ")}` : "";
  const sql = `SELECT * FROM \`${tableName}\` ${where} LIMIT ?`;
  params.push(limit);

  return db.$queryRawUnsafe<Record<string, unknown>[]>(sql, ...params);
}
