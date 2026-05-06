/**
 * Stage 6.P1.C — Shared HTTP retry envelope.
 *
 * Extracted from the BookingComClient pattern (P1.B) so AirbnbClient
 * (and the rest of P1.D) inherit the exact same retry semantics:
 *   - max 3 attempts (configurable)
 *   - exponential backoff (1s base, configurable)
 *   - retry on 429 (rate limit) and 5xx
 *   - no retry on 4xx other than 429
 *   - retry on thrown error (network, timeout)
 *   - per-request timeout via AbortSignal.timeout
 *   - apiCallsCount returned for cost tracking
 *
 * Native fetch only. Tests inject a mock via the `fetch` parameter.
 *
 * The helper is intentionally generic — it doesn't know about XML, JSON,
 * OAuth, or any provider specifics. Each provider's client wraps this
 * with auth + body handling.
 */

export interface RetryOptions {
  /** Inject a mock fetch in tests. Defaults to globalThis.fetch. */
  fetch?: typeof globalThis.fetch;
  /** Per-request timeout. Default 30s. */
  timeoutMs?: number;
  /** Max retry attempts. Default 3. */
  maxRetries?: number;
  /** Exponential backoff base in ms. Default 1000. Tests pass 1. */
  backoffBaseMs?: number;
  /** Optional pre-request hook — return false to skip retry of this attempt
   *  (used by clients that need to refresh credentials before retrying). */
  beforeAttempt?: (attempt: number) => Promise<void> | void;
}

export interface RetriedResponse {
  status: number;
  body: string;
  headers: Headers;
  /** Total HTTP requests (including retries). */
  apiCallsCount: number;
}

const DEFAULT_TIMEOUT_MS = 30_000;
const DEFAULT_MAX_RETRIES = 3;
const DEFAULT_BACKOFF_BASE_MS = 1000;

/**
 * Send a request with the standard retry envelope. Returns the final
 * response after retries — caller decides what to do with non-2xx
 * statuses (typically: turn into a SyncResult{success:false}).
 *
 * Throws only when every attempt failed with a thrown error (network,
 * timeout). Non-2xx HTTP statuses do NOT throw — they're returned so
 * callers can read the error body.
 */
export async function requestWithRetry(
  url: string,
  init: RequestInit,
  options: RetryOptions = {},
): Promise<RetriedResponse> {
  const fetchImpl = options.fetch ?? globalThis.fetch.bind(globalThis);
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const maxRetries = options.maxRetries ?? DEFAULT_MAX_RETRIES;
  const backoffBaseMs = options.backoffBaseMs ?? DEFAULT_BACKOFF_BASE_MS;

  let lastError: unknown = null;
  let apiCallsCount = 0;
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    if (options.beforeAttempt) {
      await options.beforeAttempt(attempt);
    }
    apiCallsCount++;
    try {
      const response = await fetchImpl(url, {
        ...init,
        signal: AbortSignal.timeout(timeoutMs),
      });

      if (response.status === 429 && attempt < maxRetries - 1) {
        await sleep(backoffBaseMs * Math.pow(2, attempt));
        continue;
      }

      if (response.status >= 500 && attempt < maxRetries - 1) {
        await sleep(backoffBaseMs * Math.pow(2, attempt));
        continue;
      }

      const body = await response.text();
      return {
        status: response.status,
        body,
        headers: response.headers,
        apiCallsCount,
      };
    } catch (err) {
      lastError = err;
      if (attempt < maxRetries - 1) {
        await sleep(backoffBaseMs * Math.pow(2, attempt));
        continue;
      }
    }
  }
  throw new Error(
    lastError instanceof Error
      ? `Request failed after ${maxRetries} attempts: ${lastError.message}`
      : `Request failed after ${maxRetries} attempts`,
  );
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
