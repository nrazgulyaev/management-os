/**
 * Stage 8.E.2 — lightweight server-side perf logging.
 *
 * Wraps a Promise-returning callable, logs its wall time on completion
 * (or failure) to Vercel runtime logs, and returns the original
 * value unchanged. The log line is structured so operators can grep
 * `[perf]` in the Vercel function logs to spot slow queries:
 *
 *   [perf] page=/dashboard/direct-bookings q=getReconciliationMetrics ms=4823 ok
 *   [perf] page=/dashboard/pricing q=getPricingHubMetrics ms=12001 ok
 *
 * No Server-Timing headers — Next.js server components don't have a
 * clean way to set response headers, and the function-log signal is
 * sufficient for the audit problem we're solving (identify the slow
 * query without guessing).
 *
 * Cost: one Date.now() call before + after; one console.log on
 * completion. Negligible overhead.
 */

type SyncOrAsync<T> = Promise<T> | T;

export async function trace<T>(
  page: string,
  q: string,
  fn: () => SyncOrAsync<T>,
): Promise<T> {
  const t0 = Date.now();
  try {
    const value = await fn();
    const ms = Date.now() - t0;
    // Always log; one line per query, easy to grep + sort by ms.
    console.log(`[perf] page=${page} q=${q} ms=${ms} ok`);
    return value;
  } catch (err) {
    const ms = Date.now() - t0;
    console.log(
      `[perf] page=${page} q=${q} ms=${ms} fail ${err instanceof Error ? err.message : String(err)}`,
    );
    throw err;
  }
}
