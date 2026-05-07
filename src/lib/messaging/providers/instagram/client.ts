/**
 * Stage 6.P2.D.1 — Instagram Business client (Meta Graph API).
 *
 * Bearer-token auth via the Page Access Token. Same Graph API the
 * WhatsApp Meta Cloud client (P2.B) hits, just different endpoints.
 * Reuses requestWithRetry from P1.A — same retry/backoff/429 envelope.
 *
 * Endpoints (Graph API v18.0):
 *   - POST /{ig_business_account_id}/messages          — send DM
 *   - POST /{comment_id}/replies                       — reply to a comment
 *   - GET  /me/conversations                           — list IG threads
 *   - GET  /me/media                                   — recent media
 *   - GET  /me                                         — auth ping
 *
 * Quirks vs WhatsApp Meta:
 *   - IG DMs use a flat `recipient.id + message.text` shape (not the
 *     WhatsApp `messaging_product/type/text/body` nesting).
 *   - Story mentions/replies are received as `messaging[]` items with a
 *     `story` payload — outbound replies post to the same /messages
 *     endpoint with the story_reply attribute.
 *   - Comments live on a separate endpoint scoped to the comment ID.
 */

import { requestWithRetry, type RetryOptions } from "@/lib/channel-manager/http-retry";

const GRAPH_API_BASE = "https://graph.facebook.com/v18.0";

export interface InstagramCredentials {
  channel: "instagram";
  pageAccessToken: string;
  instagramBusinessAccountId: string;
  facebookPageId: string;
  appSecret: string;
  webhookVerifyToken: string;
}

export interface InstagramClientOptions extends RetryOptions {
  apiBase?: string;
}

export interface InstagramClientResponse {
  status: number;
  body: string;
  apiCallsCount: number;
}

export class InstagramClient {
  private readonly apiBase: string;
  private readonly retryOpts: RetryOptions;

  constructor(
    private readonly creds: InstagramCredentials,
    opts: InstagramClientOptions = {},
  ) {
    this.apiBase = opts.apiBase ?? GRAPH_API_BASE;
    this.retryOpts = {
      fetch: opts.fetch,
      timeoutMs: opts.timeoutMs,
      maxRetries: opts.maxRetries,
      backoffBaseMs: opts.backoffBaseMs,
    };
  }

  /** Public for tests + introspection. Never logged. */
  get authHeader(): string {
    return `Bearer ${this.creds.pageAccessToken}`;
  }

  // -------------------------------------------------------------------------
  // Outbound — send DM, reply to comment
  // -------------------------------------------------------------------------

  /**
   * Send a direct message to an Instagram user. The user must have
   * messaged the business in the last 24h (IG's policy window) for
   * non-template messages — outside the window, only message tags
   * (HUMAN_AGENT etc.) are accepted, which the operator passes via
   * `tag` in `messageOverrides`.
   */
  async sendDirectMessage(input: {
    recipientId: string;
    text?: string;
    imageUrl?: string;
    /** Reference to a previously-received story for story_reply context. */
    replyToStoryId?: string;
    /** Optional Meta message tag (e.g. "HUMAN_AGENT") for outside-window sends. */
    tag?: string;
  }): Promise<InstagramClientResponse> {
    const message: Record<string, unknown> = {};
    if (input.text) message.text = input.text;
    if (input.imageUrl) {
      message.attachment = {
        type: "image",
        payload: { url: input.imageUrl, is_reusable: true },
      };
    }
    const body: Record<string, unknown> = {
      recipient: { id: input.recipientId },
      message,
    };
    if (input.replyToStoryId) {
      body.message = {
        ...message,
        // IG accepts an in-thread story_reply context referencing the
        // story media id the user mentioned the business in.
        story_reply: { story_id: input.replyToStoryId },
      };
    }
    if (input.tag) body.messaging_type = "MESSAGE_TAG";
    if (input.tag) body.tag = input.tag;
    return this.post(
      `/${this.creds.instagramBusinessAccountId}/messages`,
      body,
    );
  }

  /** Reply to a comment on a business post. */
  async replyToComment(input: {
    commentId: string;
    message: string;
  }): Promise<InstagramClientResponse> {
    return this.post(`/${input.commentId}/replies`, {
      message: input.message,
    });
  }

  // -------------------------------------------------------------------------
  // Read
  // -------------------------------------------------------------------------

  async listConversations(input: {
    limit?: number;
  } = {}): Promise<InstagramClientResponse> {
    const url = new URL(`${this.apiBase}/me/conversations`);
    url.searchParams.set("platform", "instagram");
    if (input.limit) url.searchParams.set("limit", String(input.limit));
    return this.dispatch("GET", url.toString());
  }

  async listMedia(input: {
    limit?: number;
  } = {}): Promise<InstagramClientResponse> {
    const url = new URL(
      `${this.apiBase}/${this.creds.instagramBusinessAccountId}/media`,
    );
    if (input.limit) url.searchParams.set("limit", String(input.limit));
    return this.dispatch("GET", url.toString());
  }

  /** Lightweight ping for testConnection — Graph's /me endpoint. */
  async getMe(): Promise<InstagramClientResponse> {
    return this.dispatch("GET", `${this.apiBase}/me?fields=id,name`);
  }

  // -------------------------------------------------------------------------
  // Internal
  // -------------------------------------------------------------------------

  private async post(
    path: string,
    body: unknown,
  ): Promise<InstagramClientResponse> {
    return this.dispatch("POST", `${this.apiBase}${path}`, body);
  }

  private async dispatch(
    method: string,
    url: string,
    jsonBody?: unknown,
  ): Promise<InstagramClientResponse> {
    const headers: Record<string, string> = {
      Authorization: this.authHeader,
      Accept: "application/json",
    };
    let body: string | undefined;
    if (jsonBody !== undefined) {
      headers["Content-Type"] = "application/json";
      body = JSON.stringify(jsonBody);
    }
    const result = await requestWithRetry(
      url,
      { method, headers, body },
      this.retryOpts,
    );
    return {
      status: result.status,
      body: result.body,
      apiCallsCount: result.apiCallsCount,
    };
  }
}

export { GRAPH_API_BASE as INSTAGRAM_API_BASE };
