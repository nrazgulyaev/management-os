/**
 * Stage 6.P2.D.2 — Facebook Messenger client (Meta Graph API).
 *
 * Same Graph API base + Bearer auth pattern as the Instagram + Meta
 * Cloud (WhatsApp) clients. Different message shape:
 *
 *   POST /v18.0/me/messages
 *   {
 *     recipient: { id: <PSID> },
 *     messaging_type: "RESPONSE" | "MESSAGE_TAG",
 *     tag?: "HUMAN_AGENT" | ...,
 *     message: {
 *       text?: string,
 *       attachment?: {...},
 *       quick_replies?: [...]
 *     }
 *   }
 *
 * Templates (button, generic, list) live under `message.attachment`
 * with `type: "template"` + `payload: {template_type, ...}`.
 */

import { requestWithRetry, type RetryOptions } from "@/lib/channel-manager/http-retry";

const GRAPH_API_BASE = "https://graph.facebook.com/v18.0";

export interface MessengerCredentials {
  channel: "facebook_messenger";
  pageAccessToken: string;
  facebookPageId: string;
  appSecret: string;
  webhookVerifyToken: string;
}

export interface MessengerClientOptions extends RetryOptions {
  apiBase?: string;
}

export interface MessengerClientResponse {
  status: number;
  body: string;
  apiCallsCount: number;
}

export interface MessengerQuickReply {
  /** "text" — only quick-reply type the operator UI exposes today. */
  contentType: "text";
  title: string;
  payload: string;
  imageUrl?: string;
}

export interface MessengerButtonTemplate {
  text: string;
  buttons: Array<
    | { type: "postback"; title: string; payload: string }
    | { type: "web_url"; title: string; url: string }
  >;
}

export class MessengerClient {
  private readonly apiBase: string;
  private readonly retryOpts: RetryOptions;

  constructor(
    private readonly creds: MessengerCredentials,
    opts: MessengerClientOptions = {},
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
  // Outbound
  // -------------------------------------------------------------------------

  async sendText(input: {
    recipientId: string;
    text: string;
    quickReplies?: MessengerQuickReply[];
    /** Optional Meta message tag for outside-window sends. */
    tag?: string;
  }): Promise<MessengerClientResponse> {
    const message: Record<string, unknown> = { text: input.text };
    if (input.quickReplies && input.quickReplies.length > 0) {
      message.quick_replies = input.quickReplies.map((q) => ({
        content_type: q.contentType,
        title: q.title,
        payload: q.payload,
        image_url: q.imageUrl,
      }));
    }
    return this.postMessage(input.recipientId, message, input.tag);
  }

  async sendMedia(input: {
    recipientId: string;
    mediaType: "image" | "audio" | "video" | "file";
    mediaUrl: string;
  }): Promise<MessengerClientResponse> {
    const message = {
      attachment: {
        type: input.mediaType,
        payload: { url: input.mediaUrl, is_reusable: true },
      },
    };
    return this.postMessage(input.recipientId, message);
  }

  async sendButtonTemplate(input: {
    recipientId: string;
    template: MessengerButtonTemplate;
  }): Promise<MessengerClientResponse> {
    const message = {
      attachment: {
        type: "template",
        payload: {
          template_type: "button",
          text: input.template.text,
          buttons: input.template.buttons,
        },
      },
    };
    return this.postMessage(input.recipientId, message);
  }

  /**
   * Configure persistent menu / get-started button on the page profile.
   * The composer surfaces this via the `MessengerProfileEditor` UI in
   * P2.F (settings tab on the connection detail page).
   */
  async setMessengerProfile(input: {
    getStarted?: { payload: string };
    persistentMenu?: Array<{
      locale: string;
      composer_input_disabled?: boolean;
      call_to_actions: Array<{
        type: "postback" | "web_url";
        title: string;
        payload?: string;
        url?: string;
      }>;
    }>;
  }): Promise<MessengerClientResponse> {
    const body: Record<string, unknown> = {};
    if (input.getStarted) body.get_started = input.getStarted;
    if (input.persistentMenu) body.persistent_menu = input.persistentMenu;
    return this.dispatch(
      "POST",
      `${this.apiBase}/me/messenger_profile`,
      body,
    );
  }

  /** Lightweight ping for testConnection. */
  async getPageInfo(): Promise<MessengerClientResponse> {
    return this.dispatch(
      "GET",
      `${this.apiBase}/me?fields=id,name,category`,
    );
  }

  // -------------------------------------------------------------------------
  // Internal
  // -------------------------------------------------------------------------

  private async postMessage(
    recipientId: string,
    message: Record<string, unknown>,
    tag?: string,
  ): Promise<MessengerClientResponse> {
    const body: Record<string, unknown> = {
      recipient: { id: recipientId },
      messaging_type: tag ? "MESSAGE_TAG" : "RESPONSE",
      message,
    };
    if (tag) body.tag = tag;
    return this.dispatch("POST", `${this.apiBase}/me/messages`, body);
  }

  private async dispatch(
    method: string,
    url: string,
    jsonBody?: unknown,
  ): Promise<MessengerClientResponse> {
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

export { GRAPH_API_BASE as MESSENGER_API_BASE };
