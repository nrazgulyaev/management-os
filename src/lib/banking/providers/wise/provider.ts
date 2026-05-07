/**
 * Stage 6.P3.D — Wise (TransferWise) `BankProviderInterface` adapter.
 *
 * Webhook signing — Wise webhooks send:
 *
 *   X-Signature-SHA256: <base64>
 *   X-Delivery-Id:      <uuid>
 *
 * The signature is RSA-SHA256 of the raw body, signed with Wise's
 * private key (the public key is published per environment). For
 * MVP we ship a fail-closed verifier — the public-key fetch + verify
 * is documented but not bundled, so the cron poll path is the
 * primary inbound channel until P3.G's webhook handler ships the
 * key plumbing.
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
  WiseCredentials,
} from "../../types";
import { WiseClient, type WiseClientOptions } from "./client";
import {
  projectWiseBalance,
  projectWiseStatement,
} from "./parsers";

const PROVIDER: BankProviderName = "wise";

export class WiseProvider implements BankProviderInterface {
  readonly provider: BankProviderName = PROVIDER;
  private readonly client: WiseClient;
  private readonly creds: WiseCredentials;

  constructor(credentials: WiseCredentials, clientOptions: WiseClientOptions = {}) {
    this.client = new WiseClient(credentials, clientOptions);
    this.creds = credentials;
  }

  async fetchTransactions(
    input: FetchTransactionsInput,
  ): Promise<FetchTransactionsResult> {
    const result = await this.client.listStatements({
      balanceId: input.externalAccountId,
      from: input.since,
      to: input.until ?? new Date(),
    });
    if (result.status < 200 || result.status >= 300) {
      return { transactions: [], hasMore: false };
    }
    const { rows } = projectWiseStatement(result.body);
    return {
      transactions: rows.map((r) => ({
        externalTransactionId: r.externalTransactionId,
        externalReference: r.externalReference,
        transactionDate: r.transactionDate,
        valueDate: r.valueDate,
        amountMinor: r.amountMinor,
        currency: r.currency,
        originalAmountMinor: r.originalAmountMinor,
        originalCurrency: r.originalCurrency,
        fxRate: r.fxRate,
        description: r.description ?? "",
        counterpartyName: r.counterpartyName,
        counterpartyAccount: r.counterpartyAccount,
        counterpartyCountry: r.counterpartyCountry,
        isPending: r.isPending,
        rawPayload: r.rawPayload,
      })),
      hasMore: false,
    };
  }

  async fetchBalance(externalAccountId: string): Promise<BankBalance> {
    const result = await this.client.listBalances();
    // The connection knows its currency via the bank_connections row;
    // we infer from the stored balanceId by listing balances and
    // picking the matching numeric ID.
    let currency = "USD";
    let availableMinor = 0n;
    let ledgerMinor: bigint | undefined;
    if (result.status >= 200 && result.status < 300) {
      try {
        const parsed = JSON.parse(result.body) as Array<{
          id: number;
          currency: string;
          amount?: { value: number };
          cashAmount?: { value: number };
        }>;
        const match = parsed.find(
          (b) => String(b.id) === String(externalAccountId),
        );
        if (match) {
          const projected = projectWiseBalance(result.body, match.currency);
          if (projected) {
            currency = projected.currency;
            availableMinor = projected.availableMinor;
            ledgerMinor = projected.ledgerMinor;
          } else {
            currency = match.currency;
          }
        }
      } catch {
        // body wasn't JSON; fall through with zero balance.
      }
    }
    return {
      externalAccountId,
      availableMinor,
      ledgerMinor,
      currency,
      asOf: new Date(),
    };
  }

  /**
   * Wise transfers require a 2-step flow: createQuote → createTransfer.
   * `toAccountId` carries the saved-recipient ID from Wise.
   */
  async initiatePayment(
    input: InitiatePaymentInput,
  ): Promise<InitiatePaymentResult> {
    if (!input.toAccountId) {
      return {
        externalPaymentId: "",
        status: "rejected_missing_recipient",
      };
    }
    const sourceAmount = Number(input.amountMinor) / 100;
    const quote = await this.client.createQuote({
      sourceCurrency: input.currency,
      targetCurrency: input.currency,
      sourceAmount,
    });
    if (quote.status < 200 || quote.status >= 300) {
      return { externalPaymentId: "", status: "quote_failed" };
    }
    let quoteUuid: string | undefined;
    try {
      const parsed = JSON.parse(quote.body) as { id?: string };
      quoteUuid = parsed.id;
    } catch {
      // fall through
    }
    if (!quoteUuid) return { externalPaymentId: "", status: "quote_malformed" };

    const transfer = await this.client.createTransfer({
      targetAccount: Number(input.toAccountId),
      quoteUuid,
      customerTransactionId: cryptoRandomRequestId(),
      details: { reference: input.reference },
    });
    if (transfer.status < 200 || transfer.status >= 300) {
      return { externalPaymentId: "", status: "transfer_failed" };
    }
    let transferId: string | undefined;
    let state: string | undefined;
    try {
      const parsed = JSON.parse(transfer.body) as {
        id?: number | string;
        status?: string;
      };
      transferId = parsed.id != null ? String(parsed.id) : undefined;
      state = parsed.status;
    } catch {
      // fall through
    }
    return {
      externalPaymentId: transferId ?? "",
      status: state ?? "unknown",
    };
  }

  /**
   * Fail-closed by default. Wise's RSA-SHA256 verifier needs the
   * environment-specific public key (published as a static PEM); the
   * webhook handler at `/api/webhooks/banking/wise/route.ts` ships
   * with the key plumbing wired in P3.G.
   */
  verifyWebhook(
    _payload: string,
    _signature: string,
    _secret: string,
  ): boolean {
    return false;
  }

  parseWebhook(payload: Record<string, unknown>): BankWebhookEvent | null {
    const eventType =
      typeof payload["event_type"] === "string"
        ? (payload["event_type"] as string)
        : typeof payload["eventType"] === "string"
          ? (payload["eventType"] as string)
          : "unknown";
    return { eventType, raw: payload };
  }

  async testConnection(): Promise<ConnectionTestResult> {
    const result = await this.client.listBalances();
    let balanceCount: number | undefined;
    if (result.status >= 200 && result.status < 300) {
      try {
        const parsed = JSON.parse(result.body);
        if (Array.isArray(parsed)) balanceCount = parsed.length;
      } catch {
        // ignored
      }
    }
    return {
      connected: result.status >= 200 && result.status < 300,
      details: {
        provider: PROVIDER,
        environment: this.creds.environment,
        status: result.status,
        balanceCount,
      },
    };
  }
}

function cryptoRandomRequestId(): string {
  const c = (globalThis as unknown as { crypto?: { randomUUID?: () => string } })
    .crypto;
  if (c?.randomUUID) return c.randomUUID();
  return (
    Math.random().toString(16).slice(2) +
    Math.random().toString(16).slice(2)
  ).slice(0, 32);
}
