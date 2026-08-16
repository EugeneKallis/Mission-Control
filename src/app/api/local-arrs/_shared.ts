import { ArrClient } from "@/lib/clients/arr";
import { resolveConfig } from "@/lib/config";
import { ARR_INSTANCE_DEFINITIONS } from "@/lib/arr-config";
import { LOCAL_ARRS, type LocalArrSlug } from "@/lib/local-arrs";

export const noStore = { "Cache-Control": "no-store" };

export function parseSeriesId(raw: string | null): number | null {
  if (!raw) return null;
  const id = Number.parseInt(raw, 10);
  return Number.isInteger(id) && id > 0 ? id : null;
}

export function validLocalSlug(raw: string | null | undefined): LocalArrSlug | null {
  const slug = raw ?? "sonarrlocal";
  return Object.hasOwn(LOCAL_ARRS, slug) ? (slug as LocalArrSlug) : null;
}

/**
 * Resolve the configured Arr instance for a slug. Returns either the client
 * (with the human label for error messages) or an object describing the
 * failure so each route can map it to the right status without duplicating
 * the env > DB > default resolution + key-check dance.
 */
export async function resolveLocalArrClient(slug: LocalArrSlug): Promise<
  | { ok: true; client: ArrClient; label: string }
  | { ok: false; status: number; error: string }
> {
  const arr = LOCAL_ARRS[slug];
  const definition = ARR_INSTANCE_DEFINITIONS.find((item) => item.slug === slug);
  const config = await resolveConfig();
  const instance = config.arrInstances.find((item) => item.name === definition?.name);
  if (!instance) return { ok: false, status: 503, error: `${arr.label} is not configured` };
  if (!instance.apiKey) return { ok: false, status: 503, error: `No API key configured for ${arr.label}` };
  return { ok: true, client: new ArrClient(instance), label: arr.label };
}