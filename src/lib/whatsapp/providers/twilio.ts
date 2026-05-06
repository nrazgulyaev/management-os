import "server-only";

import { verifyTwilioSignature } from "./twilio-signature";
import {
  WhatsAppProviderError,
  type ParsedInboundMessage,
  type ProviderName,
  type SendMessageInput,
  type SendMessageResult,
  type SendTemplateInput,
  type TranscribeResult,
  type VerifyWebhookArgs,
  type WhatsAppProvider,
  normalisePhone,
} from "./types";

/**
 * Twilio WhatsApp provider — primary implementation.
 *
 * Uses raw fetch (no SDK) to keep the Stage 2.2.B "no new top-level
 * deps" rule. Twilio's Messages API accepts simple form-encoded POST.
 * Webhook signature verification follows Twilio's published HMAC-SHA1
 * recipe over the full URL + sorted form params.
 *
 * Sandbox mode is auto-detected from `TWILIO_WHATSAPP_FROM_NUMBER` —
 * when it equals the Twilio sandbox number `+14155238886`, recipients
 * must opt-in via "join {keyword}" before they can receive messages.
 */

const TWILIO_API_BASE = "https://api.twilio.com/2010-04-01";
const SANDBOX_FROM = "whatsapp:+14155238886";
const DEFAULT_TIMEOUT_MS = 15_000;

export class TwilioWhatsAppProvider implements WhatsAppProvider {
  readonly name: ProviderName = "twilio";

  private readonly accountSid: string | undefined;
  private readonly authToken: string | undefined;
  private readonly fromNumber: string | undefined;

  constructor() {
    this.accountSid = process.env.TWILIO_ACCOUNT_SID;
    this.authToken = process.env.TWILIO_AUTH_TOKEN;
    this.fromNumber =
      process.env.TWILIO_WHATSAPP_FROM_NUMBER ??
      process.env.TWILIO_FROM_WHATSAPP;
  }

  isAvailable(): boolean {
    return Boolean(this.accountSid && this.authToken && this.fromNumber);
  }

  isSandbox(): boolean {
    if (!this.fromNumber) return false;
    return this.fromNumber === SANDBOX_FROM;
  }

  async sendMessage(input: SendMessageInput): Promise<SendMessageResult> {
    if (!this.isAvailable()) {
      throw new WhatsAppProviderError(
        this.name,
        "TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, or TWILIO_WHATSAPP_FROM_NUMBER not configured",
      );
    }
    const form = new URLSearchParams();
    form.set("From", twilioFormat(input.fromPhone));
    form.set("To", twilioFormat(input.toPhone));
    form.set("Body", input.body);
    if (input.mediaUrls && input.mediaUrls.length > 0) {
      // Twilio accepts up to 10 MediaUrls.
      for (const u of input.mediaUrls.slice(0, 10)) {
        form.append("MediaUrl", u);
      }
    }
    return this.postMessage(form);
  }

  async sendTemplateMessage(
    input: SendTemplateInput,
  ): Promise<SendMessageResult> {
    if (!this.isAvailable()) {
      throw new WhatsAppProviderError(
        this.name,
        "Twilio credentials not configured",
      );
    }
    // Twilio template messages use the `ContentSid` / `ContentVariables`
    // form fields. The mapping from `templateKey` → ContentSid lives in
    // the `whatsapp_message_templates.twilio_template_sid` column —
    // resolved by the dispatcher before this call.
    const form = new URLSearchParams();
    form.set("From", twilioFormat(input.fromPhone));
    form.set("To", twilioFormat(input.toPhone));
    form.set("ContentSid", input.templateKey);
    if (Object.keys(input.variables).length > 0) {
      // Twilio expects a JSON object keyed by index 1..N.
      // The dispatcher is expected to pre-format `variables` keys.
      form.set(
        "ContentVariables",
        JSON.stringify(input.variables),
      );
    }
    return this.postMessage(form);
  }

  async transcribeVoice(
    mediaUrl: string,
    language?: string,
  ): Promise<TranscribeResult | null> {
    // Twilio doesn't transcribe inbound voice messages automatically —
    // Stage 3.D defers to a later stage that wires Whisper. For now,
    // return null; the inbound processor will surface this via the
    // message's status note.
    return null;
  }

  async verifyWebhookSignature(args: VerifyWebhookArgs): Promise<boolean> {
    const provided =
      args.headers["x-twilio-signature"] ??
      args.headers["X-Twilio-Signature"];
    return verifyTwilioSignature({
      authToken: this.authToken,
      fullUrl: args.fullUrl,
      formBody: args.rawBody,
      providedSignature: provided,
    });
  }

  parseInboundMessage(
    payload: Record<string, unknown>,
  ): ParsedInboundMessage | null {
    const sid = payload.MessageSid;
    const from = payload.From;
    const to = payload.To;
    if (typeof sid !== "string" || typeof from !== "string" || typeof to !== "string") {
      return null;
    }
    const numMedia = Number(payload.NumMedia ?? 0);
    const mediaUrls: string[] = [];
    let messageType: ParsedInboundMessage["messageType"] = "text";
    for (let i = 0; i < numMedia; i++) {
      const u = payload[`MediaUrl${i}`];
      const t = payload[`MediaContentType${i}`];
      if (typeof u === "string") {
        mediaUrls.push(u);
        if (typeof t === "string") {
          if (t.startsWith("audio/")) messageType = "voice";
          else if (t.startsWith("image/")) messageType = "image";
          else if (t.startsWith("video/")) messageType = "video";
          else if (t.startsWith("application/")) messageType = "document";
        }
      }
    }
    if (payload.Latitude || payload.Longitude) messageType = "location";
    const body = payload.Body;
    return {
      externalMessageSid: sid,
      fromPhone: normalisePhone(from),
      toPhone: normalisePhone(to),
      messageType,
      body: typeof body === "string" ? body : undefined,
      mediaUrls: mediaUrls.length > 0 ? mediaUrls : undefined,
      receivedAt: new Date(),
    };
  }

  async healthCheck(): Promise<{ healthy: boolean; details?: string }> {
    if (!this.isAvailable()) {
      return {
        healthy: false,
        details:
          "Twilio credentials missing. Set TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_WHATSAPP_FROM_NUMBER.",
      };
    }
    // Light check — fetch the Account resource.
    const url = `${TWILIO_API_BASE}/Accounts/${this.accountSid}.json`;
    const auth = Buffer.from(
      `${this.accountSid}:${this.authToken}`,
    ).toString("base64");
    try {
      const res = await fetch(url, {
        headers: { authorization: `Basic ${auth}` },
        signal: AbortSignal.timeout(DEFAULT_TIMEOUT_MS),
      });
      if (!res.ok) {
        return {
          healthy: false,
          details: `Twilio account check failed: HTTP ${res.status}`,
        };
      }
      return {
        healthy: true,
        details: this.isSandbox() ? "Twilio sandbox mode" : "Twilio production",
      };
    } catch (err) {
      return {
        healthy: false,
        details: err instanceof Error ? err.message : "Unknown error",
      };
    }
  }

  private async postMessage(
    form: URLSearchParams,
  ): Promise<SendMessageResult> {
    const url = `${TWILIO_API_BASE}/Accounts/${this.accountSid}/Messages.json`;
    const auth = Buffer.from(
      `${this.accountSid}:${this.authToken}`,
    ).toString("base64");
    let res: Response;
    try {
      res = await fetch(url, {
        method: "POST",
        headers: {
          authorization: `Basic ${auth}`,
          "content-type": "application/x-www-form-urlencoded",
        },
        body: form.toString(),
        signal: AbortSignal.timeout(DEFAULT_TIMEOUT_MS),
      });
    } catch (err) {
      throw new WhatsAppProviderError(
        this.name,
        err instanceof Error ? err.message : "Twilio fetch failed",
      );
    }
    let body: { sid?: string; status?: string; error_message?: string };
    try {
      body = (await res.json()) as typeof body;
    } catch {
      throw new WhatsAppProviderError(
        this.name,
        `Could not parse Twilio response (HTTP ${res.status})`,
        res.status,
      );
    }
    if (!res.ok || !body.sid) {
      return {
        externalMessageSid: "",
        status: "failed",
        errorReason: body.error_message ?? `HTTP ${res.status}`,
      };
    }
    return {
      externalMessageSid: body.sid,
      status: mapTwilioStatus(body.status),
      errorReason: undefined,
    };
  }
}

function twilioFormat(phone: string): string {
  if (phone.startsWith("whatsapp:")) return phone;
  return `whatsapp:${phone.startsWith("+") ? phone : "+" + phone}`;
}

function mapTwilioStatus(s?: string): SendMessageResult["status"] {
  if (s === "queued" || s === "accepted" || s === "scheduled") return "queued";
  if (s === "sent" || s === "delivered") return "sent";
  return "failed";
}
