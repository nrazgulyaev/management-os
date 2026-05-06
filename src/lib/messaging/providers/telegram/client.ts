/**
 * Stage 6.P2.C — Telegram Bot API client.
 *
 * Telegram is the simplest messaging integration we ship:
 *   - No partner approval required (talk to @BotFather → get token).
 *   - Free per-message (no cost tracking surface needed).
 *   - JSON throughout.
 *   - Webhook auth is a shared secret (no HMAC math — Telegram echoes
 *     it in the X-Telegram-Bot-Api-Secret-Token header on inbound).
 *
 * Native fetch via the shared retry envelope from P1 — same retry/
 * backoff semantics as every other channel.
 */

import { requestWithRetry, type RetryOptions } from "@/lib/channel-manager/http-retry";

const TELEGRAM_API_BASE = "https://api.telegram.org";

export interface TelegramCredentials {
  channel: "telegram";
  /** From @BotFather. Format: "<bot_id>:<token_hash>". */
  botToken: string;
  /** Used as `secret_token` on setWebhook + verified on inbound. */
  webhookSecret: string;
}

export interface TelegramClientOptions extends RetryOptions {
  apiBase?: string;
}

export interface TelegramClientResponse {
  status: number;
  body: string;
  apiCallsCount: number;
}

export class TelegramClient {
  private readonly apiBase: string;
  private readonly retryOpts: RetryOptions;

  constructor(
    private readonly creds: TelegramCredentials,
    opts: TelegramClientOptions = {},
  ) {
    this.apiBase = opts.apiBase ?? TELEGRAM_API_BASE;
    this.retryOpts = {
      fetch: opts.fetch,
      timeoutMs: opts.timeoutMs,
      maxRetries: opts.maxRetries,
      backoffBaseMs: opts.backoffBaseMs,
    };
  }

  /** Public for tests + introspection. The base URL embeds the bot
   *  token, so this is sensitive — never log it. */
  get botApiBase(): string {
    return `${this.apiBase}/bot${this.creds.botToken}`;
  }

  // -------------------------------------------------------------------------
  // Outbound — Telegram has separate endpoints per content type.
  // -------------------------------------------------------------------------

  async sendMessage(input: {
    chatId: string | number;
    text: string;
    parseMode?: "HTML" | "MarkdownV2";
    replyToMessageId?: number;
  }): Promise<TelegramClientResponse> {
    return this.post("/sendMessage", {
      chat_id: input.chatId,
      text: input.text,
      parse_mode: input.parseMode,
      reply_to_message_id: input.replyToMessageId,
    });
  }

  async sendPhoto(input: {
    chatId: string | number;
    photoUrl: string;
    caption?: string;
    replyToMessageId?: number;
  }): Promise<TelegramClientResponse> {
    return this.post("/sendPhoto", {
      chat_id: input.chatId,
      photo: input.photoUrl,
      caption: input.caption,
      reply_to_message_id: input.replyToMessageId,
    });
  }

  async sendDocument(input: {
    chatId: string | number;
    documentUrl: string;
    caption?: string;
    replyToMessageId?: number;
  }): Promise<TelegramClientResponse> {
    return this.post("/sendDocument", {
      chat_id: input.chatId,
      document: input.documentUrl,
      caption: input.caption,
      reply_to_message_id: input.replyToMessageId,
    });
  }

  async sendAudio(input: {
    chatId: string | number;
    audioUrl: string;
    caption?: string;
  }): Promise<TelegramClientResponse> {
    return this.post("/sendAudio", {
      chat_id: input.chatId,
      audio: input.audioUrl,
      caption: input.caption,
    });
  }

  async sendVideo(input: {
    chatId: string | number;
    videoUrl: string;
    caption?: string;
  }): Promise<TelegramClientResponse> {
    return this.post("/sendVideo", {
      chat_id: input.chatId,
      video: input.videoUrl,
      caption: input.caption,
    });
  }

  // -------------------------------------------------------------------------
  // Webhook + status
  // -------------------------------------------------------------------------

  /**
   * Register the bot's webhook URL + shared secret. Telegram POSTs to
   * `webhookUrl` for every update and includes the secret in the
   * X-Telegram-Bot-Api-Secret-Token header.
   *
   * Idempotent: re-registering with the same URL is a no-op on
   * Telegram's side beyond a fresh secret rotation.
   */
  async setWebhook(input: {
    webhookUrl: string;
    secretToken?: string;
    allowedUpdates?: string[];
  }): Promise<TelegramClientResponse> {
    return this.post("/setWebhook", {
      url: input.webhookUrl,
      secret_token: input.secretToken ?? this.creds.webhookSecret,
      allowed_updates: input.allowedUpdates ?? [
        "message",
        "edited_message",
        "callback_query",
      ],
    });
  }

  async deleteWebhook(): Promise<TelegramClientResponse> {
    return this.post("/deleteWebhook", {});
  }

  /** Lightweight ping — returns the bot's identity. */
  async getMe(): Promise<TelegramClientResponse> {
    return this.dispatch("GET", `${this.botApiBase}/getMe`);
  }

  /**
   * Long-poll alternative to webhooks. Used as a fallback when the
   * webhook can't reach us (local dev, NAT issues). The cron job
   * passes `offset = lastSeenUpdateId + 1` for resume.
   */
  async getUpdates(input: {
    offset?: number;
    limit?: number;
    timeout?: number;
  } = {}): Promise<TelegramClientResponse> {
    const url = new URL(`${this.botApiBase}/getUpdates`);
    if (input.offset !== undefined) {
      url.searchParams.set("offset", String(input.offset));
    }
    if (input.limit !== undefined) {
      url.searchParams.set("limit", String(input.limit));
    }
    if (input.timeout !== undefined) {
      url.searchParams.set("timeout", String(input.timeout));
    }
    return this.dispatch("GET", url.toString());
  }

  // -------------------------------------------------------------------------
  // Internal
  // -------------------------------------------------------------------------

  private async post(
    path: string,
    body: Record<string, unknown>,
  ): Promise<TelegramClientResponse> {
    // Strip undefined values — Telegram's parser rejects { foo: undefined }.
    const cleanBody: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(body)) {
      if (v !== undefined) cleanBody[k] = v;
    }
    return this.dispatch("POST", `${this.botApiBase}${path}`, cleanBody);
  }

  private async dispatch(
    method: string,
    url: string,
    jsonBody?: Record<string, unknown>,
  ): Promise<TelegramClientResponse> {
    const headers: Record<string, string> = { Accept: "application/json" };
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

export { TELEGRAM_API_BASE };
