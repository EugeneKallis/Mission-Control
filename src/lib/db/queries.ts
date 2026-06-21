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
