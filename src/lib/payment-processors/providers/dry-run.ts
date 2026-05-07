/**
 * Stage 6.P3.A — DryRun payment provider.
 *
 * Default fallback when no credentials are configured. Mirrors the
 * Stage 3.A AI-provider / Stage 6.P1.A channel-manager / Stage 6.P2.A
 * messaging / Stage 6.P3.A bank dry-run pattern.
 *
 * Semantics:
 *   - createPaymentIntent → returns a synthetic intent with status
 *     "dry_run". No real charge is made.
 *   - verifyWebhook fail-closes (returns false). DryRun is the wrong
 *     surface to be receiving real-money webhooks against.
 *   - refund / cancel succeed without side effects.
 */

import type {
  ConnectionTestResult,
  CreatePaymentIntentInput,
  PaymentIntent,
  PaymentProviderInterface,
  PaymentProviderName,
  RefundInput,
  RefundResult,
} from "../types";

export class DryRunPaymentProvider implements PaymentProviderInterface {
  readonly provider: PaymentProviderName;

  constructor(provider: PaymentProviderName) {
    this.provider = provider;
  }

  async createPaymentIntent(
    input: CreatePaymentIntentInput,
  ): Promise<PaymentIntent> {
    const externalIntentId = `dryrun_${this.provider}_${Date.now()}_${Math.floor(Math.random() * 1_000_000)}`;
    return {
      externalIntentId,
      status: "dry_run",
      amountMinor: input.amountMinor,
      currency: input.currency,
      rawPayload: {
        provider: this.provider,
        mode: "dry_run",
        purpose: input.purpose,
        amountMinor: input.amountMinor.toString(),
        currency: input.currency,
        description: input.description,
      },
    };
  }

  async retrievePaymentIntent(
    externalIntentId: string,
  ): Promise<PaymentIntent> {
    return {
      externalIntentId,
      status: "dry_run",
      amountMinor: 0n,
      currency: "USD",
      rawPayload: { provider: this.provider, mode: "dry_run" },
    };
  }

  async cancelPaymentIntent(
    _externalIntentId: string,
  ): Promise<{ success: boolean }> {
    return { success: true };
  }

  async refund(input: RefundInput): Promise<RefundResult> {
    return {
      externalRefundId: `dryrun_refund_${this.provider}_${Date.now()}`,
      status: "dry_run",
    };
  }

  /** Fail-closed by default. DryRun providers MUST NOT silently accept
   *  signed webhook payloads — that would mask misconfigurations on a
   *  financially-sensitive surface. */
  verifyWebhook(
    _payload: string,
    _signature: string,
    _secret: string,
  ): boolean {
    return false;
  }

  parseWebhook(_payload: Record<string, unknown>) {
    return null;
  }

  async testConnection(): Promise<ConnectionTestResult> {
    return {
      connected: true,
      details: {
        provider: this.provider,
        mode: "dry_run",
        note: "DryRun provider — no real payment API calls. Configure credentials to go live.",
      },
    };
  }
}
