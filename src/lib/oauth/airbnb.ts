/**
 * Stage 6.P1.C — Airbnb OAuth2 token refresh helper.
 *
 * Pure HTTP helper — accepts an injectable fetch so tests can mock the
 * Airbnb token endpoint. Idempotent: calling it twice with the same
 * refresh token returns equivalent access tokens (Airbnb may rotate
 * the refresh token, in which case the new one is in the response and
 * the caller must persist it).
 *
 * The caller (AirbnbClient + service layer) is responsible for
 * persisting the new tokens to the oauth_connections row. This helper
 * doesn't touch the DB so it's testable without a runtime context.
 *
 * Per Airbnb Hosting API docs:
 *   POST https://api.airbnb.com/v2/oauth2/token
 *   Content-Type: application/json
 *   { grant_type: "refresh_token", refresh_token: "..." }
 *   →
 *   { access_token, refresh_token?, expires_in, token_type }
 */

const AIRBNB_TOKEN_URL = "https://api.airbnb.com/v2/oauth2/token";

export interface RefreshAirbnbTokenInput {
  refreshToken: string;
  /** Inject mock fetch in tests. Defaults to globalThis.fetch. */
  fetch?: typeof globalThis.fetch;
  /** Override token endpoint (e.g. sandbox proxy) — defaults to prod. */
  tokenUrl?: string;
  /** Per-request timeout. Default 15s — token refresh is hot path. */
  timeoutMs?: number;
}

export interface RefreshAirbnbTokenResult {
  accessToken: string;
  /** Present when Airbnb rotates the refresh token; caller persists. */
  refreshToken?: string;
  /** Unix epoch ms — when accessToken expires. */
  expiresAt: number;
}

/**
 * Exchange a refresh token for a fresh access token. Throws on:
 *   - empty refreshToken
 *   - non-2xx response (with Airbnb's error message in the throw)
 *   - response missing access_token / expires_in
 */
export async function refreshAirbnbToken(
  input: RefreshAirbnbTokenInput,
): Promise<RefreshAirbnbTokenResult> {
  if (!input.refreshToken) {
    throw new Error("refreshAirbnbToken: refreshToken required");
  }
  const fetchImpl = input.fetch ?? globalThis.fetch.bind(globalThis);
  const url = input.tokenUrl ?? AIRBNB_TOKEN_URL;
  const timeoutMs = input.timeoutMs ?? 15_000;

  const response = await fetchImpl(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      grant_type: "refresh_token",
      refresh_token: input.refreshToken,
    }),
    signal: AbortSignal.timeout(timeoutMs),
  });

  const text = await response.text();
  if (response.status < 200 || response.status >= 300) {
    throw new Error(
      `Airbnb token refresh failed: HTTP ${response.status} — ${truncate(text, 200)}`,
    );
  }

  let body: Record<string, unknown>;
  try {
    body = JSON.parse(text) as Record<string, unknown>;
  } catch {
    throw new Error("Airbnb token refresh returned non-JSON response");
  }

  const accessToken = body["access_token"];
  const expiresIn = body["expires_in"];
  if (typeof accessToken !== "string" || !accessToken) {
    throw new Error("Airbnb token refresh response missing access_token");
  }
  if (typeof expiresIn !== "number" || expiresIn <= 0) {
    throw new Error(
      "Airbnb token refresh response missing valid expires_in (seconds)",
    );
  }

  const refreshTokenOut =
    typeof body["refresh_token"] === "string" && body["refresh_token"]
      ? (body["refresh_token"] as string)
      : undefined;

  return {
    accessToken,
    refreshToken: refreshTokenOut,
    expiresAt: Date.now() + expiresIn * 1000,
  };
}

function truncate(s: string, max: number): string {
  return s.length <= max ? s : s.slice(0, max) + "…";
}
