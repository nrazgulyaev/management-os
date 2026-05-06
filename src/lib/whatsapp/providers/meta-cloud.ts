import "server-only";

import {
  NotImplementedError,
  type ParsedInboundMessage,
  type ProviderName,
  type SendMessageInput,
  type SendMessageResult,
  type SendTemplateInput,
  type TranscribeResult,
  type VerifyWebhookArgs,
  type WhatsAppProvider,
} from "./types";

/**
 * Meta Cloud WhatsApp provider — STUB.
 *
 * Implements the interface so the factory + tests treat it as a known
 * provider, but every call throws `NotImplementedError`. Wiring this
 * up requires:
 *
 *   1. A Meta Business account + WhatsApp Business app
 *      (developers.facebook.com).
 *   2. A registered phone number with verified business profile.
 *   3. A long-lived `META_WHATSAPP_ACCESS_TOKEN` (60-day rotating).
 *   4. Webhook callback URL registered in Meta App Dashboard.
 *
 * Wire format reference (for the future implementer):
 *   - POST https://graph.facebook.com/v19.0/{phone-number-id}/messages
 *   - Headers: Authorization: Bearer ${ACCESS_TOKEN}
 *   - Body (text):    {messaging_product: "whatsapp", to, type:"text", text:{body}}
 *   - Body (template):{messaging_product:"whatsapp", to, type:"template", template:{name, language:{code}, components}}
 *   - Webhook signature: X-Hub-Signature-256 = HMAC-SHA256 of body using app secret.
 *
 * Stage 3.D ships Twilio + DryRun. Meta Cloud is deferred until
 * operator demand or a Twilio outage justifies the second integration.
 */
export class MetaCloudWhatsAppProvider implements WhatsAppProvider {
  readonly name: ProviderName = "meta_cloud";

  isAvailable(): boolean {
    return false;
  }

  isSandbox(): boolean {
    return false;
  }

  async sendMessage(_input: SendMessageInput): Promise<SendMessageResult> {
    throw new NotImplementedError(
      "Meta Cloud sendMessage is not implemented in Stage 3.D — see lib/whatsapp/providers/meta-cloud.ts header comment",
    );
  }

  async sendTemplateMessage(
    _input: SendTemplateInput,
  ): Promise<SendMessageResult> {
    throw new NotImplementedError(
      "Meta Cloud sendTemplateMessage is not implemented in Stage 3.D",
    );
  }

  async transcribeVoice(
    _mediaUrl: string,
    _language?: string,
  ): Promise<TranscribeResult | null> {
    throw new NotImplementedError(
      "Meta Cloud transcribeVoice is not implemented in Stage 3.D",
    );
  }

  async verifyWebhookSignature(
    _args: VerifyWebhookArgs,
  ): Promise<boolean> {
    throw new NotImplementedError(
      "Meta Cloud verifyWebhookSignature is not implemented in Stage 3.D — would use X-Hub-Signature-256 HMAC-SHA256",
    );
  }

  parseInboundMessage(
    _payload: Record<string, unknown>,
  ): ParsedInboundMessage | null {
    throw new NotImplementedError(
      "Meta Cloud parseInboundMessage is not implemented in Stage 3.D — Meta wraps messages in entry[].changes[].value.messages[]",
    );
  }

  async healthCheck(): Promise<{ healthy: boolean; details?: string }> {
    return {
      healthy: false,
      details:
        "Meta Cloud provider is a stub in Stage 3.D. Use 'twilio' or 'dry_run'.",
    };
  }
}
