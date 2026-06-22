#!/usr/bin/env bun
/**
 * Sync profiles — interactively sync Tags, Quality Profiles, and
 * Delay Profiles between a master and one or more slave Sonarr/Radarr
 * instances.
 *
 * Tags must be synced first because Delay Profiles reference them by
 * tag id; missing tags cause silent drops.
 *
 * Usage:
 *   just script scripts/arr/sync-profiles.ts
 *     # interactive: picks master, asks which slaves, walks each profile type
 *   just script scripts/arr/sync-profiles.ts -- --dry-run
 *     # show what would be created, skip the actual writes
 *
 * Env:
 *   Per-instance API keys via ARR__<NAME>__API_KEY (the AppConfig default).
 */

import { createInterface } from "node:readline/promises";
import { stdin, stdout } from "node:process";
import { getConfig } from "@/lib/config";
import { parseArgs } from "../_lib/cli";
import { banner, error, info, warn } from "../_lib/log";
import type { ArrInstance } from "@/types";

interface Tag {
  id: number;
  label: string;
}

interface QualityProfile {
  id: number;
  name: string;
  upgradeAllowed: boolean;
  cutoff: number;
  items: { quality?: { id: number; name: string }; name: string; allowed: boolean }[];
  formatItems?: unknown[];
}

interface DelayProfile {
  id: number;
  enable: boolean;
  order: number;
  tags: number[];
  preferredProtocol: string;
  usenetDelay: number;
  torrentDelay: number;
}

async function main(argv?: string[]) {
  const args = parseArgs({ dryRun: { type: "boolean", default: false } }, argv);
  banner("Sync profiles", { dryRun: args.dryRun });

  const config = getConfig();
  const rl = createInterface({ input: stdin, output: stdout });
  try {
    const type = (await rl.question("Sync Radarr or Sonarr? [radarr|sonarr]: ")).trim().toLowerCase();
    if (type !== "radarr" && type !== "sonarr") {
      error("Type must be 'radarr' or 'sonarr'");
      process.exit(1);
    }

    const all = config.arrInstances.filter((i) => i.type === type && i.apiKey);
    if (all.length < 2) {
      error(`Need at least 2 ${type} instances with API keys to sync`);
      process.exit(1);
    }

    const master = await pickInstance(rl, "master", all);
    const slaves = await pickSlaves(rl, master, all);

    info(`Master: ${master.name}`);
    info(`Slaves: ${slaves.map((s) => s.name).join(", ")}`);

    await syncTags(rl, master, slaves, args.dryRun);
    await syncQualityProfiles(rl, master, slaves, args.dryRun);
    await syncDelayProfiles(rl, master, slaves, args.dryRun);

    info("Done.");
  } finally {
    rl.close();
  }
}

async function pickInstance(
  rl: ReturnType<typeof createInterface>,
  role: string,
  instances: ArrInstance[],
): Promise<ArrInstance> {
  console.log(`\nAvailable ${role} candidates:`);
  instances.forEach((i, idx) => console.log(`  [${idx + 1}] ${i.name}  (${i.url})`));
  const answer = (await rl.question(`Pick ${role} (1-${instances.length}): `)).trim();
  const idx = Number(answer) - 1;
  if (!Number.isInteger(idx) || idx < 0 || idx >= instances.length) {
    throw new Error(`Invalid ${role} choice: ${answer}`);
  }
  return instances[idx];
}

async function pickSlaves(
  rl: ReturnType<typeof createInterface>,
  master: ArrInstance,
  instances: ArrInstance[],
): Promise<ArrInstance[]> {
  const others = instances.filter((i) => i.name !== master.name);
  const answer = (await rl.question("Comma-separated slave indices (or 'all'): ")).trim();
  if (answer.toLowerCase() === "all") return others;
  const picks = answer
    .split(",")
    .map((s) => Number(s.trim()) - 1)
    .filter((n) => Number.isInteger(n) && n >= 0 && n < others.length);
  if (picks.length === 0) throw new Error("No valid slaves selected");
  return picks.map((i) => others[i]);
}

async function syncTags(
  rl: ReturnType<typeof createInterface>,
  master: ArrInstance,
  slaves: ArrInstance[],
  dryRun: boolean,
) {
  const masterTags = await fetchTags(master);
  info(`[master ${master.name}] ${masterTags.length} tags`);

  for (const slave of slaves) {
    const slaveTags = await fetchTags(slave);
    const slaveLabels = new Set(slaveTags.map((t) => t.label));
    const missing = masterTags.filter((t) => !slaveLabels.has(t.label));
    info(`[slave ${slave.name}] missing ${missing.length} tag(s)`);
    if (missing.length === 0) continue;

    if (!(await confirm(rl, `  Create ${missing.length} missing tag(s) on ${slave.name}?`))) continue;

    for (const t of missing) {
      if (dryRun) {
        info(`  would create tag "${t.label}" on ${slave.name}`);
        continue;
      }
      const id = await createTag(slave, t.label);
      if (id != null) info(`  created tag "${t.label}" (id=${id}) on ${slave.name}`);
    }
  }
}

async function syncQualityProfiles(
  rl: ReturnType<typeof createInterface>,
  master: ArrInstance,
  slaves: ArrInstance[],
  dryRun: boolean,
) {
  const masterProfiles = await fetchQualityProfiles(master);
  info(`[master ${master.name}] ${masterProfiles.length} quality profiles`);

  for (const slave of slaves) {
    const slaveProfiles = await fetchQualityProfiles(slave);
    const slaveNames = new Set(slaveProfiles.map((p) => p.name));
    const missing = masterProfiles.filter((p) => !slaveNames.has(p.name));
    info(`[slave ${slave.name}] missing ${missing.length} quality profile(s)`);
    if (missing.length === 0) continue;

    if (!(await confirm(rl, `  Create ${missing.length} quality profile(s) on ${slave.name}?`))) continue;

    for (const p of missing) {
      if (dryRun) {
        info(`  would create quality profile "${p.name}" on ${slave.name}`);
        continue;
      }
      const id = await createQualityProfile(slave, p);
      if (id != null) info(`  created quality profile "${p.name}" (id=${id}) on ${slave.name}`);
    }
  }
}

async function syncDelayProfiles(
  rl: ReturnType<typeof createInterface>,
  master: ArrInstance,
  slaves: ArrInstance[],
  dryRun: boolean,
) {
  const masterDelays = await fetchDelayProfiles(master);
  info(`[master ${master.name}] ${masterDelays.length} delay profile(s)`);

  for (const slave of slaves) {
    const slaveDelays = await fetchDelayProfiles(slave);
    const slaveFingerprints = new Set(slaveDelays.map(delayFingerprint));
    const missing = masterDelays.filter((d) => !slaveFingerprints.has(delayFingerprint(d)));
    info(`[slave ${slave.name}] missing ${missing.length} delay profile(s)`);
    if (missing.length === 0) continue;

    if (!(await confirm(rl, `  Create ${missing.length} delay profile(s) on ${slave.name}?`))) continue;

    // We need the slave's tag-id map so we can rewrite master tag ids.
    const slaveTags = await fetchTags(slave);
    const tagIdByLabel = new Map(slaveTags.map((t) => [t.label, t.id] as const));
    const masterTags = await fetchTags(master);
    const masterLabelById = new Map(masterTags.map((t) => [t.id, t.label] as const));

    for (const d of missing) {
      const newTagIds = d.tags
        .map((id) => masterLabelById.get(id))
        .filter((label): label is string => label != null)
        .map((label) => tagIdByLabel.get(label))
        .filter((id): id is number => id != null);

      if (dryRun) {
        info(`  would create delay profile (order=${d.order}, tags=[${newTagIds.join(",")}]) on ${slave.name}`);
        continue;
      }
      const id = await createDelayProfile(slave, { ...d, tags: newTagIds });
      if (id != null) info(`  created delay profile (id=${id}) on ${slave.name}`);
    }
  }
}

function delayFingerprint(d: DelayProfile): string {
  return `${d.enable}|${d.order}|${[...d.tags].sort().join(",")}|${d.preferredProtocol}|${d.usenetDelay}|${d.torrentDelay}`;
}

async function confirm(rl: ReturnType<typeof createInterface>, prompt: string): Promise<boolean> {
  const answer = (await rl.question(`${prompt} [y/N]: `)).trim().toLowerCase();
  return answer === "y" || answer === "yes";
}

async function arrGet<T>(inst: ArrInstance, path: string): Promise<T> {
  const res = await fetch(`${inst.url.replace(/\/+$/, "")}/api/v3${path}`, {
    headers: { "X-Api-Key": inst.apiKey },
  });
  if (!res.ok) throw new Error(`Arr GET ${path} on ${inst.name} failed: ${res.status}`);
  return res.json() as Promise<T>;
}

async function arrPost<T>(inst: ArrInstance, path: string, body: unknown): Promise<T | null> {
  const res = await fetch(`${inst.url.replace(/\/+$/, "")}/api/v3${path}`, {
    method: "POST",
    headers: { "X-Api-Key": inst.apiKey, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    warn(`Arr POST ${path} on ${inst.name} failed: ${res.status} ${await res.text()}`);
    return null;
  }
  return res.json() as Promise<T>;
}

const fetchTags = (i: ArrInstance) => arrGet<Tag[]>(i, "/tag");
const fetchQualityProfiles = (i: ArrInstance) => arrGet<QualityProfile[]>(i, "/qualityprofile");
const fetchDelayProfiles = (i: ArrInstance) => arrGet<DelayProfile[]>(i, "/delayprofile");

const createTag = (i: ArrInstance, label: string) =>
  arrPost<{ id: number }>(i, "/tag", { label }).then((r) => r?.id ?? null);

const createQualityProfile = (i: ArrInstance, profile: QualityProfile) =>
  arrPost<{ id: number }>(i, "/qualityprofile", profile).then((r) => r?.id ?? null);

const createDelayProfile = (i: ArrInstance, delay: DelayProfile) =>
  arrPost<{ id: number }>(i, "/delayprofile", delay).then((r) => r?.id ?? null);

export { main };

if (import.meta.main) {
  main().catch((err) => {
    error("sync-profiles failed", err);
    process.exit(1);
  });
}
