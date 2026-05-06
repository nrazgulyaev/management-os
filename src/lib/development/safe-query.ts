/**
 * Resilience helper for Development OS pages that fan out to multiple
 * secondary queries. Resolves with `fallback` on timeout or rejection so
 * a single slow query cannot crash the page render.
 *
 * Pure (no `server-only` guard) so it can be unit-tested directly.
 */
export interface SafeQueryTiming {
  label: string;
  durationMs: number;
  usedFallback: boolean;
}

export async function safeQuery<T>(
  label: string,
  promise: Promise<T>,
  fallback: T,
  timeoutMs = 4000,
  onTiming?: (t: SafeQueryTiming) => void,
): Promise<T> {
  const startedAt = Date.now();
  let usedFallback = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const value = await Promise.race<T>([
      promise,
      new Promise<T>((resolve) => {
        timer = setTimeout(() => {
          usedFallback = true;
          if (process.env.NODE_ENV !== "production") {
            console.warn(
              `[safeQuery] ${label} timed out after ${timeoutMs}ms — using fallback`,
            );
          }
          resolve(fallback);
        }, timeoutMs);
      }),
    ]);
    return value;
  } catch (error) {
    usedFallback = true;
    if (process.env.NODE_ENV !== "production") {
      console.error(`[safeQuery] ${label} failed — using fallback`, error);
    }
    return fallback;
  } finally {
    if (timer) clearTimeout(timer);
    onTiming?.({
      label,
      durationMs: Date.now() - startedAt,
      usedFallback,
    });
  }
}

export function logSafeQueryTimings(
  pageLabel: string,
  timings: SafeQueryTiming[],
): void {
  if (process.env.NODE_ENV === "production") return;
  if (timings.length === 0) return;
  const fallbackCount = timings.filter((t) => t.usedFallback).length;
  console.debug(
    `[safeQuery:${pageLabel}] ${timings.length} queries, ${fallbackCount} used fallback`,
    timings.map((t) => `${t.label}=${t.durationMs}ms${t.usedFallback ? "*" : ""}`).join(" "),
  );
}
