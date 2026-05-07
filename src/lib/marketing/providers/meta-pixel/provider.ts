/**
 * Stage 6.P4.B — Meta Pixel `MarketingProviderInterface` adapter.
 *
 * Wraps `MetaPixelClient` behind the unified marketing interface.
 * Conversion events fire via the Conversions API; Meta Pixel doesn't
 * push webhooks for inbound traffic data, so `parseWebhook` returns
 * null. (Meta DOES send webhooks for app + business events but those
 * aren't part of the marketing-attribution surface.)
 */

import type {
  AttributionTouchpointRecord,
  ConnectionTestResult,
  ConversionEventInput,
  ConversionEventResult,
  MarketingCampaignRecord,
  MarketingMetricsForDate,
  MarketingProviderInterface,
  MarketingProviderName,
  MarketingWebhookEvent,
  MetaPixelCredentials,
} from "../../types";
import { MetaPixelClient, type MetaPixelClientOptions } from "./client";

const PROVIDER: MarketingProviderName = "meta_pixel";

export class MetaPixelProvider implements MarketingProviderInterface {
  readonly provider: MarketingProviderName = PROVIDER;
  private readonly client: MetaPixelClient;

  constructor(
    credentials: MetaPixelCredentials,
    opts: MetaPixelClientOptions = {},
  ) {
    this.client = new MetaPixelClient(credentials, opts);
  }

  async fetchCampaigns(): Promise<MarketingCampaignRecord[]> {
    // Pixel ≠ Ads. Campaign data lives on the Meta Ads provider
    // (P4.D). Pixel is purely for conversion-event firing.
    return [];
  }

  async fetchMetrics(): Promise<MarketingMetricsForDate[]> {
    return [];
  }

  /** Pixel doesn't expose attribution data outbound — events go IN
   *  only. Meta's attribution view lives in Ads Manager. */
  async pullAnalyticsTouchpoints(): Promise<AttributionTouchpointRecord[]> {
    return [];
  }

  async sendConversionEvent(
    event: ConversionEventInput,
  ): Promise<ConversionEventResult> {
    let result;
    try {
      result = await this.client.sendEvents([
        {
          eventName: event.eventName,
          eventTime: Math.floor(Date.now() / 1000),
          eventId: event.eventId,
          actionSource: "website",
          userData: {
            email: event.hashedEmail
              ? undefined // already hashed by upstream
              : extractEmail(event.customParameters),
            phone: event.hashedPhone
              ? undefined
              : extractPhone(event.customParameters),
            externalId: event.clientId,
            fbp: extractFbp(event.customParameters),
            fbc: extractFbc(event.customParameters),
          },
          customData: {
            currency: event.currency,
            value: event.eventValue,
            ...(event.customParameters ?? {}),
          },
        },
      ]);
    } catch (err) {
      return {
        success: false,
        error: err instanceof Error ? err.message : String(err),
      };
    }
    if (result.status >= 200 && result.status < 300) {
      let externalEventId: string | undefined;
      try {
        const parsed = JSON.parse(result.body) as Record<string, unknown>;
        const fbtraceId = parsed["fbtrace_id"];
        if (typeof fbtraceId === "string") externalEventId = fbtraceId;
      } catch {
        // body wasn't JSON — leave externalEventId unset
      }
      return {
        success: true,
        externalEventId: externalEventId ?? event.eventId,
      };
    }
    return {
      success: false,
      error: `Meta Pixel HTTP ${result.status}: ${truncate(result.body, 200)}`,
    };
  }

  /** Meta doesn't send Pixel-traffic webhooks. Fail-closed. Signature
   *  matches `MarketingProviderInterface.verifyWebhook`. */
  verifyWebhook(
    _payload: string,
    _signature: string,
    _secret: string,
  ): boolean {
    return false;
  }

  parseWebhook(
    _payload: Record<string, unknown>,
  ): MarketingWebhookEvent | null {
    return null;
  }

  async testConnection(): Promise<ConnectionTestResult> {
    let result;
    try {
      result = await this.client.testConnection();
    } catch (err) {
      return {
        connected: false,
        details: {
          provider: PROVIDER,
          error: err instanceof Error ? err.message : String(err),
        },
      };
    }
    let eventsReceived: number | undefined;
    try {
      const parsed = JSON.parse(result.body) as Record<string, unknown>;
      if (typeof parsed["events_received"] === "number") {
        eventsReceived = parsed["events_received"] as number;
      }
    } catch {
      // body wasn't JSON
    }
    return {
      connected: result.status >= 200 && result.status < 300,
      details: {
        provider: PROVIDER,
        status: result.status,
        eventsReceived,
        bodyPreview: truncate(result.body, 200),
      },
    };
  }
}

// ---------------------------------------------------------------------------
// Custom-parameter extraction helpers — Meta's user_data uses _fbp
// (browser pixel) + _fbc (click ID) cookie values, when available.
// ---------------------------------------------------------------------------

function extractEmail(
  params: Record<string, unknown> | undefined,
): string | undefined {
  if (!params) return undefined;
  const v = params["email"] ?? params["user_email"];
  return typeof v === "string" && v.length > 0 ? v : undefined;
}

function extractPhone(
  params: Record<string, unknown> | undefined,
): string | undefined {
  if (!params) return undefined;
  const v = params["phone"] ?? params["user_phone"];
  return typeof v === "string" && v.length > 0 ? v : undefined;
}

function extractFbp(
  params: Record<string, unknown> | undefined,
): string | undefined {
  if (!params) return undefined;
  const v = params["fbp"] ?? params["_fbp"];
  return typeof v === "string" && v.length > 0 ? v : undefined;
}

function extractFbc(
  params: Record<string, unknown> | undefined,
): string | undefined {
  if (!params) return undefined;
  const v = params["fbc"] ?? params["_fbc"];
  return typeof v === "string" && v.length > 0 ? v : undefined;
}

function truncate(s: string, max: number): string {
  return s.length <= max ? s : s.slice(0, max) + "…";
}
