/**
 * Provider-agnostic WhatsApp interface. Mirrors the AI provider
 * abstraction (`lib/ai/providers/`) and the storage abstraction
 * (`lib/storage/`) — concrete implementations live in this directory
 * and the factory in `index.ts` picks one based on env vars.
 *
 * Switching providers is a one-file swap: implement this interface,
 * register in the factory, done. Agents and dispatchers never see
 * Twilio / Meta wire formats.
 */

export type ProviderName = "twilio" | "meta_cloud" | "dry_run" | "sandbox";

export interface WhatsAppProvider {
  readonly name: ProviderName;
  /** True when the underlying client is configured and usable. */
  isAvailable(): boolean;
  /** Auto-detected sandbox flag (Twilio sandbox or DryRun). */
  isSandbox(): boolean;

  // Outbound
  sendMessage(input: SendMessageInput): Promise<SendMessageResult>;
  sendTemplateMessage(input: SendTemplateInput): Promise<SendMessageResult>;

  // Voice transcription. Returns null when transcription unavailable.
  transcribeVoice(
    mediaUrl: string,
    language?: string,
  ): Promise<TranscribeResult | null>;

  // Webhook security + parsing.
  verifyWebhookSignature(args: VerifyWebhookArgs): Promise<boolean>;
  parseInboundMessage(
    payload: Record<string, unknown>,
  ): ParsedInboundMessage | null;

  // Health check (used by the setup wizard).
  healthCheck(): Promise<{ healthy: boolean; details?: string }>;
}

export interface SendMessageInput {
  /** E.164 format with the `whatsapp:` prefix preserved by the provider. */
  fromPhone: string;
  toPhone: string;
  body: string;
  mediaUrls?: string[];
}

export interface SendTemplateInput {
  fromPhone: string;
  toPhone: string;
  templateKey: string;
  variables: Record<string, string>;
  language: string;
}

export interface SendMessageResult {
  externalMessageSid: string;
  status: "queued" | "sent" | "failed";
  errorReason?: string;
  estimatedDeliveryAt?: Date;
}

export interface ParsedInboundMessage {
  externalMessageSid: string;
  /** E.164 — provider strips the `whatsapp:` prefix. */
  fromPhone: string;
  toPhone: string;
  messageType:
    | "text"
    | "voice"
    | "image"
    | "document"
    | "video"
    | "location";
  body?: string;
  mediaUrls?: string[];
  receivedAt: Date;
}

export interface TranscribeResult {
  text: string;
  language: string;
  confidence: number;
}

export interface VerifyWebhookArgs {
  /** Lowercased header map. */
  headers: Record<string, string>;
  /** Raw request body (string). Required for signature reconstruction. */
  rawBody: string;
  /** Full webhook URL the provider posted to (incl. query). */
  fullUrl: string;
}

export class WhatsAppProviderError extends Error {
  readonly providerName: string;
  readonly status?: number;
  constructor(providerName: string, message: string, status?: number) {
    super(message);
    this.name = "WhatsAppProviderError";
    this.providerName = providerName;
    this.status = status;
  }
}

export class NotImplementedError extends Error {
  constructor(reason: string) {
    super(reason);
    this.name = "NotImplementedError";
  }
}

/**
 * Normalise a phone number to E.164 (digits with leading `+`). Used at
 * persistence time so lookups don't depend on caller formatting.
 */
export function normalisePhone(raw: string): string {
  if (!raw) return raw;
  // Strip whatsapp: prefix + everything that isn't a digit; keep the +.
  const cleaned = raw.replace(/^whatsapp:/i, "").trim();
  const hasPlus = cleaned.startsWith("+");
  const digits = cleaned.replace(/[^\d]/g, "");
  return (hasPlus ? "+" : "+") + digits;
}
