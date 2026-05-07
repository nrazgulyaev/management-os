/**
 * Stage 6.P5.D — Google Sheets API client.
 *
 * Same auto-refresh shape as the Calendar client. Surface (Sheets v4):
 *   GET    /spreadsheets/{id}
 *   GET    /spreadsheets/{id}/values/{range}
 *   POST   /spreadsheets/{id}/values:batchGet
 *   PUT    /spreadsheets/{id}/values/{range}?valueInputOption=USER_ENTERED
 *   POST   /spreadsheets/{id}/values/{range}:append
 *   POST   /spreadsheets
 */

import {
  requestWithRetry,
  type RetryOptions,
} from "@/lib/channel-manager/http-retry";
import { refreshGoogleToken } from "@/lib/oauth/google";
import type { GoogleCredentialsUpdate } from "../types";

const SHEETS_API_BASE = "https://sheets.googleapis.com/v4";
const DEFAULT_REFRESH_MARGIN_MS = 60_000;

export interface GoogleSheetsClientOptions extends RetryOptions {
  apiBase?: string;
  clientId?: string;
  clientSecret?: string;
  onCredentialsRefreshed?: (next: GoogleCredentialsUpdate) => Promise<void> | void;
  refreshMarginMs?: number;
}

export interface GoogleSheetsClientResponse {
  status: number;
  body: string;
  apiCallsCount: number;
}

interface MutableCredentials {
  accessToken: string;
  refreshToken: string;
  expiresAt: number;
}

export class GoogleSheetsClient {
  private creds: MutableCredentials;
  private readonly apiBase: string;
  private readonly retryOpts: RetryOptions;
  private readonly clientId?: string;
  private readonly clientSecret?: string;
  private readonly onCredentialsRefreshed?: (
    next: GoogleCredentialsUpdate,
  ) => Promise<void> | void;
  private readonly refreshMarginMs: number;

  constructor(
    initial: MutableCredentials,
    opts: GoogleSheetsClientOptions = {},
  ) {
    this.creds = { ...initial };
    this.apiBase = opts.apiBase ?? SHEETS_API_BASE;
    this.retryOpts = {
      fetch: opts.fetch,
      timeoutMs: opts.timeoutMs,
      maxRetries: opts.maxRetries,
      backoffBaseMs: opts.backoffBaseMs,
    };
    this.clientId = opts.clientId;
    this.clientSecret = opts.clientSecret;
    this.onCredentialsRefreshed = opts.onCredentialsRefreshed;
    this.refreshMarginMs = opts.refreshMarginMs ?? DEFAULT_REFRESH_MARGIN_MS;
  }

  async getSpreadsheet(input: {
    spreadsheetId: string;
  }): Promise<GoogleSheetsClientResponse> {
    return this.authenticated({
      method: "GET",
      path: `/spreadsheets/${encodeURIComponent(input.spreadsheetId)}`,
    });
  }

  async getValues(input: {
    spreadsheetId: string;
    range: string;
  }): Promise<GoogleSheetsClientResponse> {
    return this.authenticated({
      method: "GET",
      path: `/spreadsheets/${encodeURIComponent(input.spreadsheetId)}/values/${encodeURIComponent(input.range)}`,
    });
  }

  async updateValues(input: {
    spreadsheetId: string;
    range: string;
    values: unknown[][];
  }): Promise<GoogleSheetsClientResponse> {
    return this.authenticated({
      method: "PUT",
      path: `/spreadsheets/${encodeURIComponent(input.spreadsheetId)}/values/${encodeURIComponent(input.range)}?valueInputOption=USER_ENTERED`,
      body: { values: input.values },
    });
  }

  async appendValues(input: {
    spreadsheetId: string;
    range: string;
    values: unknown[][];
  }): Promise<GoogleSheetsClientResponse> {
    return this.authenticated({
      method: "POST",
      path: `/spreadsheets/${encodeURIComponent(input.spreadsheetId)}/values/${encodeURIComponent(input.range)}:append?valueInputOption=USER_ENTERED&insertDataOption=INSERT_ROWS`,
      body: { values: input.values },
    });
  }

  async createSpreadsheet(input: {
    title: string;
  }): Promise<GoogleSheetsClientResponse> {
    return this.authenticated({
      method: "POST",
      path: `/spreadsheets`,
      body: { properties: { title: input.title } },
    });
  }

  currentCredentials(): MutableCredentials {
    return { ...this.creds };
  }

  private async authenticated(input: {
    method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
    path: string;
    body?: Record<string, unknown>;
  }): Promise<GoogleSheetsClientResponse> {
    await this.refreshIfNeeded();
    let result = await this.request(input);
    if (result.status === 401 && this.canRefresh()) {
      await this.forceRefresh();
      result = await this.request(input);
    }
    return result;
  }

  private async request(input: {
    method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
    path: string;
    body?: Record<string, unknown>;
  }): Promise<GoogleSheetsClientResponse> {
    const url = `${this.apiBase}${input.path}`;
    const init: RequestInit = {
      method: input.method,
      headers: {
        Authorization: `Bearer ${this.creds.accessToken}`,
        Accept: "application/json",
        ...(input.body ? { "Content-Type": "application/json" } : {}),
      },
    };
    if (input.body) init.body = JSON.stringify(input.body);
    const result = await requestWithRetry(url, init, this.retryOpts);
    return {
      status: result.status,
      body: result.body,
      apiCallsCount: result.apiCallsCount,
    };
  }

  private async refreshIfNeeded(): Promise<void> {
    if (!this.canRefresh()) return;
    const now = Date.now();
    if (now < this.creds.expiresAt - this.refreshMarginMs) return;
    await this.forceRefresh();
  }

  private async forceRefresh(): Promise<void> {
    if (!this.canRefresh()) return;
    const next = await refreshGoogleToken({
      refreshToken: this.creds.refreshToken,
      clientId: this.clientId!,
      clientSecret: this.clientSecret!,
      fetch: this.retryOpts.fetch,
    });
    this.creds = {
      accessToken: next.accessToken,
      refreshToken: next.refreshToken ?? this.creds.refreshToken,
      expiresAt: next.expiresAt,
    };
    if (this.onCredentialsRefreshed) {
      await this.onCredentialsRefreshed({
        accessToken: this.creds.accessToken,
        refreshToken: this.creds.refreshToken,
        expiresAt: this.creds.expiresAt,
      });
    }
  }

  private canRefresh(): boolean {
    return Boolean(
      this.creds.refreshToken && this.clientId && this.clientSecret,
    );
  }
}
