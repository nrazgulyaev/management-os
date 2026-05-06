/**
 * Pure helper for the notification-digest dedupe key. Lives outside the
 * server-only job runner so unit tests can import without `server-only`.
 *
 * Format: internal_daily_digest:YYYY-MM-DD:<roleKey>. Same role on the
 * same UTC day collapses to one queue row via the queue's partial unique
 * index on (dedupe_key, status='queued'/'sent').
 */
export const DIGEST_TEMPLATE_KEY = "internal_daily_digest";

export function digestDedupeKey(roleKey: string, now: Date = new Date()): string {
  const ymd = now.toISOString().slice(0, 10);
  return `${DIGEST_TEMPLATE_KEY}:${ymd}:${roleKey}`;
}
