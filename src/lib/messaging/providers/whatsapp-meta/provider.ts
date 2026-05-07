/**
 * Stage 6.P2.B — WhatsApp Meta Cloud MessagingProvider implementation.
 *
 * Wraps WhatsAppMetaClient + parsers behind the unified
 * MessagingProvider interface. Error paths degrade to
 * `{success: false, error}` — webhook routes and cron jobs loop
 * through these and a single bad message must not crash the batch.
 */

import { verifyHmacSha256Signature } from "@/lib/channel-manager/provider-helpers";
import type {
  ConnectionTestResult,
  IncomingMessage,
  MessagingChannel,
  MessagingProvider,
  SendMessageInput,
  SendMessageResult,
} from "../../types";
import {
  WhatsAppMetaClient,
  type WhatsAppMetaClientOptions,
  type WhatsAppMetaCloudCredentials,
} from "./client";
import { parseMetaWebhook } from "./parsers";

const CHANNEL: MessagingChannel = "whatsapp";

export class WhatsAppMetaProvider implements MessagingProvider {
  readonly channel: MessagingChannel = CHANNEL;
  private readonly client: WhatsAppMetaClient;
  private readonly appSecret: string;

  constructor(
    credentials: WhatsAppMetaCloudCredentials,
    clientOptions: WhatsAppMetaClientOptions = {},
  ) {
    this.client = new WhatsAppMetaClient(credentials, clientOptions);
    this.appSecret = credentials.appSecret;
  }

  async sendMessage(input: SendMessageInput): Promise<SendMessageResult> {
    if (input.channel !== "whatsapp") {
      return {
        success: false,
        error: `WhatsAppMetaProvider received non-whatsapp input (${input.channel})`,
      };
    }
    if (!input.recipientExternalId) {
      return { success: false, error: "recipientExternalId required" };
    }
    try {
      let res;
      if (input.contentType === "template_message") {
        if (!input.templateName) {
          return { success: false, error: "templateName required for template_message" };
        }
        const params = orderedTemplateParameters(input.templateVariables);
        res = await this.client.sendTemplate({
          to: input.recipientExternalId,
          templateName: input.templateName,
          languageCode: pickLanguageCode(input.templateVariables) ?? "en",
          bodyParameters: params,
        });
      } else if (
        input.contentType === "image" ||
        input.contentType === "document" ||
        input.contentType === "audio" ||
        input.contentType === "video"
      ) {
        if (!input.mediaUrl) {
          return { success: false, error: "mediaUrl required for media content" };
        }
        res = await this.client.sendMedia({
          to: input.recipientExternalId,
          mediaType: input.contentType,
          mediaUrl: input.mediaUrl,
          caption: input.text,
        });
      } else {
        // text + everything else falls through to text
        if (!input.text) {
          return { success: false, error: "text required for text message" };
        }
        res = await this.client.sendText({
          to: input.recipientExternalId,
          text: input.text,
          replyToMessageId: input.replyToExternalId,
        });
      }

      if (res.status >= 200 && res.status < 300) {
        const externalMessageId = extractMessageIdFromResponse(res.body);
        return {
          success: true,
          externalMessageId,
          // Meta charges per conversation, not per message. The cost
          // attribution lives on the inbound conversation initiation.
          // We leave costMinor undefined here — the daily usage cron
          // (P5) reconciles against Meta's billing API.
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
   * Verify Meta's `X-Hub-Signature-256` header. Format:
   *   `sha256=<hex>`
   * HMAC-SHA256 keyed with the app secret over the raw request body.
   */
  verifyWebhook(payload: string, signature: string, secret: string): boolean {
    // Meta always uses the appSecret stored on the credentials.
    // The `secret` parameter is honored for symmetry with the
    // interface but defaults to the appSecret bound at construction.
    const key = secret || this.appSecret;
    return verifyHmacSha256Signature(payload, signature, key);
  }

  parseWebhook(
    payload: Record<string, unknown>,
  ): IncomingMessage[] | null {
    const result = parseMetaWebhook(payload);
    if (result.messages.length === 0) {
      // Status-only updates (delivered/read receipts) aren't new
      // messages — return null so the unified handler routes them
      // separately. Service layer accesses parseMetaWebhook directly
      // for the receipts.
      return null;
    }
    return result.messages;
  }

  async testConnection(): Promise<ConnectionTestResult> {
    try {
      const res = await this.client.getBusinessProfile();
      return {
        connected: res.status >= 200 && res.status < 300,
        details: {
          channel: CHANNEL,
          provider: "meta_cloud",
          status: res.status,
          bodyPreview: truncate(res.body, 240),
        },
      };
    } catch (err) {
      return {
        connected: false,
        details: {
          channel: CHANNEL,
          provider: "meta_cloud",
          error: err instanceof Error ? err.message : String(err),
        },
      };
    }
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Convert a template variables map into ordered positional parameters.
 * Meta uses positional substitution ({{1}}, {{2}}, …) so the operator
 * has to define order. Convention: numeric keys go first sorted numerically;
 * non-numeric keys (excluding `__language__`) go in insertion order.
 */
function orderedTemplateParameters(
  variables: Record<string, string> | undefined,
): string[] {
  if (!variables) return [];
  const numeric: Array<[number, string]> = [];
  const named: Array<[string, string]> = [];
  for (const [k, v] of Object.entries(variables)) {
    if (k === "__language__") continue;
    const n = Number(k);
    if (Number.isInteger(n) && k === String(n)) {
      numeric.push([n, v]);
    } else {
      named.push([k, v]);
    }
  }
  numeric.sort((a, b) => a[0] - b[0]);
  return [...numeric.map(([, v]) => v), ...named.map(([, v]) => v)];
}

function pickLanguageCode(
  variables: Record<string, string> | undefined,
): string | undefined {
  if (!variables) return undefined;
  return variables["__language__"];
}

function extractMessageIdFromResponse(body: string): string | undefined {
  try {
    const parsed = JSON.parse(body) as Record<string, unknown>;
    const messages = parsed["messages"];
    if (Array.isArray(messages) && messages[0] && typeof messages[0] === "object") {
      const first = messages[0] as Record<string, unknown>;
      const id = first["id"];
      if (typeof id === "string") return id;
    }
  } catch {
    // body wasn't JSON; fall through.
  }
  return undefined;
}

function truncate(s: string, max: number): string {
  return s.length <= max ? s : s.slice(0, max) + "…";
}
