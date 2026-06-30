/**
 * Concurrency-limited parallel map.
 *
 * Runs `fn(item)` for every `items[i]` with at most `concurrency` in-flight
 * at once, preserving input order in the returned array. If `items` is
 * empty, returns an empty array without spawning any workers.
 *
 * Errors from `fn` propagate to the caller via `Promise.all` — the first
 * rejection rejects the whole call. Callers that need per-item isolation
 * should catch inside `fn`.
 */
export async function pMap<T, U>(
  items: T[],
  fn: (item: T) => Promise<U>,
  concurrency: number,
): Promise<U[]> {
  if (items.length === 0) return [];
  const results: U[] = new Array(items.length);
  let next = 0;
  const workers = Array.from(
    { length: Math.min(concurrency, items.length) },
    async () => {
      while (true) {
        const i = next++;
        if (i >= items.length) return;
        results[i] = await fn(items[i]);
      }
    },
  );
  await Promise.all(workers);
  return results;
}
