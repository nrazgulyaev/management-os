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

  // OBSERVABILITY-SPINE-H — forward to an external sink (Sentry / Logtail)
  // when a DSN is configured. No-op when unset, so local/dev/test stays
  // pure-stdout. Fire-and-forget: forwarding must never throw into the
  // caller's hot path, and must never replace the local console line.
  forwardToSink(level, record);
}

// -----------------------------------------------------------------------------
// OBSERVABILITY-SPINE-H — external sink forwarding (Sentry / Logtail).
//
// Both are HTTP-ingest shaped, so we keep this dependency-free: a single
// `fetch` to the configured ingest URL. The sink is selected purely from env
// at call time so an operator can wire it up by setting one var on Vercel
// without a redeploy of new code:
//
//   · SENTRY_DSN     — standard Sentry DSN; we derive the store endpoint +
//                      auth key from it and POST a minimal event envelope.
//   · LOGTAIL_TOKEN  — Logtail (Better Stack) source token; POST the JSON
//                      record straight to the ingest host.
//
// When neither is set this is a no-op. We only forward `warn` + `error`
// (info/debug stay local) to keep the external bill + noise bounded.
// -----------------------------------------------------------------------------

interface SentryTarget {
  storeUrl: string;
  publicKey: string;
}

let sentryTargetCache: SentryTarget | null | undefined;

function resolveSentryTarget(): SentryTarget | null {
  if (sentryTargetCache !== undefined) return sentryTargetCache;
  const dsn = process.env.SENTRY_DSN ?? process.env.NEXT_PUBLIC_SENTRY_DSN;
  if (!dsn) {
    sentryTargetCache = null;
    return null;
  }
  try {
    // DSN shape: https://<publicKey>@<host>/<projectId>
    const url = new URL(dsn);
    const publicKey = url.username;
    const projectId = url.pathname.replace(/^\//, "");
    if (!publicKey || !projectId) {
      sentryTargetCache = null;
      return null;
    }
    const storeUrl = `${url.protocol}//${url.host}/api/${projectId}/store/`;
    sentryTargetCache = { storeUrl, publicKey };
  } catch {
    sentryTargetCache = null;
  }
  return sentryTargetCache;
}

function forwardToSink(level: LogLevel, record: Record<string, unknown>): void {
  // Only escalate warn/error to the external sink; info/debug stay local.
  if (level !== "warn" && level !== "error") return;
  // No global fetch (older Node, some test sandboxes) — skip silently.
  if (typeof fetch !== "function") return;

  const logtailToken = process.env.LOGTAIL_TOKEN ?? process.env.LOGTAIL_SOURCE_TOKEN;
  if (logtailToken) {
    const host = process.env.LOGTAIL_INGEST_HOST ?? "https://in.logtail.com";
    safeFetch(host, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${logtailToken}`,
      },
      body: JSON.stringify(record),
    });
  }

  const sentry = resolveSentryTarget();
  if (sentry) {
    const event = {
      level: level === "warn" ? "warning" : "error",
      message: typeof record.message === "string" ? record.message : "log",
      timestamp:
        typeof record.timestamp === "string" ? record.timestamp : new Date().toISOString(),
      environment: typeof record.env === "string" ? record.env : undefined,
      extra: record,
    };
    safeFetch(sentry.storeUrl, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-sentry-auth": `Sentry sentry_version=7, sentry_key=${sentry.publicKey}, sentry_client=arconique-logger/1.0`,
      },
      body: JSON.stringify(event),
    });
  }
}

/**
 * Fire-and-forget POST. Swallows every error (network, abort, non-2xx) so a
 * misconfigured DSN or a flaky sink can never break the application path that
 * happened to log a line.
 */
function safeFetch(url: string, init: RequestInit): void {
  try {
    const result = fetch(url, { ...init, keepalive: true });
    if (result && typeof result.catch === "function") {
      result.catch(() => {
        /* swallow — logging must never throw */
      });
    }
  } catch {
    /* swallow — logging must never throw */
  }
}

/** Test seam — clears the memoised Sentry target so env changes re-resolve. */
export function __resetLoggerSinks(): void {
  sentryTargetCache = undefined;
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
