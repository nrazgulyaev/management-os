/**
 * Stage 6.P2.A — Messaging provider types.
 *
 * Single `MessagingProvider` interface every channel implementation
 * (WhatsApp Meta, WhatsApp Twilio, Telegram, Instagram, Messenger,
 * Gmail, SMS) conforms to. Mirrors the proven Stage 3.A AI provider /
 * Stage 6.P1 channel-manager provider pattern.
 *
 * Pure types — no DB, no `import "server-only"`. Importable from
 * client code (UI types) and tests.
 */

import type {
  MessagingChannel,
  MessageContentType,
} from "@/lib/db/schema/messaging";

// Re-export for downstream importers that don't want a schema dep.
export type { MessagingChannel, MessageContentType };

// ---------------------------------------------------------------------------
// Credentials — discriminated union per channel
// ---------------------------------------------------------------------------

/** WhatsApp dual-provider: `provider` discriminates Meta Cloud vs Twilio. */
export interface WhatsAppMetaCloudCredentials {
  channel: "whatsapp";
  provider: "meta_cloud";
  accessToken: string;
  phoneNumberId: string;
  businessAccountId: string;
  webhookVerifyToken: string;
  /** App secret for X-Hub-Signature-256 webhook verification. */
  appSecret: string;
}

export interface WhatsAppTwilioCredentials {
  channel: "whatsapp";
  provider: "twilio";
  accountSid: string;
  authToken: string;
  /** Twilio WhatsApp sender, e.g. "whatsapp:+14155238886". */
  fromNumber: string;
}

export type WhatsAppCredentials =
  | WhatsAppMetaCloudCredentials
  | WhatsAppTwilioCredentials;

export interface TelegramCredentials {
  channel: "telegram";
  /** From @BotFather. */
  botToken: string;
  /** Used as `secret_token` on the setWebhook call + verified on inbound. */
  webhookSecret: string;
}

export interface InstagramCredentials {
  channel: "instagram";
  pageAccessToken: string;
  instagramBusinessAccountId: string;
  facebookPageId: string;
  appSecret: string;
  webhookVerifyToken: string;
}

export interface FacebookMessengerCredentials {
  channel: "facebook_messenger";
  pageAccessToken: string;
  facebookPageId: string;
  appSecret: string;
  webhookVerifyToken: string;
}

export interface GmailCredentials {
  channel: "email";
  provider: "gmail";
  accessToken: string;
  refreshToken: string;
  /** Unix epoch ms — when accessToken expires. */
  expiresAt: number;
  emailAddress: string;
  /** Owning app_user — every Gmail OAuth grant is per-user. */
  userId: string;
}

export interface ResendCredentials {
  channel: "email";
  provider: "resend";
  apiKey: string;
  /** From-address every outbound is sent as (must be verified in Resend). */
  fromAddress: string;
}

export type EmailCredentials = GmailCredentials | ResendCredentials;

export interface TwilioSmsCredentials {
  channel: "sms";
  accountSid: string;
  authToken: string;
  fromNumber: string;
}

export type MessagingCredentials =
  | WhatsAppCredentials
  | TelegramCredentials
  | InstagramCredentials
  | FacebookMessengerCredentials
  | EmailCredentials
  | TwilioSmsCredentials;

// ---------------------------------------------------------------------------
// Outbound — sendMessage
// ---------------------------------------------------------------------------

export interface SendMessageInput {
  channel: MessagingChannel;
  /** Platform-specific recipient ID. WhatsApp = phone E.164; Telegram =
   *  chat ID; Instagram = IGSID; Messenger = PSID; email = address. */
  recipientExternalId: string;
  contentType: MessageContentType;
  text?: string;
  /** Public URL to fetch media from (channels download server-side). */
  mediaUrl?: string;
  /** WhatsApp Business pre-approved template name. */
  templateName?: string;
  /** Variable substitution map for templates. */
  templateVariables?: Record<string, string>;
  /** Platform-specific reply-to ID (WhatsApp message_id, Telegram message_id). */
  replyToExternalId?: string;
  /** Email-only — subject line. */
  subject?: string;
}

export interface SendMessageResult {
  success: boolean;
  /** Platform's message ID — caller persists for idempotency on echo. */
  externalMessageId?: string;
  error?: string;
  /** Per-message cost (Telegram = 0; WhatsApp = ~$0.005-0.10; varies). */
  costMinor?: bigint;
  costCurrency?: string;
}

// ---------------------------------------------------------------------------
// Inbound — message ingested from webhook or polling
// ---------------------------------------------------------------------------

export interface IncomingMessage {
  channel: MessagingChannel;
  /** Platform's message ID — used for the channel × external_message_id
   *  unique constraint that gives us idempotent ingestion. */
  externalMessageId: string;
  /** Platform's thread/conversation ID (for grouping). */
  externalThreadId: string;
  senderExternalId: string;
  senderDisplayName?: string;
  contentType: MessageContentType;
  contentText?: string;
  contentMediaUrl?: string;
  contentMediaThumbnailUrl?: string;
  contentMetadata?: Record<string, unknown>;
  replyToExternalId?: string;
  receivedAt: Date;
  /** Source-of-truth raw payload from the channel — opaque blob. */
  rawPayload: Record<string, unknown>;
}

export interface PullRecentMessagesInput {
  /** Only fetch messages received since this point. */
  since: Date;
  limit?: number;
}

// ---------------------------------------------------------------------------
// Connection test
// ---------------------------------------------------------------------------

export interface ConnectionTestResult {
  connected: boolean;
  /** Channel-specific diagnostic data (bot username, hotel ID echo,
   *  HTTP status). UI shows a curated subset. */
  details: Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// The interface every channel implements
// ---------------------------------------------------------------------------

export interface MessagingProvider {
  readonly channel: MessagingChannel;

  /** Send a single outbound message. */
  sendMessage(input: SendMessageInput): Promise<SendMessageResult>;

  /** Optional — only for channels that support polling (Gmail, some
   *  legacy channels). Webhook-first channels can omit this. */
  pullRecentMessages?(
    input: PullRecentMessagesInput,
  ): Promise<IncomingMessage[]>;

  /** Verify HMAC / shared-secret signature on an incoming webhook. */
  verifyWebhook(payload: string, signature: string, secret: string): boolean;

  /** Parse a verified payload into 0+ normalized messages.
   *  Returns null when the payload type is unknown to this provider. */
  parseWebhook(payload: Record<string, unknown>): IncomingMessage[] | null;

  /** Lightweight ping for the Connect modal. */
  testConnection(): Promise<ConnectionTestResult>;
}
