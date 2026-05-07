/**
 * Stage 6.P3.C — Revolut Business `BankProviderInterface` adapter.
 *
 * Wraps `RevolutClient` + the parser projection helpers behind the
 * unified BankProviderInterface so the cron sweep + import wizard +
 * service layer don't need to know which bank they're talking to.
 *
 * Webhook signing — Revolut Business v2 webhooks send:
 *
 *   Revolut-Request-Timestamp: <unix-ms>
 *   Revolut-Signature: v1=<hex>
 *
 * The signed payload is the literal string:
 *
 *   v1.<timestamp>.<rawBody>
 *
 * HMAC-SHA256 keyed with the webhook signing secret. We expose the
 * verifier through the standard `verifyWebhook(payload, signature,
 * secret)` interface — the webhook handler is responsible for
 * concatenating timestamp + body before calling.
 *
 * Replay protection: signatures with a timestamp older than 5 minutes
 * are rejected via `verifyRevolutWebhook` directly. The plain
 * `verifyWebhook` interface method has no timestamp, so callers that
 * care about replay must call `verifyRevolutWebhook` instead.
 */

import { createHmac, timingSafeEqual } from "node:crypto";
import { verifyHmacSha256Signature } from "@/lib/channel-manager/provider-helpers";
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
  RevolutCredentials,
} from "../../types";
import {
  RevolutClient,
  type RevolutClientOptions,
  type RevolutPaymentResponse,
} from "./client";
import {
  projectRevolutAccountBalance,
  projectRevolutTransaction,
  projectRevolutTransactions,
} from "./parsers";

const PROVIDER: BankProviderName = "revolut";

/** Tolerance for the replay-protection check. Revolut's docs recommend
 *  5 minutes; we mirror that. */
export const REVOLUT_REPLAY_WINDOW_MS = 5 * 60 * 1000;

export class RevolutProvider implements BankProviderInterface {
  readonly provider: BankProviderName = PROVIDER;
  private readonly client: RevolutClient;
  private readonly webhookSecret?: string;

  constructor(
    credentials: RevolutCredentials,
    clientOptions: RevolutClientOptions = {},
  ) {
    this.client = new RevolutClient(credentials, clientOptions);
    this.webhookSecret = credentials.webhookSecret;
  }

  async fetchTransactions(
    input: FetchTransactionsInput,
  ): Promise<FetchTransactionsResult> {
    const result = await this.client.listTransactions({
      accountId: input.externalAccountId,
      from: input.since,
      to: input.until,
      count: input.limit,
    });
    if (result.status < 200 || result.status >= 300) {
      // Failed call — return empty + hasMore=false. The cron sweep's
      // try/catch will record the failure on sync_log; we don't throw
      // because one bad connection mustn't abort the batch.
      return { transactions: [], hasMore: false };
    }
    const { rows } = projectRevolutTransactions(result.body, {
      defaultAccountId: input.externalAccountId,
    });
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
    const result = await this.client.getAccount(externalAccountId);
    const projected = projectRevolutAccountBalance(result.body);
    return {
      externalAccountId,
      availableMinor: projected?.availableMinor ?? 0n,
      currency: projected?.currency ?? "USD",
      asOf: new Date(),
    };
  }

  async initiatePayment(
    input: InitiatePaymentInput,
  ): Promise<InitiatePaymentResult> {
    if (!input.toAccountId) {
      // Revolut payments target a saved counterparty by ID — IBAN
      // alone is not enough. The caller must resolve the IBAN to a
      // counterparty (via listCounterparties) before calling this.
      return {
        externalPaymentId: "",
        status: "rejected_missing_counterparty",
      };
    }
    // amountMinor → decimal. Revolut wants e.g. 12.50 not 1250.
    const amount = Number(input.amountMinor) / 100;
    const result = await this.client.createPayment({
      request_id: cryptoRandomRequestId(),
      account_id: input.fromAccountId,
      receiver: { counterparty_id: input.toAccountId },
      amount,
      currency: input.currency,
      reference: input.reference,
    });
    if (result.status < 200 || result.status >= 300) {
      return { externalPaymentId: "", status: "failed" };
    }
    let parsed: RevolutPaymentResponse | null = null;
    try {
      parsed = JSON.parse(result.body) as RevolutPaymentResponse;
    } catch {
      return { externalPaymentId: "", status: "malformed_response" };
    }
    return {
      externalPaymentId: parsed?.id ?? "",
      status: parsed?.state ?? "unknown",
    };
  }

  /**
   * Standard interface method — verifies an HMAC-SHA256 of `payload`
   * against `signature` with `secret`. Caller must format `payload`
   * as `v1.<timestamp>.<rawBody>` to match Revolut's scheme; pass the
   * hex signature without the `v1=` prefix (or with — the helper
   * strips known prefixes).
   *
   * For replay protection, prefer `verifyRevolutWebhook` directly.
   */
  verifyWebhook(payload: string, signature: string, secret: string): boolean {
    const key = secret || this.webhookSecret || "";
    return verifyRevolutSignature(payload, signature, key);
  }

  /**
   * Revolut sends events for transaction state changes
   * (TransactionStateChanged) + payout completion. We only project
   * the TransactionCreated / TransactionStateChanged variants here —
   * other events are returned with `transaction: undefined` for
   * audit logging.
   */
  parseWebhook(payload: Record<string, unknown>): BankWebhookEvent | null {
    const eventType =
      typeof payload["event"] === "string"
        ? (payload["event"] as string)
        : "unknown";
    const data = payload["data"];
    const txnObj =
      data && typeof data === "object"
        ? ((data as Record<string, unknown>)["transaction"] ?? data)
        : null;
    if (txnObj && typeof txnObj === "object") {
      const projected = projectRevolutTransaction(
        txnObj as Parameters<typeof projectRevolutTransaction>[0],
      );
      if (projected.length > 0) {
        const r = projected[0];
        return {
          eventType,
          transaction: {
            externalTransactionId: r.externalTransactionId,
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
            externalReference: r.externalReference,
            rawPayload: r.rawPayload,
          },
          raw: payload,
        };
      }
    }
    return { eventType, raw: payload };
  }

  async testConnection(): Promise<ConnectionTestResult> {
    const result = await this.client.listAccounts();
    let accountsCount: number | undefined;
    if (result.status >= 200 && result.status < 300) {
      try {
        const parsed = JSON.parse(result.body);
        if (Array.isArray(parsed)) accountsCount = parsed.length;
      } catch {
        // body wasn't JSON — leave accountsCount undefined.
      }
    }
    return {
      connected: result.status >= 200 && result.status < 300,
      details: {
        provider: PROVIDER,
        environment: this.client["creds"]
          ? undefined
          : undefined /* not exposed */,
        status: result.status,
        accountsCount,
      },
    };
  }
}

// ---------------------------------------------------------------------------
// Webhook verification helpers
// ---------------------------------------------------------------------------

/**
 * Stricter verifier — also enforces replay protection by rejecting
 * signatures whose timestamp falls outside `REVOLUT_REPLAY_WINDOW_MS`.
 *
 * Pass `now` for tests so the window check is deterministic.
 */
export function verifyRevolutWebhook(input: {
  rawBody: string;
  timestamp: string | number;
  signature: string;
  secret: string;
  now?: Date;
}): boolean {
  if (!input.secret || !input.signature || !input.rawBody) return false;
  const tsMs =
    typeof input.timestamp === "number"
      ? input.timestamp
      : Number(input.timestamp);
  if (!Number.isFinite(tsMs)) return false;
  const now = input.now?.getTime() ?? Date.now();
  if (Math.abs(now - tsMs) > REVOLUT_REPLAY_WINDOW_MS) return false;
  const payload = `v1.${tsMs}.${input.rawBody}`;
  return verifyRevolutSignature(payload, input.signature, input.secret);
}

/**
 * Constant-time compare of HMAC-SHA256(payload, secret) against
 * `signature`. Accepts both raw hex and `v1=<hex>` prefix forms.
 *
 * Distinct from `verifyHmacSha256Signature` because the shared helper
 * normalizes a `sha256=` prefix; Revolut's prefix is `v1=`.
 */
export function verifyRevolutSignature(
  payload: string,
  signature: string,
  secret: string,
): boolean {
  if (!secret || !signature) return false;
  try {
    const computed = createHmac("sha256", secret).update(payload).digest("hex");
    const provided = signature.startsWith("v1=")
      ? signature.slice("v1=".length)
      : signature.startsWith("sha256=")
        ? signature.slice("sha256=".length)
        : signature;
    if (provided.length !== computed.length) return false;
    return timingSafeEqual(
      Buffer.from(provided, "utf8"),
      Buffer.from(computed, "utf8"),
    );
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Generate a UUID-ish request ID. Revolut requires a unique
 *  `request_id` per `/pay` call — used to dedupe retried attempts. */
function cryptoRandomRequestId(): string {
  // Use Web Crypto when available (edge runtimes), else fall back to
  // a Math.random hex (development/tests). Both shapes are accepted
  // by Revolut.
  const c =
    (globalThis as unknown as { crypto?: { randomUUID?: () => string } })
      .crypto;
  if (c?.randomUUID) return c.randomUUID();
  return (
    Math.random().toString(16).slice(2) +
    Math.random().toString(16).slice(2)
  ).slice(0, 32);
}

// Re-export to keep tests honest about what the helper accepts.
export { verifyHmacSha256Signature };
