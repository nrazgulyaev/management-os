/**
 * Stage 6.P3.E — Bank Central Asia (BCA / KlikBCA Bisnis) provider.
 *
 * Same shape as Mandiri — manual-import primary, partner API
 * deferred. BCA's KlikBCA Bisnis API requires a partnership +
 * Indonesian-bank API onboarding window of 4–8 weeks.
 *
 * The bundled CSV import template (`bca-csv.ts`) handles the
 * KlikBCA Bisnis statement export format. PDF support comes via the
 * `bca_v1` template registered in P3.B's pdf-parser.
 */

import type {
  BankBalance,
  BankProviderInterface,
  BankProviderName,
  BankWebhookEvent,
  ConnectionTestResult,
  FetchTransactionsInput,
  FetchTransactionsResult,
  InitiatePaymentInput,
  InitiatePaymentResult,
  BcaCredentials,
} from "../../types";

const PROVIDER: BankProviderName = "bca";

export class BCAProvider implements BankProviderInterface {
  readonly provider: BankProviderName = PROVIDER;
  private readonly creds: BcaCredentials;

  constructor(credentials: BcaCredentials) {
    this.creds = credentials;
  }

  async fetchTransactions(
    _input: FetchTransactionsInput,
  ): Promise<FetchTransactionsResult> {
    return { transactions: [], hasMore: false };
  }

  async fetchBalance(externalAccountId: string): Promise<BankBalance> {
    return {
      externalAccountId,
      availableMinor: 0n,
      currency: "IDR",
      asOf: new Date(),
    };
  }

  async initiatePayment(
    _input: InitiatePaymentInput,
  ): Promise<InitiatePaymentResult> {
    return { externalPaymentId: "", status: "manual_required" };
  }

  verifyWebhook(): boolean {
    return false;
  }

  parseWebhook(_payload: Record<string, unknown>): BankWebhookEvent | null {
    return null;
  }

  async testConnection(): Promise<ConnectionTestResult> {
    return {
      connected: true,
      details: {
        provider: PROVIDER,
        mode: "manual_import_only",
        accountNumber: redactAccountNumber(this.creds.accountNumber),
        partnerApiConfigured: !!this.creds.partnerApiToken,
        note:
          "BCA KlikBCA Bisnis API not enabled — use the manual CSV/PDF import flow at /development-os/finance/statement-import.",
      },
    };
  }
}

function redactAccountNumber(n: string): string {
  if (!n) return "";
  if (n.length <= 4) return "*".repeat(n.length);
  return "*".repeat(n.length - 4) + n.slice(-4);
}
