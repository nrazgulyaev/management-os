/**
 * Stage 6.P2.E — Gmail MessagingProvider implementation.
 *
 * Polling-based today (the cron's inbound poll fetches messages via
 * `pullRecentMessages`); Pub/Sub push notifications land in P5 with
 * the full Workspace OAuth UI.
 *
 * Webhook handling: Gmail Pub/Sub posts a small notification with
 * the historyId; the service layer follows up with a `users.history.list`
 * call to find new messages. The `verifyWebhook` here verifies the
 * Pub/Sub JWT (deferred — for P2.E we always return false to keep the
 * fail-closed contract until the full Pub/Sub flow lands in P5).
 */

import type {
  ConnectionTestResult,
  IncomingMessage,
  MessagingChannel,
  MessagingProvider,
  PullRecentMessagesInput,
  SendMessageInput,
  SendMessageResult,
} from "../../types";
import {
  GmailClient,
  type GmailClientOptions,
  type GmailCredentials,
} from "./client";
import {
  projectGmailMessage,
  type GmailMessageResponse,
} from "./email-helpers";

const CHANNEL: MessagingChannel = "email";

export class GmailProvider implements MessagingProvider {
  readonly channel: MessagingChannel = CHANNEL;
  private readonly client: GmailClient;
  private readonly ownerEmailAddress: string;

  constructor(
    credentials: GmailCredentials,
    clientOptions: GmailClientOptions = {},
  ) {
    this.client = new GmailClient(credentials, clientOptions);
    this.ownerEmailAddress = credentials.emailAddress;
  }

  async sendMessage(input: SendMessageInput): Promise<SendMessageResult> {
    if (input.channel !== "email") {
      return {
        success: false,
        error: `GmailProvider received non-email input (${input.channel})`,
      };
    }
    if (!input.recipientExternalId) {
      return { success: false, error: "recipientExternalId required" };
    }
    if (!input.text) {
      return {
        success: false,
        error: "text required (rendered HTML or plain) for email",
      };
    }

    try {
      const res = await this.client.sendMessage({
        from: this.ownerEmailAddress,
        to: input.recipientExternalId,
        subject: input.subject ?? "(no subject)",
        // Heuristic: if the text contains an HTML tag, treat it as HTML;
        // operators using the composer typically pick a content type.
        bodyHtml: looksLikeHtml(input.text) ? input.text : undefined,
        bodyText: looksLikeHtml(input.text) ? undefined : input.text,
        inReplyTo: input.replyToExternalId,
      });

      if (res.status >= 200 && res.status < 300) {
        const externalMessageId = extractGmailMessageId(res.body);
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

  /**
   * Pull recent messages newer than `since`. Uses Gmail's `q=` query
   * to scope to inbox + after-date. Returns up to `limit` projected
   * IncomingMessages.
   *
   * Note: `users.messages.list` returns minimal records; we then call
   * `users.messages.get` per ID for the full payload. That's 1 + N
   * round-trips — acceptable for the 5-minute cron at small inbox
   * volumes; future optimisation would use `format=metadata` for the
   * list path and only fetch full body for new IDs.
   */
  async pullRecentMessages(
    input: PullRecentMessagesInput,
  ): Promise<IncomingMessage[]> {
    const limit = Math.min(input.limit ?? 50, 100);
    const sinceSec = Math.floor(input.since.getTime() / 1000);
    let listRes;
    try {
      listRes = await this.client.listMessages({
        query: `in:inbox after:${sinceSec}`,
        maxResults: limit,
      });
    } catch {
      return [];
    }
    if (listRes.status < 200 || listRes.status >= 300) return [];

    let parsed: { messages?: Array<{ id: string }> };
    try {
      parsed = JSON.parse(listRes.body);
    } catch {
      return [];
    }
    const messageIds = (parsed.messages ?? []).map((m) => m.id);
    if (messageIds.length === 0) return [];

    const out: IncomingMessage[] = [];
    for (const id of messageIds) {
      let detail;
      try {
        detail = await this.client.getMessage(id);
      } catch {
        continue;
      }
      if (detail.status < 200 || detail.status >= 300) continue;
      let detailParsed: GmailMessageResponse;
      try {
        detailParsed = JSON.parse(detail.body) as GmailMessageResponse;
      } catch {
        continue;
      }
      const projected = projectGmailMessage(detailParsed, this.ownerEmailAddress);
      if (projected) out.push(projected);
    }
    return out;
  }

  /**
   * P2.E ships polling-only. Pub/Sub push notifications + JWT
   * verification land in P5. For now, fail closed — webhook routes
   * shouldn't process Gmail webhooks until that flow is wired.
   */
  verifyWebhook(_payload: string, _signature: string, _secret: string): boolean {
    return false;
  }

  /**
   * P2.E ships polling-only. The Pub/Sub push payload will need
   * `historyId` extraction + a follow-up `history.list` call; that's
   * a different shape than the channels-with-embedded-messages parsers
   * in P2.B–D. Land the full flow in P5.
   */
  parseWebhook(
    _payload: Record<string, unknown>,
  ): IncomingMessage[] | null {
    return null;
  }

  async testConnection(): Promise<ConnectionTestResult> {
    try {
      const res = await this.client.getProfile();
      const connected = res.status >= 200 && res.status < 300;
      let emailAddress: string | undefined;
      let messagesTotal: number | undefined;
      if (connected) {
        try {
          const parsed = JSON.parse(res.body) as Record<string, unknown>;
          if (typeof parsed["emailAddress"] === "string") {
            emailAddress = parsed["emailAddress"];
          }
          if (typeof parsed["messagesTotal"] === "number") {
            messagesTotal = parsed["messagesTotal"];
          }
        } catch {
          // body wasn't JSON — leave fields undefined.
        }
      }
      return {
        connected,
        details: {
          channel: CHANNEL,
          provider: "gmail",
          status: res.status,
          emailAddress,
          messagesTotal,
        },
      };
    } catch (err) {
      return {
        connected: false,
        details: {
          channel: CHANNEL,
          provider: "gmail",
          error: err instanceof Error ? err.message : String(err),
        },
      };
    }
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function looksLikeHtml(s: string): boolean {
  // Cheap signal: any tag-like marker. Operators sending plain text
  // with `<` won't match — they should pick contentType explicitly
  // via the composer in P2.F.
  return /<\/?[a-z][^>]*>/i.test(s);
}

function extractGmailMessageId(body: string): string | undefined {
  try {
    const parsed = JSON.parse(body) as Record<string, unknown>;
    if (typeof parsed["id"] === "string") return parsed["id"] as string;
  } catch {
    // body wasn't JSON; fall through.
  }
  return undefined;
}

function truncate(s: string, max: number): string {
  return s.length <= max ? s : s.slice(0, max) + "…";
}
