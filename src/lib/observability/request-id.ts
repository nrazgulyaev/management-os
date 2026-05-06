/**
 * Prompt 113 — Stable request-id helper.
 *
 * In a Vercel-style runtime each invocation already gets an
 * `x-request-id` header.  We generate a fresh one for non-HTTP
 * contexts (CLI scripts, cron handlers running outside the request
 * pipeline) so log correlation always works.
 */

import { randomUUID } from "node:crypto";

/** Pull a request id from headers if present, else generate. */
export function resolveRequestId(
  headers?: { get(name: string): string | null } | null,
): string {
  if (headers) {
    const fromHeader =
      headers.get("x-request-id") ??
      headers.get("x-vercel-id") ??
      null;
    if (fromHeader) return fromHeader;
  }
  return randomUUID();
}
