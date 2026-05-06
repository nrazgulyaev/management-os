/**
 * Stage 6.P2.B — Twilio WhatsApp MessagingProvider implementation.
 *
 * Wraps Twilio's Messages API (raw fetch — no SDK, per the existing
 * Stage 3.D no-new-deps rule). Reuses the proven Twilio signature
 * verifier from `src/lib/whatsapp/providers/twilio-signature.ts`
 * (HMAC-SHA1 over URL + sorted form params, base64-encoded).
 *
 * Why a fresh provider instead of wrapping the existing
 * `src/lib/whatsapp/providers/twilio.ts`:
 *   - Existing class reads from env vars (TWILIO_*); the new provider
 *     interface accepts plaintext credentials (decrypted at runtime
 *     by the service layer).
 *   - Existing class implements a different interface
 *     (WhatsAppProvider — Stage 3.D shape) tailored to its callers.
 *   - The two coexist: Stage 3.D agents continue to use the env-var
 *     class; new operators connect via the unified credential UI and
 *     hit this class.
 *
 * Twilio quirks handled:
 *   - WhatsApp numbers are prefixed `whatsapp:+E164`. We auto-prepend
 *     when the recipient lacks the prefix.
 *   - Message body uses `application/x-www-form-urlencoded`, not JSON.
 *   - Templates use a content-template SID with variable substitution
 *     via `ContentSid` + `ContentVariables` JSON map.
 */

import { requestWithRetry, type RetryOptions } from "@/lib/channel-manager/http-retry";
import { verifyTwilioSignature } from "@/lib/whatsapp/providers/twilio-signature";
import type {
  ConnectionTestResult,
  IncomingMessage,
  MessageContentType,
  MessagingChannel,
  MessagingProvider,
  SendMessageInput,
  SendMessageResult,
} from "../../types";

const TWILIO_API_BASE = "https://api.twilio.com/2010-04-01";
const CHANNEL: MessagingChannel = "whatsapp";

export interface WhatsAppTwilioCredentials {
  channel: "whatsapp";
  provider: "twilio";
  accountSid: string;
  authToken: string;
  /** Twilio WhatsApp sender — e.g. "whatsapp:+14155238886". */
  fromNumber: string;
}

export interface WhatsAppTwilioOptions extends RetryOptions {
  apiBase?: string;
}

export class WhatsAppTwilioProvider implements MessagingProvider {
  readonly channel: MessagingChannel = CHANNEL;
  private readonly apiBase: string;
  private readonly retryOpts: RetryOptions;

  constructor(
    private readonly creds: WhatsAppTwilioCredentials,
    opts: WhatsAppTwilioOptions = {},
  ) {
    this.apiBase = opts.apiBase ?? TWILIO_API_BASE;
    this.retryOpts = {
      fetch: opts.fetch,
      timeoutMs: opts.timeoutMs,
      maxRetries: opts.maxRetries,
      backoffBaseMs: opts.backoffBaseMs,
    };
  }

  /** HTTP Basic auth header — public for tests, never logged. */
  get authHeader(): string {
    return (
      "Basic " +
      Buffer.from(`${this.creds.accountSid}:${this.creds.authToken}`).toString(
        "base64",
      )
    );
  }

  async sendMessage(input: SendMessageInput): Promise<SendMessageResult> {
    if (input.channel !== "whatsapp") {
      return {
        success: false,
        error: `WhatsAppTwilioProvider received non-whatsapp input (${input.channel})`,
      };
    }
    const to = ensureWhatsappPrefix(input.recipientExternalId);
    if (!to) {
      return { success: false, error: "recipientExternalId required" };
    }

    const params = new URLSearchParams();
    params.set("From", this.creds.fromNumber);
    params.set("To", to);

    if (input.contentType === "template_message") {
      if (!input.templateName) {
        return { success: false, error: "templateName required for template_message" };
      }
      // Twilio uses content-template SIDs (HX...). The operator sets
      // `templateName` to the SID; variables map to ContentVariables.
      params.set("ContentSid", input.templateName);
      if (input.templateVariables) {
        const filtered = Object.fromEntries(
          Object.entries(input.templateVariables).filter(
            ([k]) => k !== "__language__",
          ),
        );
        if (Object.keys(filtered).length > 0) {
          params.set("ContentVariables", JSON.stringify(filtered));
        }
      }
    } else if (input.mediaUrl) {
      params.set("MediaUrl", input.mediaUrl);
      if (input.text) params.set("Body", input.text);
    } else {
      if (!input.text) {
        return { success: false, error: "text required for text message" };
      }
      params.set("Body", input.text);
    }

    const url = `${this.apiBase}/Accounts/${this.creds.accountSid}/Messages.json`;
    try {
      const res = await requestWithRetry(
        url,
        {
          method: "POST",
          headers: {
            Authorization: this.authHeader,
            "Content-Type": "application/x-www-form-urlencoded",
            Accept: "application/json",
          },
          body: params.toString(),
        },
        this.retryOpts,
      );
      if (res.status >= 200 && res.status < 300) {
        const sid = extractTwilioSid(res.body);
        return { success: true, externalMessageId: sid };
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
   * Verify Twilio webhook signature (HMAC-SHA1 over URL + sorted form
   * params, base64-encoded). The launch prompt's Stage 3.D helper does
   * exactly this — we delegate to it.
   *
   * Caller MUST pass:
   *   - payload = the raw form-encoded request body
   *   - signature = the X-Twilio-Signature header value
   *   - secret = the full webhook URL (Twilio uses URL+body, NOT a
   *     standalone secret — the auth token is the HMAC key, baked
   *     into the credentials)
   *
   * That last point is unusual: the third arg is repurposed to carry
   * the canonical request URL because the Twilio scheme requires it.
   */
  verifyWebhook(payload: string, signature: string, secret: string): boolean {
    return verifyTwilioSignature({
      authToken: this.creds.authToken,
      fullUrl: secret,
      formBody: payload,
      providedSignature: signature,
    });
  }

  parseWebhook(
    payload: Record<string, unknown>,
  ): IncomingMessage[] | null {
    // Twilio webhook bodies are form-encoded — caller is expected to
    // parse `application/x-www-form-urlencoded` into an object before
    // invoking this. Required keys: MessageSid, From, To, Body OR
    // MediaUrl0..N. Status callbacks have MessageStatus instead.
    const messageSid = pickStr(payload, "MessageSid") ?? pickStr(payload, "SmsMessageSid");
    const from = pickStr(payload, "From");
    if (!messageSid || !from) return null;

    // Status callbacks (delivered/read receipts) have MessageStatus.
    // The unified service inspects raw Twilio payloads via parseTwilioStatusUpdate
    // — parseWebhook returns null for status-only payloads.
    if (pickStr(payload, "MessageStatus") && !pickStr(payload, "Body") && !pickStr(payload, "MediaUrl0")) {
      return null;
    }

    const senderPhone = stripWhatsappPrefix(from);
    const profileName = pickStr(payload, "ProfileName");
    const body = pickStr(payload, "Body");

    let contentType: MessageContentType = "text";
    let contentMediaUrl: string | undefined;
    let contentMetadata: Record<string, unknown> | undefined;

    const mediaUrl = pickStr(payload, "MediaUrl0");
    const mediaContentType = pickStr(payload, "MediaContentType0");
    if (mediaUrl) {
      contentMediaUrl = mediaUrl;
      contentType = inferContentTypeFromMediaContentType(mediaContentType);
      const mediaCount = Number(pickStr(payload, "NumMedia") ?? "1");
      contentMetadata = {
        mediaUrls: Array.from({ length: mediaCount }, (_, i) =>
          pickStr(payload, `MediaUrl${i}`),
        ).filter(Boolean),
        mediaContentType,
      };
    }

    return [
      {
        channel: CHANNEL,
        externalMessageId: messageSid,
        externalThreadId: senderPhone,
        senderExternalId: senderPhone,
        senderDisplayName: profileName,
        contentType,
        contentText: body,
        contentMediaUrl,
        contentMetadata,
        receivedAt: new Date(),
        rawPayload: payload,
      },
    ];
  }

  async testConnection(): Promise<ConnectionTestResult> {
    // GET account details — minimal, low-quota, returns 200 when creds valid.
    const url = `${this.apiBase}/Accounts/${this.creds.accountSid}.json`;
    try {
      const res = await requestWithRetry(
        url,
        {
          method: "GET",
          headers: {
            Authorization: this.authHeader,
            Accept: "application/json",
          },
        },
        this.retryOpts,
      );
      return {
        connected: res.status >= 200 && res.status < 300,
        details: {
          channel: CHANNEL,
          provider: "twilio",
          status: res.status,
          bodyPreview: truncate(res.body, 240),
        },
      };
    } catch (err) {
      return {
        connected: false,
        details: {
          channel: CHANNEL,
          provider: "twilio",
          error: err instanceof Error ? err.message : String(err),
        },
      };
    }
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function ensureWhatsappPrefix(phone: string | undefined): string {
  if (!phone) return "";
  if (phone.startsWith("whatsapp:")) return phone;
  return `whatsapp:${phone}`;
}

function stripWhatsappPrefix(phone: string): string {
  return phone.startsWith("whatsapp:")
    ? phone.slice("whatsapp:".length)
    : phone;
}

function inferContentTypeFromMediaContentType(
  mediaContentType: string | undefined,
): MessageContentType {
  if (!mediaContentType) return "document";
  const lower = mediaContentType.toLowerCase();
  if (lower.startsWith("image/")) return "image";
  if (lower.startsWith("audio/")) return "audio";
  if (lower.startsWith("video/")) return "video";
  return "document";
}

function pickStr(o: Record<string, unknown>, key: string): string | undefined {
  const v = o[key];
  return typeof v === "string" && v.length > 0 ? v : undefined;
}

function extractTwilioSid(body: string): string | undefined {
  try {
    const parsed = JSON.parse(body) as Record<string, unknown>;
    const sid = parsed["sid"];
    if (typeof sid === "string") return sid;
  } catch {
    // body wasn't JSON; fall through.
  }
  return undefined;
}

function truncate(s: string, max: number): string {
  return s.length <= max ? s : s.slice(0, max) + "…";
}
