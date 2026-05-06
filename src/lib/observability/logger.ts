/**
 * Prompt 113 — Lightweight structured logger.
 *
 * Replaces ad-hoc `console.log` in cron handlers, server actions, and
 * job runners.  Easy to swap for Sentry / Logtail later — every log
 * call already produces a structured object.
 *
 * Pure — no DB.  Safe to import everywhere.  Redacts known secret
 * fields before serialising.
 */

const REDACTED_KEYS = new Set([
  // Auth / token / secret-shaped keys.
  "password",
  "passwordCiphertext",
  "secret",
  "secretCiphertext",
  "secret_ciphertext",
  "totpSecret",
  "token",
  "tokenHash",
  "token_hash",
  "holdTokenHash",
  "hold_token_hash",
  "providerSessionId",
  "provider_session_id",
  "providerPaymentId",
  "providerAccountId",
  "webhookPayload",
  "webhook_payload",
  "configPrivateEncrypted",
  "authorization",
  "Authorization",
  "x-api-key",
  "apiKey",
  // Guest contact fields that must not appear in logs.
  "guestEmail",
  "guest_email",
  "guestPhone",
  "guest_phone",
  "rawIp",
  "ip_address",
]);

const REDACTED_TOKEN = "[redacted]";

export interface LogFields {
  /** Identifier of the request / cron run / CLI invocation. */
  requestId?: string;
  /** Logical area (e.g. "cron.notifications-deliver"). */
  area?: string;
  /** Anything else relevant — secrets are redacted before output. */
  [key: string]: unknown;
}

export type LogLevel = "debug" | "info" | "warn" | "error";

function redactValue(value: unknown): unknown {
  if (value === null || value === undefined) return value;
  if (typeof value !== "object") return value;
  if (Array.isArray(value)) return value.map(redactValue);
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
    if (REDACTED_KEYS.has(k)) {
      out[k] = REDACTED_TOKEN;
    } else {
      out[k] = redactValue(v);
    }
  }
  return out;
}

function emit(level: LogLevel, message: string, fields?: LogFields): void {
  const env = process.env.NEXT_PUBLIC_APP_ENV ?? process.env.NODE_ENV ?? "development";
  const safeFields =
    fields !== undefined ? (redactValue(fields) as Record<string, unknown>) : {};
  const record = {
    level,
    message,
    env,
    timestamp: new Date().toISOString(),
    ...safeFields,
  };
  // Single line of JSON — easy for log shippers to ingest.
  const line = JSON.stringify(record);
  if (level === "error") console.error(line);
  else if (level === "warn") console.warn(line);
  else console.log(line);
}

export const logger = {
  debug(message: string, fields?: LogFields) {
    if (process.env.NEXT_PUBLIC_APP_ENV === "production") return;
    emit("debug", message, fields);
  },
  info(message: string, fields?: LogFields) {
    emit("info", message, fields);
  },
  warn(message: string, fields?: LogFields) {
    emit("warn", message, fields);
  },
  error(message: string, fields?: LogFields) {
    emit("error", message, fields);
  },
  /** Internal seam — exported so tests can verify the redaction list. */
  __redactValue: redactValue,
  __REDACTED_KEYS: REDACTED_KEYS,
};
