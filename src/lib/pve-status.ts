/**
 * Proxmox cluster status aggregation.
 *
 * Loads enabled Proxmox endpoints from the DB, fans out to each one in
 * parallel via ProxmoxClient, and caches the combined snapshot in-process
 * for 15s so concurrent page + badge polls don't hammer the Proxmox API.
 */

import { listProxmoxEndpoints } from "@/lib/db/queries";
import { ProxmoxClient, type PveClusterSnapshot, type PveEndpointSnapshot } from "@/lib/clients/proxmox";

const CACHE_TTL_MS = 15_000;

interface CacheEntry {
  data: PveClusterSnapshot;
  at: number;
}

let cache: CacheEntry | null = null;

/** Clear the in-process cache (used by tests to force a fresh fetch). */
export function clearPveStatusCache(): void {
  cache = null;
}

/**
 * Return the aggregated cluster snapshot, served from cache when fresh.
 * Per-endpoint failures are isolated: a dead endpoint comes back with
 * `online: false` and empty nodes rather than failing the whole request.
 */
export async function getClusterSnapshot(): Promise<PveClusterSnapshot> {
  const now = Date.now();
  if (cache && now - cache.at < CACHE_TTL_MS) {
    return cache.data;
  }

  const endpoints = await listProxmoxEndpoints();
  const enabled = endpoints.filter((ep) => ep.enabled);

  if (enabled.length === 0) {
    const empty: PveClusterSnapshot = { endpoints: [], fetchedAt: new Date().toISOString() };
    cache = { data: empty, at: now };
    return empty;
  }

  const endpointSnapshots: PveEndpointSnapshot[] = await Promise.all(
    enabled.map(async (ep) => {
      try {
        const client = new ProxmoxClient(ep.apiUrl, ep.apiToken, ep.verifyTls);
        const snap = await client.getSnapshot();
        return {
          ...snap,
          id: ep.id,
          name: ep.name,
          apiUrl: ep.apiUrl,
        };
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error(`[pve] Failed to fetch endpoint "${ep.name}": ${msg}`);
        return {
          id: ep.id,
          name: ep.name,
          apiUrl: ep.apiUrl,
          online: false,
          error: msg,
          nodes: [],
        } satisfies PveEndpointSnapshot;
      }
    }),
  );

  const snapshot: PveClusterSnapshot = {
    endpoints: endpointSnapshots,
    fetchedAt: new Date().toISOString(),
  };

  cache = { data: snapshot, at: Date.now() };
  return snapshot;
}
