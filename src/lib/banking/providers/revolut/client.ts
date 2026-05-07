/**
 * Stage 6.P3.C — Revolut Business API client.
 *
 * Thin HTTP wrapper over the Revolut Business v1.0 API. Reuses the
 * shared `requestWithRetry` envelope from Stage 6.P1.C so timeouts +
 * 429/5xx handling + apiCallsCount tracking match every other
 * provider in the system.
 *
 * Endpoints:
 *   - GET  /accounts                — list business accounts
 *   - GET  /accounts/{id}           — single account (used for balance)
 *   - GET  /transactions            — list transactions (account+date filtered)
 *   - GET  /counterparties          — list saved counterparties
 *   - POST /pay                     — initiate payment to a counterparty
 *   - POST /webhooks                — register a webhook URL + events
 *
 * Auth: Bearer token (`api_key` from the Revolut Business app's
 * "API & developer" section). Sandbox + production share the same
 * scheme; the host differs.
 */

import {
  requestWithRetry,
  type RetryOptions,
} from "@/lib/channel-manager/http-retry";
import type { RevolutCredentials } from "../../types";

const HOSTS = {
  sandbox: "https://sandbox-b2b.revolut.com",
  production: "https://b2b.revolut.com",
} as const;

const API_VERSION = "/api/1.0";

export interface RevolutClientOptions extends RetryOptions {
  /** Override the API base — useful for tests and for mocking the
   *  sandbox vs production hosts. */
  apiBase?: string;
}

// ---------------------------------------------------------------------------
// Native API response shapes — kept untyped at the boundary, projected
// into our domain types in `parsers.ts`.
// ---------------------------------------------------------------------------

export interface RevolutAccount {
  id: string;
  name?: string;
  balance?: number;
  currency: string;
  state?: string;
  public?: boolean;
  created_at?: string;
  updated_at?: string;
}

export interface RevolutTransactionLeg {
  leg_id: string;
  account_id: string;
  counterparty?: {
    account_id?: string;
    account_type?: string;
    id?: string;
    name?: string;
  };
  amount: number;
  currency: string;
  description?: string;
  balance?: number;
  bill_amount?: number;
  bill_currency?: string;
}

export interface RevolutTransaction {
  id: string;
  type?: string;
  request_id?: string;
  state: string;
  reason_code?: string;
  created_at?: string;
  updated_at?: string;
  completed_at?: string;
  scheduled_for?: string;
  reference?: string;
  related_transaction_id?: string;
  merchant?: {
    name?: string;
    city?: string;
    country?: string;
    category_code?: string;
  };
  legs: RevolutTransactionLeg[];
  card?: { card_number?: string; first_name?: string; last_name?: string };
}

export interface RevolutPaymentRequest {
  request_id: string;
  account_id: string;
  receiver: {
    counterparty_id: string;
    /** Some payments target an account id under the counterparty. */
    account_id?: string;
  };
  amount: number;
  currency: string;
  reference: string;
  charge_bearer?: "shared" | "debtor" | "creditor";
}

export interface RevolutPaymentResponse {
  id: string;
  state: string;
  request_id: string;
  reason_code?: string;
}

// ---------------------------------------------------------------------------
// Client
// ---------------------------------------------------------------------------

export class RevolutClient {
  private readonly apiBase: string;
  private readonly retryOpts: RetryOptions;

  constructor(
    private readonly creds: RevolutCredentials,
    opts: RevolutClientOptions = {},
  ) {
    this.apiBase =
      opts.apiBase ?? `${HOSTS[creds.environment]}${API_VERSION}`;
    this.retryOpts = {
      fetch: opts.fetch,
      timeoutMs: opts.timeoutMs,
      maxRetries: opts.maxRetries,
      backoffBaseMs: opts.backoffBaseMs,
    };
  }

  private get authHeader(): string {
    return `Bearer ${this.creds.apiKey}`;
  }

  // -------------------------------------------------------------------------
  // GET requests
  // -------------------------------------------------------------------------

  async listAccounts(): Promise<{ status: number; body: string; apiCallsCount: number }> {
    return this.get(`${this.apiBase}/accounts`);
  }

  async getAccount(
    accountId: string,
  ): Promise<{ status: number; body: string; apiCallsCount: number }> {
    return this.get(
      `${this.apiBase}/accounts/${encodeURIComponent(accountId)}`,
    );
  }

  async listTransactions(input: {
    accountId?: string;
    from?: Date;
    to?: Date;
    /** Maximum to return; Revolut caps at 1000 per request. */
    count?: number;
  }): Promise<{ status: number; body: string; apiCallsCount: number }> {
    const url = new URL(`${this.apiBase}/transactions`);
    if (input.accountId) url.searchParams.set("account", input.accountId);
    if (input.from) url.searchParams.set("from", input.from.toISOString());
    if (input.to) url.searchParams.set("to", input.to.toISOString());
    if (input.count) url.searchParams.set("count", String(input.count));
    return this.get(url.toString());
  }

  async listCounterparties(): Promise<{ status: number; body: string; apiCallsCount: number }> {
    return this.get(`${this.apiBase}/counterparties`);
  }

  // -------------------------------------------------------------------------
  // Mutations
  // -------------------------------------------------------------------------

  async createPayment(
    input: RevolutPaymentRequest,
  ): Promise<{ status: number; body: string; apiCallsCount: number }> {
    return this.post(`${this.apiBase}/pay`, input);
  }

  async setupWebhook(input: {
    url: string;
    events?: string[];
  }): Promise<{ status: number; body: string; apiCallsCount: number }> {
    return this.post(`${this.apiBase}/webhooks`, input);
  }

  // -------------------------------------------------------------------------
  // Internal HTTP helpers
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
