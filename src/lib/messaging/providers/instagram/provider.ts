/**
 * Stage 6.P2.D.1 — Instagram MessagingProvider implementation.
 *
 * Wraps InstagramClient + parsers behind the unified MessagingProvider
 * interface. Reuses the shared `verifyHmacSha256Signature` helper from
 * P1.D provider-helpers — same code path Booking.com / Airbnb /
 * Trip.com / WhatsApp Meta all run.
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
  InstagramClient,
  type InstagramClientOptions,
  type InstagramCredentials,
} from "./client";
import { parseInstagramWebhook } from "./parsers";

const CHANNEL: MessagingChannel = "instagram";

export class InstagramProvider implements MessagingProvider {
  readonly channel: MessagingChannel = CHANNEL;
  private readonly client: InstagramClient;
  private readonly appSecret: string;

  constructor(
    credentials: InstagramCredentials,
    clientOptions: InstagramClientOptions = {},
  ) {
    this.client = new InstagramClient(credentials, clientOptions);
    this.appSecret = credentials.appSecret;
  }

  async sendMessage(input: SendMessageInput): Promise<SendMessageResult> {
    if (input.channel !== "instagram") {
      return {
        success: false,
        error: `InstagramProvider received non-instagram input (${input.channel})`,
      };
    }
    if (!input.recipientExternalId) {
      return { success: false, error: "recipientExternalId required" };
    }

    try {
      // IG comments are projected into the inbox with a `comment:` prefix
      // on externalMessageId (parsers.ts). Outbound replies to those use
      // the comment-reply endpoint, not the DM endpoint.
      if (input.replyToExternalId?.startsWith("comment:")) {
        if (!input.text) {
          return { success: false, error: "text required for comment reply" };
        }
        const commentId = input.replyToExternalId.slice("comment:".length);
        const res = await this.client.replyToComment({
          commentId,
          message: input.text,
        });
        return projectIgResult(res);
      }

      // Story-reply context: `replyToExternalId` carries the originating
      // story media id. The composer surfaces this when a story_mention
      // came in. The recipient is the IG user who posted the story.
      let replyToStoryId: string | undefined;
      if (input.replyToExternalId?.startsWith("story:")) {
        replyToStoryId = input.replyToExternalId.slice("story:".length);
      }

      // Per-content-type validation. Meta's API would 400 on missing
      // payloads; we reject synchronously so the operator sees a clear
      // error rather than a parsed Meta error.
      if (input.contentType === "image" && !input.mediaUrl) {
        return { success: false, error: "mediaUrl required for image" };
      }
      if (input.contentType === "text" && !input.text) {
        return { success: false, error: "text required for text message" };
      }

      const res = await this.client.sendDirectMessage({
        recipientId: input.recipientExternalId,
        text: input.text,
        imageUrl: input.contentType === "image" ? input.mediaUrl : undefined,
        replyToStoryId,
      });
      return projectIgResult(res);
    } catch (err) {
      return {
        success: false,
        error: err instanceof Error ? err.message : String(err),
      };
    }
  }

  /**
   * Meta uses HMAC-SHA256 with `sha256=<hex>` prefix in the
   * X-Hub-Signature-256 header, keyed with the app secret.
   * Delegated to the shared helper for consistency with WhatsApp Meta.
   */
  verifyWebhook(payload: string, signature: string, secret: string): boolean {
    const key = secret || this.appSecret;
    return verifyHmacSha256Signature(payload, signature, key);
  }

  parseWebhook(
    payload: Record<string, unknown>,
  ): IncomingMessage[] | null {
    const result = parseInstagramWebhook(payload);
    // Reactions aren't messages — service layer uses
    // `parseInstagramWebhook` directly when it needs them.
    if (result.messages.length === 0) return null;
    return result.messages;
  }

  async testConnection(): Promise<ConnectionTestResult> {
    try {
      const res = await this.client.getMe();
      const connected = res.status >= 200 && res.status < 300;
      let pageName: string | undefined;
      if (connected) {
        try {
          const parsed = JSON.parse(res.body) as Record<string, unknown>;
          if (typeof parsed["name"] === "string") {
            pageName = parsed["name"] as string;
          }
        } catch {
          // body wasn't JSON — leave pageName undefined.
        }
      }
      return {
        connected,
        details: {
          channel: CHANNEL,
          status: res.status,
          pageName,
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

function projectIgResult(res: {
  status: number;
  body: string;
}): SendMessageResult {
  if (res.status >= 200 && res.status < 300) {
    const externalMessageId = extractIgMessageId(res.body);
    return {
      success: true,
      externalMessageId,
      // IG charges per-conversation similar to WhatsApp — daily
      // billing reconciliation runs separately. Per-message cost
      // is left undefined.
    };
  }
  return {
    success: false,
    error: `HTTP ${res.status}: ${truncate(res.body, 240)}`,
  };
}

function extractIgMessageId(body: string): string | undefined {
  try {
    const parsed = JSON.parse(body) as Record<string, unknown>;
    // IG returns `{ recipient_id, message_id }` for DMs and
    // `{ id }` for comment replies. Cover both.
    if (typeof parsed["message_id"] === "string") {
      return parsed["message_id"] as string;
    }
    if (typeof parsed["id"] === "string") {
      return parsed["id"] as string;
    }
  } catch {
    // body wasn't JSON; fall through.
  }
  return undefined;
}

function truncate(s: string, max: number): string {
  return s.length <= max ? s : s.slice(0, max) + "…";
}
