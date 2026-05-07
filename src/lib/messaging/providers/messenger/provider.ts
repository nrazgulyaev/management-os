/**
 * Stage 6.P2.D.2 — Facebook Messenger MessagingProvider implementation.
 *
 * Wraps MessengerClient + parsers behind the unified MessagingProvider
 * interface. Reuses verifyHmacSha256Signature from P1.D — same code
 * path Booking.com / Airbnb / Trip.com / WhatsApp Meta / Instagram run.
 */

import type {
  ConnectionTestResult,
  IncomingMessage,
  MessagingChannel,
  MessagingProvider,
  SendMessageInput,
  SendMessageResult,
} from "../../types";
import {
  verifyHmacSha256Signature,
} from "@/lib/channel-manager/provider-helpers";
import {
  MessengerClient,
  type MessengerClientOptions,
  type MessengerCredentials,
} from "./client";
import { parseMessengerWebhook } from "./parsers";

const CHANNEL: MessagingChannel = "facebook_messenger";

export class MessengerProvider implements MessagingProvider {
  readonly channel: MessagingChannel = CHANNEL;
  private readonly client: MessengerClient;
  private readonly appSecret: string;

  constructor(
    credentials: MessengerCredentials,
    clientOptions: MessengerClientOptions = {},
  ) {
    this.client = new MessengerClient(credentials, clientOptions);
    this.appSecret = credentials.appSecret;
  }

  async sendMessage(input: SendMessageInput): Promise<SendMessageResult> {
    if (input.channel !== "facebook_messenger") {
      return {
        success: false,
        error: `MessengerProvider received non-messenger input (${input.channel})`,
      };
    }
    if (!input.recipientExternalId) {
      return { success: false, error: "recipientExternalId required" };
    }

    try {
      let res;
      if (input.contentType === "image") {
        if (!input.mediaUrl) {
          return { success: false, error: "mediaUrl required for image" };
        }
        res = await this.client.sendMedia({
          recipientId: input.recipientExternalId,
          mediaType: "image",
          mediaUrl: input.mediaUrl,
        });
      } else if (input.contentType === "audio") {
        if (!input.mediaUrl) {
          return { success: false, error: "mediaUrl required for audio" };
        }
        res = await this.client.sendMedia({
          recipientId: input.recipientExternalId,
          mediaType: "audio",
          mediaUrl: input.mediaUrl,
        });
      } else if (input.contentType === "video") {
        if (!input.mediaUrl) {
          return { success: false, error: "mediaUrl required for video" };
        }
        res = await this.client.sendMedia({
          recipientId: input.recipientExternalId,
          mediaType: "video",
          mediaUrl: input.mediaUrl,
        });
      } else if (input.contentType === "document") {
        if (!input.mediaUrl) {
          return { success: false, error: "mediaUrl required for document" };
        }
        res = await this.client.sendMedia({
          recipientId: input.recipientExternalId,
          mediaType: "file",
          mediaUrl: input.mediaUrl,
        });
      } else if (input.contentType === "template_message") {
        // Templates: operator stores the rendered button-template
        // payload as a JSON string in `text`. The composer in P2.F
        // surfaces a template builder that produces this shape.
        if (!input.text) {
          return { success: false, error: "text required for template_message" };
        }
        let templatePayload;
        try {
          templatePayload = JSON.parse(input.text);
        } catch {
          return {
            success: false,
            error: "template_message text must be JSON-serialised button template",
          };
        }
        res = await this.client.sendButtonTemplate({
          recipientId: input.recipientExternalId,
          template: templatePayload,
        });
      } else {
        // Text + everything else falls through to plain text.
        if (!input.text) {
          return { success: false, error: "text required for text message" };
        }
        res = await this.client.sendText({
          recipientId: input.recipientExternalId,
          text: input.text,
        });
      }

      if (res.status >= 200 && res.status < 300) {
        const externalMessageId = extractMessengerMessageId(res.body);
        return { success: true, externalMessageId };
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

  /** HMAC-SHA256 with sha256= prefix in X-Hub-Signature-256, app_secret keyed. */
  verifyWebhook(payload: string, signature: string, secret: string): boolean {
    const key = secret || this.appSecret;
    return verifyHmacSha256Signature(payload, signature, key);
  }

  parseWebhook(
    payload: Record<string, unknown>,
  ): IncomingMessage[] | null {
    const result = parseMessengerWebhook(payload);
    // Status receipts (read/delivery) aren't messages — service layer
    // calls parseMessengerWebhook directly when it needs them.
    if (result.messages.length === 0) return null;
    return result.messages;
  }

  async testConnection(): Promise<ConnectionTestResult> {
    try {
      const res = await this.client.getPageInfo();
      const connected = res.status >= 200 && res.status < 300;
      let pageName: string | undefined;
      let pageCategory: string | undefined;
      if (connected) {
        try {
          const parsed = JSON.parse(res.body) as Record<string, unknown>;
          if (typeof parsed["name"] === "string") pageName = parsed["name"];
          if (typeof parsed["category"] === "string")
            pageCategory = parsed["category"];
        } catch {
          // body wasn't JSON — leave page details undefined.
        }
      }
      return {
        connected,
        details: {
          channel: CHANNEL,
          status: res.status,
          pageName,
          pageCategory,
          bodyPreview: truncate(res.body, 240),
        },
      };
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
// Helpers
// ---------------------------------------------------------------------------

function extractMessengerMessageId(body: string): string | undefined {
  try {
    const parsed = JSON.parse(body) as Record<string, unknown>;
    if (typeof parsed["message_id"] === "string") {
      return parsed["message_id"] as string;
    }
  } catch {
    // body wasn't JSON; fall through.
  }
  return undefined;
}

function truncate(s: string, max: number): string {
  return s.length <= max ? s : s.slice(0, max) + "…";
}
