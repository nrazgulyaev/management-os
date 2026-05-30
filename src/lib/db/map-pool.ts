/**
 * DB-POOL-FANOUT-1 — bounded-concurrency fan-out helper.
 *
 * `Promise.all(tasks)` fires every task at once. When tasks are
 * `db.execute()` calls and there are more of them than the postgres-js
 * pool has connections (`max:5`), the surplus queue with no bounded wait;
 * under any pooler contention the whole batch can stall to the 300s
 * function timeout (the /dashboard P0).
 *
 * `mapPool` runs at most `limit` tasks concurrently, so a render never
 * over-subscribes the pool. Order of results matches input order. Like
 * `Promise.all`, it rejects on the first task that throws — callers that
 * want per-item resilience should make each task catch + return a
 * fallback (e.g. `safeSource()` in the attention feed).
 *
 * Applied surgically (dashboard overview + attention feed), not as a
 * blanket refactor of every multi-query caller.
 */
export async function mapPool<T, R>(
  items: readonly T[],
  limit: number,
  fn: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const n = items.length;
  const results = new Array<R>(n);
  if (n === 0) return results;
  const cap = Math.max(1, Math.min(limit, n));

  let next = 0;
  async function worker(): Promise<void> {
    while (true) {
      const i = next++;
      if (i >= n) return;
      results[i] = await fn(items[i], i);
    }
  }

  await Promise.all(Array.from({ length: cap }, () => worker()));
  return results;
}

/**
 * Bounded-concurrency drop-in for `Promise.all` over a fixed tuple of
 * zero-arg thunks — preserves the per-element result types like
 * `Promise.all` does, but runs at most `limit` at once.
 *
 *   const [a, b, c] = await mapPoolAll([
 *     () => getA(), () => getB(), () => getC(),
 *   ] as const, 4);
 *
 * Use for heterogeneous multi-query renders (e.g. the dashboard overview)
 * where you want named, typed results but must cap pool pressure.
 */
export async function mapPoolAll<
  T extends readonly (() => Promise<unknown>)[],
>(
  tasks: readonly [...T],
  limit: number,
): Promise<{ -readonly [K in keyof T]: Awaited<ReturnType<T[K]>> }> {
  const out = await mapPool(tasks, limit, (task) => task());
  return out as { -readonly [K in keyof T]: Awaited<ReturnType<T[K]>> };
}
