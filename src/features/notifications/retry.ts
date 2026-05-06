/**
 * Pure retry-backoff schedule for notification delivery. Exposed as its
 * own module so tests can import it without `server-only`.
 *
 * Schedule (cumulative attempts already counted in `delivery_attempts`):
 *   attempt 1 → next_attempt_at = now + 30s
 *   attempt 2 → next_attempt_at = now + 5 min
 *   attempt 3 → next_attempt_at = now + 30 min
 *   attempt ≥ max_attempts → null (queue row should be marked failed)
 *
 * The `attempt` parameter is the count we just *finished* (the one that
 * failed). Returns `null` when we've exhausted retries.
 */

const STEP_MS = [30_000, 5 * 60_000, 30 * 60_000] as const;

export function computeNextRetryAt(
  attempt: number,
  maxAttempts: number = 3,
  now: Date = new Date(),
): Date | null {
  if (attempt >= maxAttempts) return null;
  // attempt is 1-indexed (the one that just finished). Next step is the
  // delay we want before the *next* attempt. Clamp into the table.
  const idx = Math.min(Math.max(attempt - 1, 0), STEP_MS.length - 1);
  const delay = STEP_MS[idx];
  return new Date(now.getTime() + delay);
}

/**
 * Pure helper: should this row be eligible for another retry?
 */
export function canRetry(
  deliveryAttempts: number,
  maxAttempts: number = 3,
): boolean {
  return deliveryAttempts < maxAttempts;
}
