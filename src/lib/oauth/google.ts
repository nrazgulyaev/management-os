/**
 * Stage 6.P2.E — Google OAuth2 token refresh helper.
 *
 * Same shape as the Airbnb refresh helper from P1.C, with a few
 * Google-specific tweaks:
 *   - Form-encoded body (`application/x-www-form-urlencoded`),
 *     not JSON — Google's token endpoint rejects JSON.
 *   - Requires `client_id` + `client_secret` per the OAuth2 spec
 *     (Google doesn't issue long-lived bearer tokens directly to
 *     refresh requests the way Airbnb does).
 *   - Google rotates the refresh token on a strict offline_access grant
 *     reset; otherwise it omits `refresh_token` from the response and
 *     the caller keeps the existing one.
 *
 * Pure HTTP — no DB, no `import "server-only"` — testable with mocked
 * fetch. Caller (GmailClient + service layer) persists the new tokens
 * to oauth_connections.
 */

const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";

export interface RefreshGoogleTokenInput {
  refreshToken: string;
  clientId: string;
  clientSecret: string;
  /** Inject mock fetch in tests. Defaults to globalThis.fetch. */
  fetch?: typeof globalThis.fetch;
  /** Override token endpoint (e.g. internal test proxy). */
  tokenUrl?: string;
  /** Per-request timeout. Default 15s — token refresh is hot path. */
  timeoutMs?: number;
}

export interface RefreshGoogleTokenResult {
  accessToken: string;
  /** Present only when Google rotates the refresh token; caller persists. */
  refreshToken?: string;
  /** Unix epoch ms — when accessToken expires. */
  expiresAt: number;
  /** Granted OAuth scopes. Sometimes shrinks if user revoked one. */
  scope?: string;
  tokenType: string;
}

/**
 * Exchange a refresh token for a fresh access token. Throws on:
 *   - missing inputs (refreshToken / clientId / clientSecret)
 *   - non-2xx response (with Google's error in the throw)
 *   - response missing access_token / expires_in
 *   - non-JSON body
 */
export async function refreshGoogleToken(
  input: RefreshGoogleTokenInput,
): Promise<RefreshGoogleTokenResult> {
  if (!input.refreshToken) {
    throw new Error("refreshGoogleToken: refreshToken required");
  }
  if (!input.clientId || !input.clientSecret) {
    throw new Error(
      "refreshGoogleToken: clientId + clientSecret required (Google OAuth2 spec)",
    );
  }
  const fetchImpl = input.fetch ?? globalThis.fetch.bind(globalThis);
  const url = input.tokenUrl ?? GOOGLE_TOKEN_URL;
  const timeoutMs = input.timeoutMs ?? 15_000;

  const formBody = new URLSearchParams({
    grant_type: "refresh_token",
    refresh_token: input.refreshToken,
    client_id: input.clientId,
    client_secret: input.clientSecret,
  });

  const response = await fetchImpl(url, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: formBody.toString(),
    signal: AbortSignal.timeout(timeoutMs),
  });

  const text = await response.text();
  if (response.status < 200 || response.status >= 300) {
    throw new Error(
      `Google token refresh failed: HTTP ${response.status} — ${truncate(text, 200)}`,
    );
  }

  let body: Record<string, unknown>;
  try {
    body = JSON.parse(text) as Record<string, unknown>;
  } catch {
    throw new Error("Google token refresh returned non-JSON response");
  }

  const accessToken = body["access_token"];
  const expiresIn = body["expires_in"];
  if (typeof accessToken !== "string" || !accessToken) {
    throw new Error("Google token refresh response missing access_token");
  }
  if (typeof expiresIn !== "number" || expiresIn <= 0) {
    throw new Error(
      "Google token refresh response missing valid expires_in (seconds)",
    );
  }

  return {
    accessToken,
    refreshToken:
      typeof body["refresh_token"] === "string" && body["refresh_token"]
        ? (body["refresh_token"] as string)
        : undefined,
    expiresAt: Date.now() + expiresIn * 1000,
    scope: typeof body["scope"] === "string" ? (body["scope"] as string) : undefined,
    tokenType:
      typeof body["token_type"] === "string"
        ? (body["token_type"] as string)
        : "Bearer",
  };
}

function truncate(s: string, max: number): string {
  return s.length <= max ? s : s.slice(0, max) + "…";
}
