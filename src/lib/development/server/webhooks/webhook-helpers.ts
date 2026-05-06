/**
 * Stage 5.J.4 — Pure webhook helpers.
 *
 * No I/O, no `import "server-only"`. Runtime testable.
 *
 * HMAC-SHA256 signing matches the Stripe / GitHub convention:
 *   X-Arconique-Signature: t=<unix>,v1=<hex_hmac>
 *
 * Verification has a tolerance window to allow clock skew. Replay
 * protection: the timestamp must be within `toleranceSeconds` of
 * server clock at verification time.
 */

import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

export function shouldEventBeDispatched(input: {
  eventType: string;
  subscribedEvents: string[];
  organizationId: string;
  eventOrganizationId: string;
}): boolean {
  if (input.organizationId !== input.eventOrganizationId) return false;
  if (input.subscribedEvents.length === 0) return false;
  if (input.subscribedEvents.includes("*")) return true;
  if (input.subscribedEvents.includes(input.eventType)) return true;
  // Wildcard prefix match: subscriber to "project.*" gets project.created etc.
  return input.subscribedEvents.some((p) => {
    if (!p.endsWith(".*")) return false;
    const namespace = p.slice(0, -2);
    return input.eventType.startsWith(namespace + ".");
  });
}

export interface NextRetry {
  shouldRetry: boolean;
  retryAfterSeconds: number;
  isFinalAttempt: boolean;
}

/**
 * Exponential backoff. Attempt 1 → 30s, attempt 2 → 1m, attempt 3 →
 * 5m, attempt 4 → 30m, attempt 5 → 2h. After max attempts the delivery
 * is `failed` permanently.
 */
export function computeNextRetryDelay(input: {
  attemptNumber: number;
  maxAttempts: number;
}): NextRetry {
  if (input.attemptNumber >= input.maxAttempts) {
    return { shouldRetry: false, retryAfterSeconds: 0, isFinalAttempt: true };
  }
  const schedule = [30, 60, 300, 1800, 7200];
  const idx = Math.min(input.attemptNumber - 1, schedule.length - 1);
  const delay = schedule[Math.max(0, idx)] ?? 7200;
  return {
    shouldRetry: true,
    retryAfterSeconds: delay,
    isFinalAttempt: input.attemptNumber + 1 >= input.maxAttempts,
  };
}

export function generateSigningSecret(): string {
  return `whsec_${randomBytes(32).toString("base64url")}`;
}

/**
 * Sign `<timestamp>.<payload>` with HMAC-SHA256, return hex digest.
 */
export function generateWebhookSignature(input: {
  payload: string;
  secret: string;
  timestamp: number;
}): string {
  const signedPayload = `${input.timestamp}.${input.payload}`;
  return createHmac("sha256", input.secret).update(signedPayload).digest("hex");
}

/**
 * Build the Stripe-style header value: "t=<ts>,v1=<sig>".
 */
export function buildSignatureHeader(input: {
  payload: string;
  secret: string;
  timestamp: number;
}): string {
  const sig = generateWebhookSignature(input);
  return `t=${input.timestamp},v1=${sig}`;
}

/**
 * Verify a signature header, with replay protection via tolerance window.
 */
export function verifyWebhookSignature(input: {
  payload: string;
  receivedSignature: string;
  secret: string;
  /** Server clock at verification time. */
  nowUnixSeconds: number;
  toleranceSeconds: number;
}): boolean {
  // Header format: "t=<ts>,v1=<sig>"
  const parts = input.receivedSignature.split(",");
  let ts: number | null = null;
  let sig: string | null = null;
  for (const p of parts) {
    const [k, v] = p.split("=");
    if (k === "t") ts = Number(v);
    else if (k === "v1") sig = v ?? null;
  }
  if (ts === null || sig === null) return false;
  if (Math.abs(input.nowUnixSeconds - ts) > input.toleranceSeconds) return false;
  const expected = generateWebhookSignature({
    payload: input.payload,
    secret: input.secret,
    timestamp: ts,
  });
  if (expected.length !== sig.length) return false;
  try {
    return timingSafeEqual(Buffer.from(expected, "hex"), Buffer.from(sig, "hex"));
  } catch {
    return false;
  }
}
