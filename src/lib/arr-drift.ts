import { ARR_INSTANCE_DEFINITIONS, type ArrInstanceSlug } from "@/lib/arr-config";
import { resolveConfig } from "@/lib/config";
import type { ArrInstance } from "@/types";

export const ARR_DRIFT_CATEGORIES = [
  "qualityProfiles",
  "customFormats",
  "delayProfiles",
  "rootFolders",
  "tags",
  "naming",
  "downloadClients",
] as const;

export type ArrDriftCategory = (typeof ARR_DRIFT_CATEGORIES)[number];

export const ARR_DRIFT_LABELS: Record<ArrDriftCategory, string> = {
  qualityProfiles: "Quality profiles",
  customFormats: "Custom formats",
  delayProfiles: "Delay profiles",
  rootFolders: "Root folders",
  tags: "Tags",
  naming: "Naming settings",
  downloadClients: "Download-client assignments",
};

const SETTINGS_PATHS: Record<ArrDriftCategory, string> = {
  qualityProfiles: "/settings/profiles",
  customFormats: "/settings/customformats",
  delayProfiles: "/settings/delayprofiles",
  rootFolders: "/settings/mediamanagement",
  tags: "/settings/tags",
  naming: "/settings/mediamanagement",
  downloadClients: "/settings/downloadclients",
};

type JsonObject = Record<string, unknown>;
type CategoryValues = Record<ArrDriftCategory, unknown>;

export interface ArrDriftDifference {
  category: ArrDriftCategory;
  label: string;
  detail: string;
  href: string;
}

export interface ArrDriftInstanceResult {
  slug: ArrInstanceSlug;
  name: string;
  type: "radarr" | "sonarr";
  url: string;
  status: "baseline" | "match" | "drift" | "error" | "unconfigured" | "incompatible";
  differences: ArrDriftDifference[];
  error?: string;
}

export interface ArrDriftReport {
  generatedAt: string;
  baselineSlug: ArrInstanceSlug;
  instances: ArrDriftInstanceResult[];
}

interface RawSnapshot {
  qualityProfiles: JsonObject[];
  customFormats: JsonObject[];
  delayProfiles: JsonObject[];
  rootFolders: JsonObject[];
  tags: JsonObject[];
  naming: JsonObject;
  downloadClients: JsonObject[];
}

function stable(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stable).sort().join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.entries(value as JsonObject)
      .filter(([key]) => key !== "id")
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, child]) => `${JSON.stringify(key)}:${stable(child)}`)
      .join(",")}}`;
  }
  return JSON.stringify(value) ?? "undefined";
}

function namedDetail(baseline: unknown, current: unknown): string {
  if (!Array.isArray(baseline) || !Array.isArray(current)) return "Settings differ";
  const toMap = (items: unknown[]) => new Map(items.map((item) => {
    const object = item as JsonObject;
    const name = String(object.name ?? object.label ?? object.path ?? "setting");
    return [name, stable(object)];
  }));
  const before = toMap(baseline);
  const after = toMap(current);
  const missing = [...before.keys()].filter((name) => !after.has(name));
  const extra = [...after.keys()].filter((name) => !before.has(name));
  const changed = [...before.keys()].filter((name) => after.has(name) && before.get(name) !== after.get(name));
  return [
    missing.length ? `Missing: ${missing.join(", ")}` : "",
    extra.length ? `Extra: ${extra.join(", ")}` : "",
    changed.length ? `Changed: ${changed.join(", ")}` : "",
  ].filter(Boolean).join(" · ") || "Settings differ";
}

function normalize(raw: RawSnapshot): CategoryValues {
  const tagNames = new Map(raw.tags.map((tag) => [Number(tag.id), String(tag.label)]));
  const formatNames = new Map(raw.customFormats.map((format) => [Number(format.id), String(format.name)]));

  const qualityNames = new Map<number, string>();
  const qualityItems = (items: unknown): unknown[] => Array.isArray(items) ? items.map((value) => {
    const item = value as JsonObject;
    const quality = item.quality as JsonObject | undefined;
    if (quality?.id != null) qualityNames.set(Number(quality.id), String(quality.name));
    return {
      name: String(quality?.name ?? item.name ?? ""),
      allowed: Boolean(item.allowed),
      items: qualityItems(item.items),
    };
  }) : [];
  raw.qualityProfiles.forEach((profile) => qualityItems(profile.items));

  return {
    qualityProfiles: raw.qualityProfiles.map((profile) => ({
      name: profile.name,
      upgradeAllowed: profile.upgradeAllowed,
      cutoff: qualityNames.get(Number(profile.cutoff)) ?? profile.cutoff,
      items: qualityItems(profile.items),
      formatItems: Array.isArray(profile.formatItems) ? profile.formatItems.map((value) => {
        const item = value as JsonObject;
        return { name: formatNames.get(Number(item.format)) ?? item.name ?? item.format, score: item.score };
      }) : [],
    })),
    customFormats: raw.customFormats.map((format) => ({
      name: format.name,
      includeCustomFormatWhenRenaming: format.includeCustomFormatWhenRenaming,
      specifications: format.specifications,
    })),
    delayProfiles: raw.delayProfiles.map((profile) => ({
      name: `Order ${profile.order}`,
      enable: profile.enable,
      order: profile.order,
      tags: Array.isArray(profile.tags) ? profile.tags.map((id) => tagNames.get(Number(id)) ?? `unknown:${id}`).sort() : [],
      preferredProtocol: profile.preferredProtocol,
      usenetDelay: profile.usenetDelay,
      torrentDelay: profile.torrentDelay,
    })),
    rootFolders: raw.rootFolders.map((folder) => ({ name: folder.path, path: folder.path })),
    tags: raw.tags.map((tag) => ({ name: tag.label })),
    naming: raw.naming,
    downloadClients: raw.downloadClients.map((client) => ({
      name: client.name,
      enable: client.enable,
      priority: client.priority,
      protocol: client.protocol,
      implementation: client.implementation,
      tags: Array.isArray(client.tags) ? client.tags.map((id) => tagNames.get(Number(id)) ?? `unknown:${id}`).sort() : [],
    })),
  };
}

export function compareArrSnapshots(
  baseline: CategoryValues,
  current: CategoryValues,
  instanceUrl: string,
): ArrDriftDifference[] {
  return ARR_DRIFT_CATEGORIES.flatMap((category) => stable(baseline[category]) === stable(current[category]) ? [] : [{
    category,
    label: ARR_DRIFT_LABELS[category],
    detail: namedDetail(baseline[category], current[category]),
    href: `${instanceUrl.replace(/\/+$/, "")}${SETTINGS_PATHS[category]}`,
  }]);
}

async function fetchJson<T>(instance: ArrInstance, path: string): Promise<T> {
  const response = await fetch(`${instance.url.replace(/\/+$/, "")}/api/v3${path}`, {
    headers: { "X-Api-Key": instance.apiKey },
    signal: AbortSignal.timeout(10_000),
    cache: "no-store",
  });
  if (!response.ok) throw new Error(`Arr returned HTTP ${response.status}`);
  return response.json() as Promise<T>;
}

async function loadSnapshot(instance: ArrInstance): Promise<CategoryValues> {
  const [qualityProfiles, customFormats, delayProfiles, rootFolders, tags, naming, downloadClients] = await Promise.all([
    fetchJson<JsonObject[]>(instance, "/qualityprofile"),
    fetchJson<JsonObject[]>(instance, "/customformat"),
    fetchJson<JsonObject[]>(instance, "/delayprofile"),
    fetchJson<JsonObject[]>(instance, "/rootfolder"),
    fetchJson<JsonObject[]>(instance, "/tag"),
    fetchJson<JsonObject>(instance, "/config/naming"),
    fetchJson<JsonObject[]>(instance, "/downloadclient"),
  ]);
  return normalize({ qualityProfiles, customFormats, delayProfiles, rootFolders, tags, naming, downloadClients });
}

export async function getArrDriftReport(requestedBaseline?: string): Promise<ArrDriftReport> {
  const config = await resolveConfig();
  const definitions = ARR_INSTANCE_DEFINITIONS;
  const baselineDef = definitions.find((definition) => definition.slug === requestedBaseline)
    ?? definitions.find((definition) => config.arrInstances.find((instance) => instance.name === definition.name)?.apiKey)
    ?? definitions[0];
  const snapshots = new Map<string, CategoryValues>();
  const errors = new Map<string, string>();

  await Promise.all(config.arrInstances.filter((instance) => instance.apiKey && instance.type === baselineDef.type).map(async (instance) => {
    try {
      snapshots.set(instance.name, await loadSnapshot(instance));
    } catch (error) {
      errors.set(instance.name, error instanceof Error ? error.message : "Arr request failed");
    }
  }));

  const baseline = snapshots.get(baselineDef.name);
  const instances = definitions.map((definition): ArrDriftInstanceResult => {
    const instance = config.arrInstances.find((candidate) => candidate.name === definition.name)!;
    const base = { slug: definition.slug, name: definition.name, type: definition.type, url: instance.url, differences: [] };
    if (!instance.apiKey) return { ...base, status: "unconfigured" };
    if (definition.slug === baselineDef.slug) {
      return baseline ? { ...base, status: "baseline" } : { ...base, status: "error", error: errors.get(instance.name) ?? "Baseline unavailable" };
    }
    if (definition.type !== baselineDef.type) return { ...base, status: "incompatible" };
    const snapshot = snapshots.get(instance.name);
    if (!snapshot) return { ...base, status: "error", error: errors.get(instance.name) ?? "Arr request failed" };
    if (!baseline) return { ...base, status: "error", error: "Baseline unavailable" };
    const differences = compareArrSnapshots(baseline, snapshot, instance.url);
    return { ...base, status: differences.length ? "drift" : "match", differences };
  });

  return { generatedAt: new Date().toISOString(), baselineSlug: baselineDef.slug, instances };
}
