/**
 * Stage 6.P1.D — Shared helpers for ChannelManagerProvider implementations.
 *
 * Every channel provider builds SyncResult objects in the same shape
 * (success / failure / zero-input). Extracting here keeps each
 * provider focused on its channel-specific protocol concerns.
 *
 * Pure functions — no I/O.
 */

import { createHmac, timingSafeEqual } from "node:crypto";
import type { SyncResult } from "./types";

export interface HttpLike {
  status: number;
  body: string;
  apiCallsCount: number;
}

/**
 * Project an HTTP-style response into a SyncResult. 2xx → success;
 * everything else → failure with truncated body in the error message.
 */
export function projectHttpResult(
  res: HttpLike,
  recordCount: number,
  startMs: number,
): SyncResult {
  if (res.status >= 200 && res.status < 300) {
    return {
      success: true,
      recordsProcessed: recordCount,
      recordsSucceeded: recordCount,
      recordsFailed: 0,
      errors: [],
      durationMs: Date.now() - startMs,
      apiCallsCount: res.apiCallsCount,
    };
  }
  return {
    success: false,
    recordsProcessed: recordCount,
    recordsSucceeded: 0,
    recordsFailed: recordCount,
    errors: [{ message: `HTTP ${res.status}: ${truncate(res.body, 240)}` }],
    durationMs: Date.now() - startMs,
    apiCallsCount: res.apiCallsCount,
  };
}

/** Empty-input → no work done, no API call, success. */
export function zeroResult(startMs: number): SyncResult {
  return {
    success: true,
    recordsProcessed: 0,
    recordsSucceeded: 0,
    recordsFailed: 0,
    errors: [],
    durationMs: Date.now() - startMs,
    apiCallsCount: 0,
  };
}

/** Thrown error → failure SyncResult so cron doesn't crash. */
export function errorResult(
  startMs: number,
  recordCount: number,
  err: unknown,
): SyncResult {
  return {
    success: false,
    recordsProcessed: recordCount,
    recordsSucceeded: 0,
    recordsFailed: recordCount,
    errors: [{ message: err instanceof Error ? err.message : String(err) }],
    durationMs: Date.now() - startMs,
    apiCallsCount: 0,
  };
}

/** Single-line truncation with ellipsis. */
export function truncate(s: string, max: number): string {
  return s.length <= max ? s : s.slice(0, max) + "…";
}

/**
 * HMAC-SHA256 webhook signature verification, constant-time. Accepts
 * both raw hex and `sha256=<hex>` prefix — Booking, Airbnb, Trip.com
 * all ship the prefixed form per their docs but legacy payloads use
 * raw hex.
 *
 * Returns false (not throw) on any failure — webhook handlers should
 * treat any false as "drop the request" rather than 500-ing.
 */
export function verifyHmacSha256Signature(
  payload: string,
  signature: string,
  secret: string,
): boolean {
  if (!secret || !signature) return false;
  try {
    const computed = createHmac("sha256", secret).update(payload).digest("hex");
    const provided = signature.startsWith("sha256=")
      ? signature.slice("sha256=".length)
      : signature;
    if (provided.length !== computed.length) return false;
    return timingSafeEqual(
      Buffer.from(provided, "utf8"),
      Buffer.from(computed, "utf8"),
    );
  } catch {
    return false;
  }
}

/**
 * Generic webhook event payload picker — pulls a string field by key,
 * returns undefined when missing or non-string. Used by every
 * provider's parseWebhook implementation.
 */
export function pickPayloadString(
  payload: Record<string, unknown>,
  key: string,
): string | undefined {
  const v = payload[key];
  return typeof v === "string" && v.length > 0 ? v : undefined;
}
