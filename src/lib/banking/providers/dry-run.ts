/**
 * Stage 6.P3.A — DryRun bank provider.
 *
 * Default fallback when no credentials are configured. Returns
 * empty/successful responses without making any network calls. Mirrors
 * the Stage 3.A AI-provider / Stage 6.P1.A channel-manager / Stage
 * 6.P2.A messaging dry-run pattern.
 *
 * The dry-run is intentionally a NO-OP — every method succeeds, every
 * collection comes back empty. This lets the platform run end-to-end
 * (including cron jobs + reconciliation) before any real bank
 * credentials are wired in.
 */

import type {
  BankBalance,
  BankProviderInterface,
  BankProviderName,
  ConnectionTestResult,
  FetchTransactionsInput,
  FetchTransactionsResult,
  InitiatePaymentInput,
  InitiatePaymentResult,
} from "../types";

export class DryRunBankProvider implements BankProviderInterface {
  readonly provider: BankProviderName;

  constructor(provider: BankProviderName) {
    this.provider = provider;
  }

  async fetchTransactions(
    _input: FetchTransactionsInput,
  ): Promise<FetchTransactionsResult> {
    return {
      transactions: [],
      hasMore: false,
    };
  }

  async fetchBalance(externalAccountId: string): Promise<BankBalance> {
    return {
      externalAccountId,
      availableMinor: 0n,
      currency: "USD",
      asOf: new Date(),
    };
  }

  async initiatePayment(
    _input: InitiatePaymentInput,
  ): Promise<InitiatePaymentResult> {
    return {
      externalPaymentId: `dryrun-${this.provider}-${Date.now()}`,
      status: "dry_run",
    };
  }

  /** Fail-closed by default. No real signature can validate against a
   *  DryRun provider, and we don't want a misconfigured connection to
   *  silently accept every webhook. */
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
        note: "DryRun provider — no real bank API calls. Configure credentials to go live.",
      },
    };
  }
}
