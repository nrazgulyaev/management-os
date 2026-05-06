/**
 * Stage 6.P2.C — Telegram MessagingProvider implementation.
 *
 * Wraps TelegramClient behind the unified MessagingProvider interface.
 * Same SyncResult-style degradation as every other provider — single
 * bad call returns `{success: false, error}` rather than throwing.
 *
 * Webhook auth: Telegram doesn't HMAC the payload — it just echoes
 * the shared secret in the X-Telegram-Bot-Api-Secret-Token header.
 * `verifyWebhook` does a constant-time string compare.
 *
 * Telegram update shape (used by parseWebhook):
 *
 *   { update_id, message?, edited_message?, callback_query? }
 *
 * `message` is the standard inbound case. `edited_message` carries
 * the same shape with a new edit_date — surfaced as a separate
 * IncomingMessage with `contentMetadata.edited = true` so the
 * service layer can decide how to merge. `callback_query` is the
 * user clicking an inline-keyboard button — surfaced as a `reply`
 * content type with the button's data in metadata.
 */

import { timingSafeEqual } from "node:crypto";
import type {
  ConnectionTestResult,
  IncomingMessage,
  MessageContentType,
  MessagingChannel,
  MessagingProvider,
  SendMessageInput,
  SendMessageResult,
} from "../../types";
import {
  TelegramClient,
  type TelegramClientOptions,
  type TelegramCredentials,
} from "./client";

const CHANNEL: MessagingChannel = "telegram";

export class TelegramProvider implements MessagingProvider {
  readonly channel: MessagingChannel = CHANNEL;
  private readonly client: TelegramClient;
  private readonly webhookSecret: string;

  constructor(
    credentials: TelegramCredentials,
    clientOptions: TelegramClientOptions = {},
  ) {
    this.client = new TelegramClient(credentials, clientOptions);
    this.webhookSecret = credentials.webhookSecret;
  }

  async sendMessage(input: SendMessageInput): Promise<SendMessageResult> {
    if (input.channel !== "telegram") {
      return {
        success: false,
        error: `TelegramProvider received non-telegram input (${input.channel})`,
      };
    }
    if (!input.recipientExternalId) {
      return { success: false, error: "recipientExternalId required" };
    }
    const chatId = parseChatId(input.recipientExternalId);
    const replyToMessageId = parseMessageId(input.replyToExternalId);

    try {
      let res;
      switch (input.contentType) {
        case "image":
          if (!input.mediaUrl) {
            return { success: false, error: "mediaUrl required for image" };
          }
          res = await this.client.sendPhoto({
            chatId,
            photoUrl: input.mediaUrl,
            caption: input.text,
            replyToMessageId,
          });
          break;
        case "document":
          if (!input.mediaUrl) {
            return { success: false, error: "mediaUrl required for document" };
          }
          res = await this.client.sendDocument({
            chatId,
            documentUrl: input.mediaUrl,
            caption: input.text,
            replyToMessageId,
          });
          break;
        case "audio":
          if (!input.mediaUrl) {
            return { success: false, error: "mediaUrl required for audio" };
          }
          res = await this.client.sendAudio({
            chatId,
            audioUrl: input.mediaUrl,
            caption: input.text,
          });
          break;
        case "video":
          if (!input.mediaUrl) {
            return { success: false, error: "mediaUrl required for video" };
          }
          res = await this.client.sendVideo({
            chatId,
            videoUrl: input.mediaUrl,
            caption: input.text,
          });
          break;
        case "template_message":
          // Telegram has no template concept — operators use Markdown
          // or HTML in plain text. Treat templateName as a no-op and
          // send the rendered text directly.
          if (!input.text) {
            return {
              success: false,
              error: "Telegram has no template surface; pass rendered text instead",
            };
          }
          res = await this.client.sendMessage({
            chatId,
            text: input.text,
            replyToMessageId,
          });
          break;
        default:
          // text + everything else falls through to text
          if (!input.text) {
            return { success: false, error: "text required for text message" };
          }
          res = await this.client.sendMessage({
            chatId,
            text: input.text,
            replyToMessageId,
          });
      }

      if (res.status >= 200 && res.status < 300) {
        const externalMessageId = extractTelegramMessageId(res.body);
        return {
          success: true,
          externalMessageId,
          // Telegram is free per-message — explicit zero so the cost
          // dashboard can distinguish "no cost" from "unknown cost".
          costMinor: 0n,
          costCurrency: "USD",
        };
      }
      return {
        success: false,
        error: `HTTP ${res.status}: ${truncate(res.body, 240)}`,
      };
    } catch (err) {
      return {
        success: false,
        error: err instanceof Error ? err.message : String(err),
      };
    }
  }

  /**
   * Telegram doesn't HMAC payloads. The setWebhook call registered
   * a `secret_token`; Telegram echoes it in the
   * `X-Telegram-Bot-Api-Secret-Token` header on every inbound. We
   * do a constant-time compare against the credential we hold.
   *
   * `payload` is unused on Telegram — kept for interface symmetry.
   * `secret` is the value the credential was registered with; the
   * caller passes the credential's secret here, which must match
   * the header value the route handler extracts.
   */
  verifyWebhook(_payload: string, signature: string, secret: string): boolean {
    void _payload;
    if (!signature || !secret) return false;
    if (signature.length !== secret.length) return false;
    try {
      return timingSafeEqual(
        Buffer.from(signature, "utf8"),
        Buffer.from(secret, "utf8"),
      );
    } catch {
      return false;
    }
  }

  parseWebhook(payload: Record<string, unknown>): IncomingMessage[] | null {
    if (!payload || typeof payload !== "object") return null;
    if (typeof payload["update_id"] !== "number") return null;

    const message = payload["message"] as Record<string, unknown> | undefined;
    if (message) {
      const projected = projectMessage(message, false);
      return projected ? [projected] : null;
    }

    const edited = payload["edited_message"] as
      | Record<string, unknown>
      | undefined;
    if (edited) {
      const projected = projectMessage(edited, true);
      return projected ? [projected] : null;
    }

    const callback = payload["callback_query"] as
      | Record<string, unknown>
      | undefined;
    if (callback) {
      const projected = projectCallbackQuery(callback);
      return projected ? [projected] : null;
    }

    // Other update types (channel_post, inline_query, etc.) — out of
    // scope for the inbox; service layer ignores via null.
    return null;
  }

  async testConnection(): Promise<ConnectionTestResult> {
    try {
      const res = await this.client.getMe();
      if (res.status < 200 || res.status >= 300) {
        return {
          connected: false,
          details: {
            channel: CHANNEL,
            status: res.status,
            bodyPreview: truncate(res.body, 240),
          },
        };
      }
      // Telegram returns { ok: true, result: { id, username, first_name, ... } }
      try {
        const parsed = JSON.parse(res.body) as Record<string, unknown>;
        const result = parsed["result"] as Record<string, unknown> | undefined;
        return {
          connected: parsed["ok"] === true,
          details: {
            channel: CHANNEL,
            botUsername: result ? pickString(result, "username") : undefined,
            botFirstName: result ? pickString(result, "first_name") : undefined,
            botId: result ? result["id"] : undefined,
          },
        };
      } catch {
        return {
          connected: false,
          details: { channel: CHANNEL, error: "non-JSON response" },
        };
      }
    } catch (err) {
      return {
        connected: false,
        details: {
          channel: CHANNEL,
          error: err instanceof Error ? err.message : String(err),
        },
      };
    }
  }
}

// ---------------------------------------------------------------------------
// Pure helpers (file-private)
// ---------------------------------------------------------------------------

function projectMessage(
  m: Record<string, unknown>,
  edited: boolean,
): IncomingMessage | null {
  const messageId = m["message_id"];
  const chat = m["chat"] as Record<string, unknown> | undefined;
  const from = m["from"] as Record<string, unknown> | undefined;
  if (typeof messageId !== "number" || !chat || !from) return null;

  const chatId = chat["id"];
  if (typeof chatId !== "number" && typeof chatId !== "string") return null;

  const senderId = from["id"];
  if (typeof senderId !== "number" && typeof senderId !== "string") return null;

  const senderDisplayName =
    pickString(from, "username") ??
    ([pickString(from, "first_name"), pickString(from, "last_name")]
      .filter(Boolean)
      .join(" ") ||
      undefined);

  const date = m["date"];
  const receivedAt =
    typeof date === "number" ? new Date(date * 1000) : new Date();

  const replyTo = m["reply_to_message"] as Record<string, unknown> | undefined;
  const replyToExternalId =
    replyTo && typeof replyTo["message_id"] === "number"
      ? String(replyTo["message_id"])
      : undefined;

  // Content type detection in Telegram's loose union order. text wins
  // over caption when both are present — text is the standalone field.
  let contentType: MessageContentType = "text";
  let contentText: string | undefined;
  let contentMediaUrl: string | undefined;
  let contentMetadata: Record<string, unknown> | undefined;

  if (typeof m["text"] === "string") {
    contentText = m["text"] as string;
  } else if (m["photo"]) {
    contentType = "image";
    contentText = pickString(m, "caption");
    // Telegram returns photo as an array of size variants — capture
    // the file_id of the largest (last) variant for the service to fetch.
    const photos = m["photo"] as Array<Record<string, unknown>>;
    const largest = photos[photos.length - 1];
    contentMetadata = {
      fileId: largest ? largest["file_id"] : undefined,
      mediaSizes: photos.length,
    };
  } else if (m["document"]) {
    contentType = "document";
    contentText = pickString(m, "caption");
    const doc = m["document"] as Record<string, unknown>;
    contentMetadata = {
      fileId: pickString(doc, "file_id"),
      fileName: pickString(doc, "file_name"),
      mimeType: pickString(doc, "mime_type"),
    };
  } else if (m["audio"] || m["voice"]) {
    contentType = "audio";
    contentText = pickString(m, "caption");
    const aud = (m["audio"] ?? m["voice"]) as Record<string, unknown>;
    contentMetadata = {
      fileId: pickString(aud, "file_id"),
      mimeType: pickString(aud, "mime_type"),
      duration: aud["duration"],
    };
  } else if (m["video"] || m["video_note"]) {
    contentType = "video";
    contentText = pickString(m, "caption");
    const vid = (m["video"] ?? m["video_note"]) as Record<string, unknown>;
    contentMetadata = {
      fileId: pickString(vid, "file_id"),
      mimeType: pickString(vid, "mime_type"),
      duration: vid["duration"],
    };
  } else if (m["sticker"]) {
    contentType = "sticker";
    const st = m["sticker"] as Record<string, unknown>;
    contentMetadata = {
      fileId: pickString(st, "file_id"),
      emoji: pickString(st, "emoji"),
      setName: pickString(st, "set_name"),
    };
  } else if (m["location"]) {
    contentType = "location";
    const loc = m["location"] as Record<string, unknown>;
    contentMetadata = {
      latitude: loc["latitude"],
      longitude: loc["longitude"],
    };
  } else if (m["contact"]) {
    contentType = "contact";
    contentMetadata = { contact: m["contact"] };
  }

  if (edited) {
    contentMetadata = { ...(contentMetadata ?? {}), edited: true };
  }

  return {
    channel: CHANNEL,
    externalMessageId: String(messageId),
    externalThreadId: String(chatId),
    senderExternalId: String(senderId),
    senderDisplayName,
    contentType,
    contentText,
    contentMediaUrl,
    contentMetadata,
    replyToExternalId,
    receivedAt,
    rawPayload: m,
  };
}

function projectCallbackQuery(
  cq: Record<string, unknown>,
): IncomingMessage | null {
  const id = cq["id"];
  const from = cq["from"] as Record<string, unknown> | undefined;
  const data = cq["data"];
  const message = cq["message"] as Record<string, unknown> | undefined;
  if (typeof id !== "string" || !from || !message) return null;

  const chat = message["chat"] as Record<string, unknown> | undefined;
  const messageId = message["message_id"];
  if (!chat || typeof messageId !== "number") return null;

  const chatId = chat["id"];
  const senderId = from["id"];

  return {
    channel: CHANNEL,
    // Synthesise an external ID — callback queries have their own id
    // separate from message_id; we prefix to avoid collision with
    // regular messages in the (channel × external_message_id) unique.
    externalMessageId: `cbq:${id}`,
    externalThreadId: String(chatId),
    senderExternalId: String(senderId),
    senderDisplayName:
      pickString(from, "username") ??
      ([pickString(from, "first_name"), pickString(from, "last_name")]
        .filter(Boolean)
        .join(" ") ||
        undefined),
    contentType: "reply",
    contentText: typeof data === "string" ? data : undefined,
    contentMetadata: {
      callbackQueryId: id,
      sourceMessageId: messageId,
      data,
    },
    receivedAt: new Date(),
    rawPayload: cq,
  };
}

function parseChatId(raw: string): string | number {
  // Telegram chat IDs are integers but our interface uses strings.
  // If the operator passed a numeric string, send it as a number so
  // Telegram's parser doesn't reject the type mismatch.
  if (/^-?\d+$/.test(raw)) return Number(raw);
  return raw;
}

function parseMessageId(raw: string | undefined): number | undefined {
  if (!raw) return undefined;
  // Strip the cbq: prefix used for callback-query synthetic IDs — those
  // can't be replied to as message_ids.
  if (raw.startsWith("cbq:")) return undefined;
  const n = Number(raw);
  return Number.isInteger(n) ? n : undefined;
}

function extractTelegramMessageId(body: string): string | undefined {
  try {
    const parsed = JSON.parse(body) as Record<string, unknown>;
    if (parsed["ok"] !== true) return undefined;
    const result = parsed["result"] as Record<string, unknown> | undefined;
    if (result && typeof result["message_id"] === "number") {
      return String(result["message_id"]);
    }
  } catch {
    // body wasn't JSON; fall through.
  }
  return undefined;
}

function pickString(o: Record<string, unknown>, key: string): string | undefined {
  const v = o[key];
  return typeof v === "string" && v.length > 0 ? v : undefined;
}

function truncate(s: string, max: number): string {
  return s.length <= max ? s : s.slice(0, max) + "…";
}
