import "server-only";

import {
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
 * DryRun provider — used when no Twilio credentials are configured or
 * `WHATSAPP_PROVIDER=dry_run` is set explicitly. Returns deterministic
 * stub responses so end-to-end flows (including the inbound pipeline
 * and outbound dispatcher) can be exercised in dev/CI without any
 * external account.
 *
 * Webhook signature verification ALWAYS passes — this is only safe in
 * dev. The factory refuses to select DryRun when `NODE_ENV=production`
 * AND the operator has explicitly set `WHATSAPP_REQUIRE_REAL_PROVIDER=1`.
 */
export class DryRunWhatsAppProvider implements WhatsAppProvider {
  readonly name: ProviderName = "dry_run";

  isAvailable(): boolean {
    return true;
  }

  isSandbox(): boolean {
    return true;
  }

  async sendMessage(input: SendMessageInput): Promise<SendMessageResult> {
    return {
      externalMessageSid: `DR-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      status: "queued",
      errorReason: undefined,
    };
  }

  async sendTemplateMessage(
    input: SendTemplateInput,
  ): Promise<SendMessageResult> {
    return {
      externalMessageSid: `DRT-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      status: "queued",
    };
  }

  async transcribeVoice(
    _mediaUrl: string,
    language?: string,
  ): Promise<TranscribeResult | null> {
    return {
      text: "[dry-run transcription stub] Set WHATSAPP_PROVIDER=twilio and TWILIO_AUTH_TOKEN for real voice transcription.",
      language: language ?? "en",
      confidence: 0.5,
    };
  }

  async verifyWebhookSignature(
    _args: VerifyWebhookArgs,
  ): Promise<boolean> {
    return true;
  }

  parseInboundMessage(
    payload: Record<string, unknown>,
  ): ParsedInboundMessage | null {
    // Accept either Twilio-shaped form fields or our own test payloads.
    const sid =
      (payload.MessageSid as string | undefined) ??
      (payload.sid as string | undefined) ??
      `DRY-${Date.now()}`;
    const from =
      (payload.From as string | undefined) ??
      (payload.from as string | undefined);
    const to =
      (payload.To as string | undefined) ??
      (payload.to as string | undefined);
    if (!from || !to) return null;
    const body =
      (payload.Body as string | undefined) ??
      (payload.body as string | undefined);
    const numMedia = Number(payload.NumMedia ?? payload.numMedia ?? 0);
    const mediaUrls: string[] = [];
    for (let i = 0; i < numMedia; i++) {
      const u = payload[`MediaUrl${i}`];
      if (typeof u === "string") mediaUrls.push(u);
    }
    const messageType: ParsedInboundMessage["messageType"] =
      mediaUrls.length > 0 ? "image" : "text";
    return {
      externalMessageSid: sid,
      fromPhone: normalisePhone(from),
      toPhone: normalisePhone(to),
      messageType,
      body: body ?? undefined,
      mediaUrls: mediaUrls.length > 0 ? mediaUrls : undefined,
      receivedAt: new Date(),
    };
  }

  async healthCheck(): Promise<{ healthy: boolean; details?: string }> {
    return {
      healthy: true,
      details:
        "DryRun provider — no real WhatsApp messages are sent. Configure TWILIO_ACCOUNT_SID + TWILIO_AUTH_TOKEN to switch.",
    };
  }
}
