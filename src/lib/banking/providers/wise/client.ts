/**
 * Stage 6.P3.D — Wise (TransferWise) API client.
 *
 * Wise's Business API splits state across "profiles" (the legal entity)
 * and "balances" (per-currency wallets under a profile). Statements
 * are pulled per-balance with an interval window.
 *
 * Endpoints used:
 *   - GET  /v4/profiles/{profileId}/balances?types=STANDARD
 *   - GET  /v1/profiles/{profileId}/balance-statements/{balanceId}/statement.json
 *           ?intervalStart=&intervalEnd=&type=COMPACT
 *   - POST /v3/profiles/{profileId}/transfers (created via quote)
 *   - POST /v2/quotes — required precursor to a transfer
 *
 * Auth: Bearer token (`api_token` from Wise's "API tokens" page).
 * Sandbox host: api.sandbox.transferwise.tech ; production:
 * api.wise.com.
 */

import {
  requestWithRetry,
  type RetryOptions,
} from "@/lib/channel-manager/http-retry";
import type { WiseCredentials } from "../../types";

const HOSTS = {
  sandbox: "https://api.sandbox.transferwise.tech",
  production: "https://api.wise.com",
} as const;

export interface WiseClientOptions extends RetryOptions {
  apiBase?: string;
}

// ---------------------------------------------------------------------------
// API response types — kept untyped at the boundary, projected in parsers.ts
// ---------------------------------------------------------------------------

export interface WiseBalance {
  id: number;
  currency: string;
  amount?: { value: number; currency: string };
  reservedAmount?: { value: number; currency: string };
  cashAmount?: { value: number; currency: string };
  type?: string;
  name?: string;
  visible?: boolean;
}

export interface WiseStatementRow {
  type: string;
  date: string;
  amount: { value: number; currency: string };
  totalFees?: { value: number; currency: string };
  details: {
    type?: string;
    description?: string;
    senderName?: string;
    senderAccount?: string;
    paymentReference?: string;
    sourceAmount?: { value: number; currency: string };
    targetAmount?: { value: number; currency: string };
    sourceFeeAmount?: { value: number; currency: string };
    rate?: number;
    note?: string;
    [k: string]: unknown;
  };
  exchangeDetails?: {
    fromAmount?: { value: number; currency: string };
    toAmount?: { value: number; currency: string };
    rate?: number;
  };
  runningBalance?: { value: number; currency: string };
  referenceNumber?: string;
}

export interface WiseStatementResponse {
  accountHolder?: { type?: string; address?: Record<string, string> };
  query?: {
    intervalStart?: string;
    intervalEnd?: string;
    timezone?: string;
  };
  transactions: WiseStatementRow[];
  startOfStatementBalance?: { value: number; currency: string };
  endOfStatementBalance?: { value: number; currency: string };
}

// ---------------------------------------------------------------------------
// Client
// ---------------------------------------------------------------------------

export class WiseClient {
  private readonly apiBase: string;
  private readonly retryOpts: RetryOptions;

  constructor(
    private readonly creds: WiseCredentials,
    opts: WiseClientOptions = {},
  ) {
    this.apiBase = opts.apiBase ?? HOSTS[creds.environment];
    this.retryOpts = {
      fetch: opts.fetch,
      timeoutMs: opts.timeoutMs,
      maxRetries: opts.maxRetries,
      backoffBaseMs: opts.backoffBaseMs,
    };
  }

  private get authHeader(): string {
    return `Bearer ${this.creds.apiToken}`;
  }

  async listBalances() {
    const url = `${this.apiBase}/v4/profiles/${encodeURIComponent(
      this.creds.profileId,
    )}/balances?types=STANDARD`;
    return this.get(url);
  }

  /**
   * Pull a balance statement for the given window. Wise caps the
   * window at 469 days; callers should chunk if pulling history.
   */
  async listStatements(input: {
    balanceId: string | number;
    from: Date;
    to: Date;
    /** "COMPACT" (transactions only, default) or "FLAT" (one row per leg). */
    statementType?: "COMPACT" | "FLAT";
  }) {
    const url = new URL(
      `${this.apiBase}/v1/profiles/${encodeURIComponent(
        this.creds.profileId,
      )}/balance-statements/${encodeURIComponent(String(input.balanceId))}/statement.json`,
    );
    url.searchParams.set("intervalStart", input.from.toISOString());
    url.searchParams.set("intervalEnd", input.to.toISOString());
    url.searchParams.set("type", input.statementType ?? "COMPACT");
    return this.get(url.toString());
  }

  async createQuote(input: {
    sourceCurrency: string;
    targetCurrency: string;
    /** One of `sourceAmount` / `targetAmount` is required. */
    sourceAmount?: number;
    targetAmount?: number;
    payOut?: string;
  }) {
    return this.post(
      `${this.apiBase}/v2/quotes`,
      {
        ...input,
        profile: Number(this.creds.profileId),
      },
    );
  }

  async createTransfer(input: {
    /** Recipient ID from Wise's saved beneficiaries. */
    targetAccount: number;
    /** Quote UUID returned by `createQuote`. */
    quoteUuid: string;
    /** Idempotency key. */
    customerTransactionId: string;
    details: {
      reference: string;
      transferPurpose?: string;
      sourceOfFunds?: string;
    };
  }) {
    return this.post(`${this.apiBase}/v1/transfers`, input);
  }

  async getTransfer(transferId: string | number) {
    return this.get(`${this.apiBase}/v1/transfers/${encodeURIComponent(String(transferId))}`);
  }

  // -------------------------------------------------------------------------
  // Internal HTTP
  // -------------------------------------------------------------------------

  private async get(url: string) {
    const result = await requestWithRetry(
      url,
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
      status: result.status,
      body: result.body,
      apiCallsCount: result.apiCallsCount,
    };
  }

  private async post(url: string, body: unknown) {
    const result = await requestWithRetry(
      url,
      {
        method: "POST",
        headers: {
          Authorization: this.authHeader,
          Accept: "application/json",
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
      },
      this.retryOpts,
    );
    return {
      status: result.status,
      body: result.body,
      apiCallsCount: result.apiCallsCount,
    };
  }
}
