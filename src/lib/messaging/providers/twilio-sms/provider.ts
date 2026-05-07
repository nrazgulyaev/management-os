/**
 * Stage 6.P2.F — Twilio SMS MessagingProvider adapter.
 *
 * Wraps Twilio's Messages API for plain SMS (no whatsapp: prefix —
 * `+E164` numbers as-is). Reuses the existing twilio-signature.ts
 * HMAC-SHA1 verifier from Stage 3.D.
 *
 * Stage 3.D's existing env-var-driven SMS infrastructure (if any)
 * coexists; this adapter wires SMS into the unified `MessagingProvider`
 * interface for operator-configured connections.
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
const CHANNEL: MessagingChannel = "sms";

export interface TwilioSmsCredentials {
  channel: "sms";
  accountSid: string;
  authToken: string;
  /** From-number in E.164 format (no `whatsapp:` prefix — that's WA). */
  fromNumber: string;
}

export interface TwilioSmsOptions extends RetryOptions {
  apiBase?: string;
}

export class TwilioSmsProvider implements MessagingProvider {
  readonly channel: MessagingChannel = CHANNEL;
  private readonly apiBase: string;
  private readonly retryOpts: RetryOptions;

  constructor(
    private readonly creds: TwilioSmsCredentials,
    opts: TwilioSmsOptions = {},
  ) {
    this.apiBase = opts.apiBase ?? TWILIO_API_BASE;
    this.retryOpts = {
      fetch: opts.fetch,
      timeoutMs: opts.timeoutMs,
      maxRetries: opts.maxRetries,
      backoffBaseMs: opts.backoffBaseMs,
    };
  }

  get authHeader(): string {
    return (
      "Basic " +
      Buffer.from(`${this.creds.accountSid}:${this.creds.authToken}`).toString(
        "base64",
      )
    );
  }

  async sendMessage(input: SendMessageInput): Promise<SendMessageResult> {
    if (input.channel !== "sms") {
      return {
        success: false,
        error: `TwilioSmsProvider received non-sms input (${input.channel})`,
      };
    }
    if (!input.recipientExternalId) {
      return { success: false, error: "recipientExternalId required" };
    }
    if (!input.text) {
      return { success: false, error: "text required for SMS" };
    }
    const params = new URLSearchParams();
    params.set("From", this.creds.fromNumber);
    params.set("To", input.recipientExternalId);
    params.set("Body", input.text);
    if (input.mediaUrl) params.set("MediaUrl", input.mediaUrl); // MMS
    try {
      const result = await requestWithRetry(
        `${this.apiBase}/Accounts/${this.creds.accountSid}/Messages.json`,
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
      if (result.status >= 200 && result.status < 300) {
        let sid: string | undefined;
        try {
          const parsed = JSON.parse(result.body) as Record<string, unknown>;
          if (typeof parsed["sid"] === "string") sid = parsed["sid"];
        } catch {
          // body wasn't JSON; fall through.
        }
        return { success: true, externalMessageId: sid };
      }
      return {
        success: false,
        error: `HTTP ${result.status}: ${truncate(result.body, 240)}`,
      };
    } catch (err) {
      return {
        success: false,
        error: err instanceof Error ? err.message : String(err),
      };
    }
  }

  verifyWebhook(payload: string, signature: string, secret: string): boolean {
    // Same Twilio HMAC-SHA1 scheme as P2.B's WhatsApp Twilio provider:
    // third arg = full request URL.
    return verifyTwilioSignature({
      authToken: this.creds.authToken,
      fullUrl: secret,
      formBody: payload,
      providedSignature: signature,
    });
  }

  parseWebhook(payload: Record<string, unknown>): IncomingMessage[] | null {
    const messageSid =
      pickStr(payload, "MessageSid") ?? pickStr(payload, "SmsMessageSid");
    const from = pickStr(payload, "From");
    if (!messageSid || !from) return null;
    if (
      pickStr(payload, "MessageStatus") &&
      !pickStr(payload, "Body") &&
      !pickStr(payload, "MediaUrl0")
    ) {
      // Status callback — not a new message.
      return null;
    }
    let contentType: MessageContentType = "text";
    let contentMediaUrl: string | undefined;
    const mediaUrl = pickStr(payload, "MediaUrl0");
    if (mediaUrl) {
      contentMediaUrl = mediaUrl;
      const mt = (pickStr(payload, "MediaContentType0") ?? "").toLowerCase();
      if (mt.startsWith("image/")) contentType = "image";
      else if (mt.startsWith("audio/")) contentType = "audio";
      else if (mt.startsWith("video/")) contentType = "video";
      else contentType = "document";
    }
    return [
      {
        channel: CHANNEL,
        externalMessageId: messageSid,
        externalThreadId: from,
        senderExternalId: from,
        contentType,
        contentText: pickStr(payload, "Body"),
        contentMediaUrl,
        receivedAt: new Date(),
        rawPayload: payload,
      },
    ];
  }

  async testConnection(): Promise<ConnectionTestResult> {
    try {
      const result = await requestWithRetry(
        `${this.apiBase}/Accounts/${this.creds.accountSid}.json`,
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
        connected: result.status >= 200 && result.status < 300,
        details: {
          channel: CHANNEL,
          status: result.status,
          fromNumber: this.creds.fromNumber,
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

function pickStr(o: Record<string, unknown>, key: string): string | undefined {
  const v = o[key];
  return typeof v === "string" && v.length > 0 ? v : undefined;
}

function truncate(s: string, max: number): string {
  return s.length <= max ? s : s.slice(0, max) + "…";
}
