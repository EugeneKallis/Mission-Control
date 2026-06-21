import { getConfig } from "@/lib/config";
import type { ArrInstance } from "@/types";

/**
 * Map an Arr instance name (folder name in the file tree) to its base URL.
 * Returns an empty object if config or instances are missing.
 */
export function getArrInstanceMap(): Record<string, string> {
  let instances: ArrInstance[] = [];
  try {
    instances = getConfig().arrInstances;
  } catch {
    // Config not initialized (e.g. during build without env) — return empty map.
    return {};
  }
  const map: Record<string, string> = {};
  for (const inst of instances) {
    if (inst.name && inst.url) {
      map[inst.name] = inst.url;
    }
  }
  return map;
}
