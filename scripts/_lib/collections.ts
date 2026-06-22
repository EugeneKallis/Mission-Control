/**
 * Small collection helpers used by the Arr scripts. Kept separate from
 * the scripts themselves so they can be unit-tested without spinning
 * up the AppConfig / ArrClient.
 */

/** Sort instances by a priority list. Names not in the list sort last. */
export function sortByPriority<T extends { name: string }>(
  instances: T[],
  priority: string[],
): T[] {
  const order = new Map(priority.map((name, i) => [name, i]));
  return [...instances].sort((a, b) => {
    const ai = order.get(a.name) ?? Number.MAX_SAFE_INTEGER;
    const bi = order.get(b.name) ?? Number.MAX_SAFE_INTEGER;
    return ai - bi;
  });
}

/** Split `arr` into chunks of `size` (last chunk may be shorter). */
export function chunk<T>(arr: T[], size: number): T[][] {
  if (size <= 0) throw new Error("chunk size must be > 0");
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

/** Group elements by a key extractor. */
export function groupBy<T, K>(arr: T[], key: (t: T) => K): Map<K, T[]> {
  const out = new Map<K, T[]>();
  for (const item of arr) {
    const k = key(item);
    const bucket = out.get(k);
    if (bucket) bucket.push(item);
    else out.set(k, [item]);
  }
  return out;
}
