/**
 * Xendit API client — Indonesia-local PSP (QRIS / e-wallets / Virtual
 * Accounts / cards) behind ONE integration: the Invoice API. Creating an
 * invoice returns a hosted `invoice_url` checkout page that offers every
 * payment method enabled on the Xendit account, so we do not integrate
 * QRIS / OVO / DANA / VA channels one-by-one.
 *
 * Auth: HTTP Basic with the secret key as username and an empty
 * password (`Authorization: Basic base64("xnd_...:")`).
 *
 * Endpoints used:
 *   - POST /v2/invoices            create a hosted checkout invoice
 *   - GET  /v2/invoices/{id}       poll invoice status
 *   - POST /invoices/{id}/expire   expire (cancel) an open invoice
 *   - GET  /balance                cheap authenticated call for
 *                                  testConnection (CASH account balance)
 *
 * Reuses `requestWithRetry` (P1.C) like the Stripe client. JSON bodies.
 */

import {
  requestWithRetry,
  type RetryOptions,
} from "@/lib/channel-manager/http-retry";
import type { XenditCredentials } from "../../types";

const BASE = "https://api.xendit.co";

export interface XenditClientOptions extends RetryOptions {
  apiBase?: string;
}

export interface XenditCreateInvoiceBody {
  external_id: string;
  /** Amount in MAJOR currency units (IDR rupiah / USD dollars). */
  amount: number;
  currency?: string;
  description?: string;
  payer_email?: string;
  /** Invoice validity in seconds (Xendit default 24h). */
  invoice_duration?: number;
  success_redirect_url?: string;
  failure_redirect_url?: string;
  metadata?: Record<string, string>;
}

export class XenditClient {
  private readonly apiBase: string;
  private readonly retryOpts: RetryOptions;

  constructor(
    private readonly creds: XenditCredentials,
    opts: XenditClientOptions = {},
  ) {
    this.apiBase = opts.apiBase ?? BASE;
    this.retryOpts = {
      fetch: opts.fetch,
      timeoutMs: opts.timeoutMs,
      maxRetries: opts.maxRetries,
      backoffBaseMs: opts.backoffBaseMs,
    };
  }

  private get baseHeaders(): Record<string, string> {
    // Basic auth, secret key as username, empty password.
    const token = Buffer.from(`${this.creds.secretKey}:`).toString("base64");
    return {
      Authorization: `Basic ${token}`,
      Accept: "application/json",
      "Content-Type": "application/json",
    };
  }

  async createInvoice(body: XenditCreateInvoiceBody) {
    return this.post(
      `${this.apiBase}/v2/invoices`,
      body as unknown as Record<string, unknown>,
    );
  }

  async getInvoice(invoiceId: string) {
    return this.get(
      `${this.apiBase}/v2/invoices/${encodeURIComponent(invoiceId)}`,
    );
  }

  /** Xendit "cancel" for invoices is expiry. Note: NOT under /v2. */
  async expireInvoice(invoiceId: string) {
    return this.post(
      `${this.apiBase}/invoices/${encodeURIComponent(invoiceId)}/expire`,
      {},
    );
  }

  /** Cheapest authenticated read — used by testConnection. */
  async getBalance() {
    return this.get(`${this.apiBase}/balance?account_type=CASH`);
  }

  // -------------------------------------------------------------------------
  // Internal HTTP
  // -------------------------------------------------------------------------

  private async get(url: string) {
    const result = await requestWithRetry(
      url,
      { method: "GET", headers: this.baseHeaders },
      this.retryOpts,
    );
    return {
      status: result.status,
      body: result.body,
      apiCallsCount: result.apiCallsCount,
    };
  }

  private async post(url: string, body: Record<string, unknown>) {
    const result = await requestWithRetry(
      url,
      {
        method: "POST",
        headers: this.baseHeaders,
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
