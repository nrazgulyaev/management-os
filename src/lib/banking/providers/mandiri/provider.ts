/**
 * Stage 6.P3.E — Bank Mandiri (Indonesia) provider.
 *
 * Mandiri Corporate API access requires a partnership agreement
 * (B2B) and a multi-week onboarding process. For the platform's
 * MVP path we ship the manual-import provider:
 *   - `fetchTransactions`: returns empty + a `requiresManualImport`
 *     hint so the cron sweep doesn't fail.
 *   - `fetchBalance`: returns last known balance from the connection
 *     (caller fills in from imports — placeholder zero here).
 *   - `parseWebhook`: returns null (Mandiri doesn't push webhooks).
 *   - `verifyWebhook`: fail-closed.
 *
 * The real value-add is the bundled CSV import templates in
 * `src/lib/banking/templates/mandiri-csv.ts` — operators upload an
 * Internet-Banking CSV export, the wizard auto-applies the template,
 * preview + commit goes through `BankingService.executeStatementImport`.
 *
 * If/when Mandiri Corporate API access lands, swap the read methods
 * to real HTTP calls without changing the interface.
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
  MandiriCredentials,
} from "../../types";

const PROVIDER: BankProviderName = "mandiri";

export class MandiriProvider implements BankProviderInterface {
  readonly provider: BankProviderName = PROVIDER;
  private readonly creds: MandiriCredentials;

  constructor(credentials: MandiriCredentials) {
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
    return {
      externalPaymentId: "",
      status: "manual_required",
    };
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
          "Mandiri Corporate API not enabled — use the manual CSV import flow at /development-os/finance/statement-import.",
      },
    };
  }
}

function redactAccountNumber(n: string): string {
  if (!n) return "";
  if (n.length <= 4) return "*".repeat(n.length);
  return "*".repeat(n.length - 4) + n.slice(-4);
}
