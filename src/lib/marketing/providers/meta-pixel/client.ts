/**
 * Stage 6.P4.B — Meta Pixel Conversions API client.
 *
 * Sends server-side conversion events to Meta:
 *
 *   POST https://graph.facebook.com/v18.0/{pixel_id}/events
 *
 * Auth: Bearer access_token. When `app_secret` is configured we add
 * `appsecret_proof` (HMAC-SHA256 of the access token keyed with the
 * app secret) — Meta lets you require this server-side as
 * defense-in-depth against leaked tokens.
 *
 * PII in `user_data` is hashed via the pure helper in
 * `./hash-pii.ts` before send. The client never sees raw PII in its
 * request body; the caller's `sendEvent` input is the last point
 * where raw PII can appear, and even there the helper hashes
 * synchronously.
 */

import {
  requestWithRetry,
  type RetryOptions,
} from "@/lib/channel-manager/http-retry";
import type { MetaPixelCredentials } from "../../types";
import {
  generateAppsecretProof,
  hashUserData,
  type HashedUserData,
  type RawUserData,
} from "./hash-pii";

const META_GRAPH_BASE = "https://graph.facebook.com/v18.0";

export interface MetaPixelClientOptions extends RetryOptions {
  apiBase?: string;
}

// ---------------------------------------------------------------------------
// Domain types
// ---------------------------------------------------------------------------

export interface MetaConversionEvent {
  /** Standard Meta event names: Purchase, Lead, CompleteRegistration,
   *  AddToCart, etc. Custom names allowed but optimization quality
   *  drops. */
  eventName: string;
  /** Unix-seconds (NOT ms). Defaults to now if omitted. */
  eventTime?: number;
  /** Idempotency key — Meta dedupes by `event_id`. */
  eventId?: string;
  /** Source URL (browser-side) or page URL (server-side). */
  eventSourceUrl?: string;
  /** "website" / "app" / "phone_call" / "chat" / etc. Defaults to
   *  "website" — the dominant case for Conversions API. */
  actionSource?: string;
  /** Raw PII bag — hashed inside the client before send. */
  userData: RawUserData;
  /** Free-form custom data — value, currency, content_ids, etc. */
  customData?: Record<string, unknown>;
}

export interface MetaPixelResponse {
  status: number;
  body: string;
  apiCallsCount: number;
}

// ---------------------------------------------------------------------------
// Client
// ---------------------------------------------------------------------------

export class MetaPixelClient {
  private readonly apiBase: string;
  private readonly retryOpts: RetryOptions;

  constructor(
    private readonly creds: MetaPixelCredentials,
    opts: MetaPixelClientOptions = {},
  ) {
    this.apiBase = opts.apiBase ?? META_GRAPH_BASE;
    this.retryOpts = {
      fetch: opts.fetch,
      timeoutMs: opts.timeoutMs,
      maxRetries: opts.maxRetries,
      backoffBaseMs: opts.backoffBaseMs,
    };
  }

  async sendEvents(events: MetaConversionEvent[]): Promise<MetaPixelResponse> {
    if (!events || events.length === 0) {
      throw new Error("MetaPixelClient.sendEvents: events required");
    }
    const url = new URL(
      `${this.apiBase}/${encodeURIComponent(this.creds.pixelId)}/events`,
    );
    url.searchParams.set("access_token", this.creds.accessToken);
    if (this.creds.appSecret) {
      url.searchParams.set(
        "appsecret_proof",
        generateAppsecretProof(this.creds.accessToken, this.creds.appSecret),
      );
    }

    const data = events.map((e) => projectEventForApi(e));
    const body: Record<string, unknown> = { data };
    if (this.creds.testEventCode) {
      body["test_event_code"] = this.creds.testEventCode;
    }

    const result = await requestWithRetry(
      url.toString(),
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
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

  /**
   * Test-connection payload — fires a `PageView` test event. Always
   * uses the test_event_code so it doesn't consume optimization
   * budget. Returns the raw response so callers can read the
   * `events_received` count for confirmation.
   */
  async testConnection(): Promise<MetaPixelResponse> {
    return this.sendEvents([
      {
        eventName: "PageView",
        eventTime: Math.floor(Date.now() / 1000),
        eventSourceUrl: "https://example.com/__test__",
        actionSource: "website",
        userData: { externalId: "p3-6-test-event" },
      },
    ]);
  }
}

// ---------------------------------------------------------------------------
// Pure helpers — exported for testing
// ---------------------------------------------------------------------------

interface MetaApiEvent {
  event_name: string;
  event_time: number;
  event_id?: string;
  event_source_url?: string;
  action_source: string;
  user_data: HashedUserData;
  custom_data?: Record<string, unknown>;
}

export function projectEventForApi(input: MetaConversionEvent): MetaApiEvent {
  const event_time =
    input.eventTime ?? Math.floor(Date.now() / 1000);
  const out: MetaApiEvent = {
    event_name: input.eventName,
    event_time,
    action_source: input.actionSource ?? "website",
    user_data: hashUserData(input.userData),
  };
  if (input.eventId) out.event_id = input.eventId;
  if (input.eventSourceUrl) out.event_source_url = input.eventSourceUrl;
  if (input.customData) out.custom_data = input.customData;
  return out;
}
