import type {
  ConnectionTestResult,
  IncomingMessage,
  MessagingChannel,
  MessagingProvider,
  PullRecentMessagesInput,
  SendMessageInput,
  SendMessageResult,
} from "../types";

/**
 * Stage 6.P2.A — DryRun messaging provider.
 *
 * Returned by `selectMessagingProvider` whenever credentials are
 * absent. Acts as the safe default: every send reports success with
 * `costMinor: 0n` (no cost-dashboard pollution), every pull returns
 * an empty list, every webhook verification fails closed (no shared
 * secret to verify against).
 *
 * This is NOT a stub — it's an explicit "channel is not connected"
 * mode. The platform runs end-to-end without any real credentials.
 */
export class DryRunMessagingProvider implements MessagingProvider {
  constructor(public readonly channel: MessagingChannel) {}

  async sendMessage(_input: SendMessageInput): Promise<SendMessageResult> {
    void _input;
    // Fake but plausibly-shaped external message ID so callers exercising
    // the success path get back something they can persist for idempotency.
    return {
      success: true,
      externalMessageId: `dry-run-${this.channel}-${Date.now()}`,
      costMinor: 0n,
      costCurrency: this.channel === "telegram" ? "USD" : undefined,
    };
  }

  async pullRecentMessages(
    _input: PullRecentMessagesInput,
  ): Promise<IncomingMessage[]> {
    return [];
  }

  /**
   * Always false: with no shared secret we cannot meaningfully verify
   * a signature. Webhook routes should refuse to process anything from
   * a DryRun connection anyway — they read connection.credentials up
   * front and bail before reaching here.
   */
  verifyWebhook(_payload: string, _signature: string, _secret: string): boolean {
    return false;
  }

  parseWebhook(_payload: Record<string, unknown>): IncomingMessage[] | null {
    return null;
  }

  async testConnection(): Promise<ConnectionTestResult> {
    return {
      connected: false,
      details: {
        mode: "dry-run",
        reason: "No credentials configured",
        channel: this.channel,
      },
    };
  }
}
