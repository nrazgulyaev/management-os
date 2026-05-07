/**
 * Stage 6.P5 — Google OAuth2 authorize-URL builder + code-for-tokens
 * exchange.
 *
 * Pure HTTP — no DB, no `import "server-only"` — testable with
 * mocked fetch. Caller (server action) persists tokens to
 * `oauth_connections`.
 *
 * The `refreshGoogleToken` helper from P2.E (`src/lib/oauth/google.ts`)
 * handles refresh; this module covers the *initial* exchange.
 */

const GOOGLE_AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";

export interface BuildAuthorizeUrlInput {
  clientId: string;
  redirectUri: string;
  scopes: string[];
  /** State token bound to the user's session — verified on callback. */
  state: string;
  /** "consent" forces re-consent (so we get a fresh refresh_token). */
  prompt?: "consent" | "select_account" | "none";
  loginHint?: string;
}

/**
 * Build the consent-screen URL. Caller redirects the user here.
 *
 * `access_type=offline` is required to receive a refresh_token;
 * `prompt=consent` forces re-consent so Google returns a fresh
 * refresh_token (Google omits it on subsequent grants where the user
 * has already consented to the same scopes).
 */
export function buildGoogleAuthorizeUrl(input: BuildAuthorizeUrlInput): string {
  if (!input.clientId) throw new Error("buildGoogleAuthorizeUrl: clientId required");
  if (!input.redirectUri)
    throw new Error("buildGoogleAuthorizeUrl: redirectUri required");
  if (!input.scopes.length)
    throw new Error("buildGoogleAuthorizeUrl: at least one scope required");
  if (!input.state) throw new Error("buildGoogleAuthorizeUrl: state required");

  const params = new URLSearchParams({
    client_id: input.clientId,
    redirect_uri: input.redirectUri,
    response_type: "code",
    scope: input.scopes.join(" "),
    access_type: "offline",
    include_granted_scopes: "true",
    prompt: input.prompt ?? "consent",
    state: input.state,
  });
  if (input.loginHint) params.set("login_hint", input.loginHint);
  return `${GOOGLE_AUTH_URL}?${params.toString()}`;
}

export interface ExchangeCodeInput {
  code: string;
  clientId: string;
  clientSecret: string;
  redirectUri: string;
  fetch?: typeof globalThis.fetch;
  tokenUrl?: string;
  timeoutMs?: number;
}

export interface ExchangeCodeResult {
  accessToken: string;
  refreshToken: string;
  expiresAt: number;
  scopes: string[];
  tokenType: string;
  /** Raw id_token if `openid` scope was requested — caller may decode. */
  idToken?: string;
}

/**
 * Exchange the authorization code returned to the callback for an
 * access + refresh token pair.
 *
 * Throws on:
 *   - missing input
 *   - non-2xx response
 *   - response missing access_token / refresh_token / expires_in
 */
export async function exchangeGoogleCode(
  input: ExchangeCodeInput,
): Promise<ExchangeCodeResult> {
  if (!input.code) throw new Error("exchangeGoogleCode: code required");
  if (!input.clientId || !input.clientSecret)
    throw new Error("exchangeGoogleCode: clientId + clientSecret required");
  if (!input.redirectUri)
    throw new Error("exchangeGoogleCode: redirectUri required");

  const fetchImpl = input.fetch ?? globalThis.fetch.bind(globalThis);
  const url = input.tokenUrl ?? GOOGLE_TOKEN_URL;

  const formBody = new URLSearchParams({
    grant_type: "authorization_code",
    code: input.code,
    client_id: input.clientId,
    client_secret: input.clientSecret,
    redirect_uri: input.redirectUri,
  });

  const response = await fetchImpl(url, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: formBody.toString(),
    signal: AbortSignal.timeout(input.timeoutMs ?? 15_000),
  });

  const text = await response.text();
  if (response.status < 200 || response.status >= 300) {
    throw new Error(
      `Google code exchange failed: HTTP ${response.status} — ${truncate(text, 200)}`,
    );
  }

  let body: Record<string, unknown>;
  try {
    body = JSON.parse(text) as Record<string, unknown>;
  } catch {
    throw new Error("Google code exchange returned non-JSON response");
  }

  const accessToken = body["access_token"];
  const refreshToken = body["refresh_token"];
  const expiresIn = body["expires_in"];
  const scope = body["scope"];

  if (typeof accessToken !== "string" || !accessToken) {
    throw new Error("Google code exchange response missing access_token");
  }
  if (typeof refreshToken !== "string" || !refreshToken) {
    throw new Error(
      "Google code exchange response missing refresh_token (consent likely cached — retry with prompt=consent)",
    );
  }
  if (typeof expiresIn !== "number" || expiresIn <= 0) {
    throw new Error(
      "Google code exchange response missing valid expires_in",
    );
  }

  return {
    accessToken,
    refreshToken,
    expiresAt: Date.now() + expiresIn * 1000,
    scopes:
      typeof scope === "string" && scope.length > 0
        ? scope.split(" ").filter(Boolean)
        : [],
    tokenType:
      typeof body["token_type"] === "string"
        ? (body["token_type"] as string)
        : "Bearer",
    idToken:
      typeof body["id_token"] === "string"
        ? (body["id_token"] as string)
        : undefined,
  };
}

function truncate(s: string, max: number): string {
  return s.length <= max ? s : s.slice(0, max) + "…";
}
