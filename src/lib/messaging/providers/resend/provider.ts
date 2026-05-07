/**
 * Stage 6.P2.F — Resend transactional MessagingProvider adapter.
 *
 * Resend is the existing Stage 3.D transactional sender — operators
 * use it for booking confirmations, reset emails, etc. This adapter
 * wraps Resend's HTTP API in the unified `MessagingProvider` interface
 * so it shows up alongside Gmail OAuth in the operator UI.
 *
 * Resend's surface:
 *   - One direction: outbound only. No webhook for inbound (operators
 *     route inbound to Gmail OAuth or a separate inbox provider).
 *   - Status callbacks come via webhook with HMAC-SHA256 signature in
 *     the `Svix-Signature` header.
 *   - JSON throughout. Native fetch + shared retry envelope.
 */

import { requestWithRetry, type RetryOptions } from "@/lib/channel-manager/http-retry";
import { verifyHmacSha256Signature } from "@/lib/channel-manager/provider-helpers";
import type {
  ConnectionTestResult,
  IncomingMessage,
  MessagingChannel,
  MessagingProvider,
  SendMessageInput,
  SendMessageResult,
} from "../../types";

const RESEND_API_BASE = "https://api.resend.com";
const CHANNEL: MessagingChannel = "email";

export interface ResendCredentials {
  channel: "email";
  provider: "resend";
  apiKey: string;
  fromAddress: string;
}

export interface ResendOptions extends RetryOptions {
  apiBase?: string;
}

export class ResendProvider implements MessagingProvider {
  readonly channel: MessagingChannel = CHANNEL;
  private readonly apiBase: string;
  private readonly retryOpts: RetryOptions;

  constructor(
    private readonly creds: ResendCredentials,
    opts: ResendOptions = {},
  ) {
    this.apiBase = opts.apiBase ?? RESEND_API_BASE;
    this.retryOpts = {
      fetch: opts.fetch,
      timeoutMs: opts.timeoutMs,
      maxRetries: opts.maxRetries,
      backoffBaseMs: opts.backoffBaseMs,
    };
  }

  /** Public for tests — never logged. */
  get authHeader(): string {
    return `Bearer ${this.creds.apiKey}`;
  }

  async sendMessage(input: SendMessageInput): Promise<SendMessageResult> {
    if (input.channel !== "email") {
      return {
        success: false,
        error: `ResendProvider received non-email input (${input.channel})`,
      };
    }
    if (!input.recipientExternalId) {
      return { success: false, error: "recipientExternalId required" };
    }
    if (!input.text) {
      return { success: false, error: "text required for email" };
    }
    const isHtml = /<\/?[a-z][^>]*>/i.test(input.text);
    const body: Record<string, unknown> = {
      from: this.creds.fromAddress,
      to: [input.recipientExternalId],
      subject: input.subject ?? "(no subject)",
    };
    if (isHtml) body.html = input.text;
    else body.text = input.text;

    try {
      const result = await requestWithRetry(
        `${this.apiBase}/emails`,
        {
          method: "POST",
          headers: {
            Authorization: this.authHeader,
            "Content-Type": "application/json",
            Accept: "application/json",
          },
          body: JSON.stringify(body),
        },
        this.retryOpts,
      );
      if (result.status >= 200 && result.status < 300) {
        let externalMessageId: string | undefined;
        try {
          const parsed = JSON.parse(result.body) as Record<string, unknown>;
          if (typeof parsed["id"] === "string") {
            externalMessageId = parsed["id"];
          }
        } catch {
          // body wasn't JSON — leave id undefined.
        }
        return { success: true, externalMessageId };
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

  /** Resend webhook signature: HMAC-SHA256 via Svix. */
  verifyWebhook(payload: string, signature: string, secret: string): boolean {
    return verifyHmacSha256Signature(payload, signature, secret);
  }

  /**
   * Resend webhooks deliver status callbacks (delivered, bounced,
   * complained, opened, clicked) — not new inbound messages. Return
   * null so the unified handler treats them as receipts; the service
   * layer surfaces them to channel_sync_log.
   */
  parseWebhook(_payload: Record<string, unknown>): IncomingMessage[] | null {
    return null;
  }

  async testConnection(): Promise<ConnectionTestResult> {
    // Resend exposes /domains as a low-cost auth ping.
    try {
      const result = await requestWithRetry(
        `${this.apiBase}/domains`,
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
          provider: "resend",
          status: result.status,
          fromAddress: this.creds.fromAddress,
        },
      };
    } catch (err) {
      return {
        connected: false,
        details: {
          channel: CHANNEL,
          provider: "resend",
          error: err instanceof Error ? err.message : String(err),
        },
      };
    }
  }
}

function truncate(s: string, max: number): string {
  return s.length <= max ? s : s.slice(0, max) + "…";
}
