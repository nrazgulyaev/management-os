/**
 * Stage 6.P2.E — Gmail API client.
 *
 * Bearer-token auth with auto-refresh on token expiry (proactive +
 * reactive 401 handling). Same callback-based persistence pattern as
 * the Airbnb client from P1.C — tokens rotate at runtime, and the
 * service layer must persist new tokens to oauth_connections.
 *
 * Native fetch via the shared retry envelope from P1.A. Polling-based:
 * watch (Pub/Sub) lands in P5 alongside Google Workspace OAuth UI.
 */

import { requestWithRetry, type RetryOptions } from "@/lib/channel-manager/http-retry";
import { refreshGoogleToken } from "@/lib/oauth/google";
import { buildRfc822, toBase64Url, type BuildRfc822Input } from "./email-helpers";

const GMAIL_API_BASE = "https://gmail.googleapis.com/gmail/v1";

export interface GmailCredentials {
  channel: "email";
  provider: "gmail";
  accessToken: string;
  refreshToken: string;
  /** Unix epoch ms — when accessToken expires. */
  expiresAt: number;
  emailAddress: string;
  /** Owning app_user — every Gmail OAuth grant is per-user. */
  userId: string;
}

export interface GmailCredentialsUpdate {
  accessToken: string;
  refreshToken: string;
  expiresAt: number;
}

export interface GmailClientOptions extends RetryOptions {
  apiBase?: string;
  /** Google OAuth2 client ID — required for token refresh. */
  clientId?: string;
  /** Google OAuth2 client secret — required for token refresh. */
  clientSecret?: string;
  /**
   * Invoked when the client refreshes the access token. Service layer
   * persists the new tokens to oauth_connections; the client also
   * updates its in-memory copy automatically.
   */
  onCredentialsRefreshed?: (next: GmailCredentialsUpdate) => Promise<void> | void;
  /** Margin (ms) before expiresAt at which we proactively refresh.
   *  Default 60s — covers clock skew + token TTL grace. */
  refreshMarginMs?: number;
}

export interface GmailClientResponse {
  status: number;
  body: string;
  apiCallsCount: number;
}

const DEFAULT_REFRESH_MARGIN_MS = 60_000;

export class GmailClient {
  private creds: GmailCredentials;
  private readonly apiBase: string;
  private readonly retryOpts: RetryOptions;
  private readonly fetchImpl: typeof globalThis.fetch;
  private readonly onCredentialsRefreshed?: GmailClientOptions["onCredentialsRefreshed"];
  private readonly refreshMarginMs: number;
  private readonly clientId: string | undefined;
  private readonly clientSecret: string | undefined;

  constructor(credentials: GmailCredentials, opts: GmailClientOptions = {}) {
    this.creds = { ...credentials };
    this.apiBase = opts.apiBase ?? GMAIL_API_BASE;
    this.fetchImpl = opts.fetch ?? globalThis.fetch.bind(globalThis);
    this.retryOpts = {
      fetch: this.fetchImpl,
      timeoutMs: opts.timeoutMs,
      maxRetries: opts.maxRetries,
      backoffBaseMs: opts.backoffBaseMs,
    };
    this.onCredentialsRefreshed = opts.onCredentialsRefreshed;
    this.refreshMarginMs = opts.refreshMarginMs ?? DEFAULT_REFRESH_MARGIN_MS;
    this.clientId = opts.clientId;
    this.clientSecret = opts.clientSecret;
  }

  /** Read-only — useful for tests + service-layer introspection. */
  get credentials(): Readonly<GmailCredentials> {
    return this.creds;
  }

  // -------------------------------------------------------------------------
  // High-level methods
  // -------------------------------------------------------------------------

  async listMessages(input: {
    query?: string;
    labelIds?: string[];
    maxResults?: number;
    pageToken?: string;
  } = {}): Promise<GmailClientResponse> {
    const url = new URL(`${this.apiBase}/users/me/messages`);
    if (input.query) url.searchParams.set("q", input.query);
    if (input.labelIds) {
      for (const id of input.labelIds) {
        url.searchParams.append("labelIds", id);
      }
    }
    url.searchParams.set("maxResults", String(input.maxResults ?? 100));
    if (input.pageToken) url.searchParams.set("pageToken", input.pageToken);
    return this.dispatch("GET", url.toString());
  }

  async getMessage(messageId: string): Promise<GmailClientResponse> {
    return this.dispatch(
      "GET",
      `${this.apiBase}/users/me/messages/${encodeURIComponent(messageId)}?format=full`,
    );
  }

  async sendMessage(input: BuildRfc822Input): Promise<GmailClientResponse> {
    const raw = buildRfc822(input);
    const encoded = toBase64Url(raw);
    return this.dispatch(
      "POST",
      `${this.apiBase}/users/me/messages/send`,
      { raw: encoded },
    );
  }

  async getProfile(): Promise<GmailClientResponse> {
    return this.dispatch("GET", `${this.apiBase}/users/me/profile`);
  }

  /**
   * Set up Pub/Sub watch — push notifications for new messages.
   * Lands fully in P5 alongside the Google Workspace OAuth UI.
   * Exposed here so the service layer can register watches when the
   * full OAuth + Cloud Pub/Sub topic config is ready.
   */
  async setupWatch(input: {
    topicName: string;
    labelIds?: string[];
  }): Promise<GmailClientResponse> {
    return this.dispatch("POST", `${this.apiBase}/users/me/watch`, {
      topicName: input.topicName,
      labelIds: input.labelIds ?? ["INBOX"],
    });
  }

  // -------------------------------------------------------------------------
  // Auth helpers
  // -------------------------------------------------------------------------

  private async ensureFreshToken(): Promise<string> {
    if (this.tokenExpiresWithinMargin()) {
      await this.refreshTokenNow();
    }
    return `Bearer ${this.creds.accessToken}`;
  }

  private tokenExpiresWithinMargin(): boolean {
    return this.creds.expiresAt - Date.now() <= this.refreshMarginMs;
  }

  private async refreshTokenNow(): Promise<void> {
    if (!this.clientId || !this.clientSecret) {
      throw new Error(
        "GmailClient: clientId + clientSecret must be passed via options to refresh tokens",
      );
    }
    const refreshed = await refreshGoogleToken({
      refreshToken: this.creds.refreshToken,
      clientId: this.clientId,
      clientSecret: this.clientSecret,
      fetch: this.fetchImpl,
    });
    this.creds = {
      ...this.creds,
      accessToken: refreshed.accessToken,
      refreshToken: refreshed.refreshToken ?? this.creds.refreshToken,
      expiresAt: refreshed.expiresAt,
    };
    if (this.onCredentialsRefreshed) {
      await this.onCredentialsRefreshed({
        accessToken: this.creds.accessToken,
        refreshToken: this.creds.refreshToken,
        expiresAt: this.creds.expiresAt,
      });
    }
  }

  // -------------------------------------------------------------------------
  // Dispatch — handles auth header + 401 → refresh+retry once
  // -------------------------------------------------------------------------

  private async dispatch(
    method: string,
    url: string,
    jsonBody?: unknown,
  ): Promise<GmailClientResponse> {
    const auth = await this.ensureFreshToken();
    const headers: Record<string, string> = {
      Authorization: auth,
      Accept: "application/json",
    };
    let body: string | undefined;
    if (jsonBody !== undefined) {
      headers["Content-Type"] = "application/json";
      body = JSON.stringify(jsonBody);
    }

    const first = await requestWithRetry(
      url,
      { method, headers, body },
      this.retryOpts,
    );

    // 401 mid-flight: token may have been revoked between our
    // pre-check and the request. One reactive refresh + retry.
    if (first.status === 401) {
      try {
        await this.refreshTokenNow();
      } catch {
        return {
          status: first.status,
          body: first.body,
          apiCallsCount: first.apiCallsCount,
        };
      }
      const retryAuth = `Bearer ${this.creds.accessToken}`;
      const second = await requestWithRetry(
        url,
        { method, headers: { ...headers, Authorization: retryAuth }, body },
        this.retryOpts,
      );
      return {
        status: second.status,
        body: second.body,
        apiCallsCount: first.apiCallsCount + second.apiCallsCount,
      };
    }

    return {
      status: first.status,
      body: first.body,
      apiCallsCount: first.apiCallsCount,
    };
  }
}

export { GMAIL_API_BASE };
