/**
 * Stage 6.P5.B — Google Calendar API client.
 *
 * Bearer-token auth with auto-refresh on token expiry (proactive +
 * reactive 401 handling) — same pattern as the Gmail + Airbnb
 * clients. Tokens rotate at runtime and the service layer must
 * persist new tokens to `oauth_connections`.
 *
 * Surface (Calendar API v3):
 *   GET    /calendars/primary
 *   GET    /calendars/{id}/events     — list
 *   POST   /calendars/{id}/events     — insert
 *   PATCH  /calendars/{id}/events/{ev}— update
 *   DELETE /calendars/{id}/events/{ev}
 *   POST   /freeBusy                  — availability lookup
 *
 * Native fetch via the shared retry envelope from P1.A.
 */

import {
  requestWithRetry,
  type RetryOptions,
} from "@/lib/channel-manager/http-retry";
import { refreshGoogleToken } from "@/lib/oauth/google";
import type { GoogleCredentialsUpdate } from "../types";

const CALENDAR_API_BASE = "https://www.googleapis.com/calendar/v3";
const DEFAULT_REFRESH_MARGIN_MS = 60_000;

export interface GoogleCalendarClientOptions extends RetryOptions {
  apiBase?: string;
  clientId?: string;
  clientSecret?: string;
  /**
   * Invoked when the client refreshes the access token. Service layer
   * persists the new tokens to `oauth_connections`. The client also
   * updates its in-memory copy automatically.
   */
  onCredentialsRefreshed?: (next: GoogleCredentialsUpdate) => Promise<void> | void;
  refreshMarginMs?: number;
}

export interface GoogleCalendarClientResponse {
  status: number;
  body: string;
  apiCallsCount: number;
}

interface MutableCredentials {
  accessToken: string;
  refreshToken: string;
  expiresAt: number;
}

export class GoogleCalendarClient {
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
    opts: GoogleCalendarClientOptions = {},
  ) {
    this.creds = { ...initial };
    this.apiBase = opts.apiBase ?? CALENDAR_API_BASE;
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

  async listEvents(input: {
    calendarId?: string;
    timeMin?: Date;
    timeMax?: Date;
    maxResults?: number;
    pageToken?: string;
  }): Promise<GoogleCalendarClientResponse> {
    const cid = encodeURIComponent(input.calendarId ?? "primary");
    const params = new URLSearchParams();
    if (input.timeMin) params.set("timeMin", input.timeMin.toISOString());
    if (input.timeMax) params.set("timeMax", input.timeMax.toISOString());
    if (input.maxResults)
      params.set("maxResults", String(input.maxResults));
    if (input.pageToken) params.set("pageToken", input.pageToken);
    params.set("singleEvents", "true");
    params.set("orderBy", "startTime");
    return this.authenticated({
      method: "GET",
      path: `/calendars/${cid}/events?${params.toString()}`,
    });
  }

  async insertEvent(input: {
    calendarId?: string;
    body: Record<string, unknown>;
  }): Promise<GoogleCalendarClientResponse> {
    const cid = encodeURIComponent(input.calendarId ?? "primary");
    return this.authenticated({
      method: "POST",
      path: `/calendars/${cid}/events`,
      body: input.body,
    });
  }

  async updateEvent(input: {
    calendarId?: string;
    eventId: string;
    body: Record<string, unknown>;
  }): Promise<GoogleCalendarClientResponse> {
    const cid = encodeURIComponent(input.calendarId ?? "primary");
    const eid = encodeURIComponent(input.eventId);
    return this.authenticated({
      method: "PATCH",
      path: `/calendars/${cid}/events/${eid}`,
      body: input.body,
    });
  }

  async deleteEvent(input: {
    calendarId?: string;
    eventId: string;
  }): Promise<GoogleCalendarClientResponse> {
    const cid = encodeURIComponent(input.calendarId ?? "primary");
    const eid = encodeURIComponent(input.eventId);
    return this.authenticated({
      method: "DELETE",
      path: `/calendars/${cid}/events/${eid}`,
    });
  }

  async freeBusy(input: {
    timeMin: Date;
    timeMax: Date;
    calendarIds: string[];
  }): Promise<GoogleCalendarClientResponse> {
    return this.authenticated({
      method: "POST",
      path: `/freeBusy`,
      body: {
        timeMin: input.timeMin.toISOString(),
        timeMax: input.timeMax.toISOString(),
        items: input.calendarIds.map((id) => ({ id })),
      },
    });
  }

  async getPrimaryCalendar(): Promise<GoogleCalendarClientResponse> {
    return this.authenticated({
      method: "GET",
      path: `/calendars/primary`,
    });
  }

  /** Expose current credentials for callers that want to verify state. */
  currentCredentials(): MutableCredentials {
    return { ...this.creds };
  }

  // ---------------------------------------------------------------------------
  // Internals
  // ---------------------------------------------------------------------------

  private async authenticated(input: {
    method: "GET" | "POST" | "PATCH" | "DELETE";
    path: string;
    body?: Record<string, unknown>;
  }): Promise<GoogleCalendarClientResponse> {
    await this.refreshIfNeeded();
    let result = await this.request(input);
    // Reactive 401 — refresh once + retry.
    if (result.status === 401 && this.canRefresh()) {
      await this.forceRefresh();
      result = await this.request(input);
    }
    return result;
  }

  private async request(input: {
    method: "GET" | "POST" | "PATCH" | "DELETE";
    path: string;
    body?: Record<string, unknown>;
  }): Promise<GoogleCalendarClientResponse> {
    const url = `${this.apiBase}${input.path}`;
    const init: RequestInit = {
      method: input.method,
      headers: {
        Authorization: `Bearer ${this.creds.accessToken}`,
        Accept: "application/json",
        ...(input.body
          ? { "Content-Type": "application/json" }
          : {}),
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
