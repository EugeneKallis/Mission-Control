import { getSetting, updateSetting } from "@/lib/db/queries";
import { defaultSidebarLayout, NAV_BY_KEY, NAV_ENTRIES, type SidebarLayout } from "@/lib/nav-registry";

export const SIDEBAR_LAYOUT_KEY = "sidebar:layout";

const configurableKeys = new Set(NAV_ENTRIES.filter((entry) => !entry.fixed).map((entry) => entry.key));

export function normalizeSidebarLayout(input: unknown): SidebarLayout {
  if (!input || typeof input !== "object") throw new Error("Layout must be an object");
  const value = input as Record<string, unknown>;
  if (!Array.isArray(value.groups) || value.groups.length === 0) throw new Error("groups must be a non-empty array");
  if (!Array.isArray(value.hidden) || value.hidden.some((key) => typeof key !== "string")) throw new Error("hidden must be an array of strings");

  const groupIds = new Set<string>();
  const seen = new Set<string>();
  const groups = value.groups.map((raw, index) => {
    if (!raw || typeof raw !== "object") throw new Error(`groups[${index}] must be an object`);
    const group = raw as Record<string, unknown>;
    const id = typeof group.id === "string" ? group.id.trim() : "";
    const name = typeof group.name === "string" ? group.name.trim() : "";
    if (!id || groupIds.has(id)) throw new Error("group ids must be unique non-empty strings");
    if (!name) throw new Error("group names must be non-empty");
    if (typeof group.collapsed !== "boolean") throw new Error(`group ${id} collapsed must be boolean`);
    if (!Array.isArray(group.items) || group.items.some((key) => typeof key !== "string")) throw new Error(`group ${id} items must be strings`);
    groupIds.add(id);
    const items = group.items.map((key) => key.trim());
    for (const key of items) {
      if (!configurableKeys.has(key) || !NAV_BY_KEY[key]) throw new Error(`Unknown or fixed navigation key: ${key}`);
      if (seen.has(key)) throw new Error(`Navigation key appears more than once: ${key}`);
      seen.add(key);
    }
    return { id, name, collapsed: group.collapsed, items };
  });

  const hidden = value.hidden.map((key) => key.trim());
  for (const key of hidden) {
    if (!configurableKeys.has(key) || !NAV_BY_KEY[key]) throw new Error(`Unknown or fixed navigation key: ${key}`);
    if (seen.has(key)) throw new Error(`Navigation key appears more than once: ${key}`);
    seen.add(key);
  }
  for (const key of configurableKeys) if (!seen.has(key)) throw new Error(`Missing navigation key: ${key}`);
  if (!groupIds.has("ungrouped")) groups.push({ id: "ungrouped", name: "Ungrouped", collapsed: false, items: [] });
  return { groups, hidden };
}

export async function getSidebarLayout(): Promise<SidebarLayout> {
  const stored = await getSetting(SIDEBAR_LAYOUT_KEY);
  if (!stored) return defaultSidebarLayout();
  try {
    return normalizeSidebarLayout(JSON.parse(stored));
  } catch {
    return defaultSidebarLayout();
  }
}

export async function saveSidebarLayout(layout: SidebarLayout): Promise<SidebarLayout> {
  const normalized = normalizeSidebarLayout(layout);
  await updateSetting(SIDEBAR_LAYOUT_KEY, JSON.stringify(normalized));
  return normalized;
}
