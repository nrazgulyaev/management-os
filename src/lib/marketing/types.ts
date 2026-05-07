/**
 * Stage 6.P4.A — Marketing provider types.
 *
 * Single `MarketingProviderInterface` every implementation conforms
 * to (GA4, Google Ads, Meta Pixel, Meta Ads, TikTok Ads, Mailchimp,
 * ConvertKit, manual, DryRun). Mirrors the proven Stage 3.A AI /
 * Stage 6.P1.A channel-manager / Stage 6.P2.A messaging / Stage
 * 6.P3.A bank + payment provider patterns.
 *
 * Pure types — no DB, no `import "server-only"`. Importable from
 * client code (UI types) and tests.
 */

import type {
  MarketingProviderName,
  CampaignStatus,
  CampaignBudgetType,
} from "@/lib/db/schema/p4-marketing";
import type { TouchpointChannel } from "@/lib/db/schema/attribution";

// Re-export for downstream importers that don't want a schema dep.
export type {
  MarketingProviderName,
  CampaignStatus,
  CampaignBudgetType,
  TouchpointChannel,
};

// ---------------------------------------------------------------------------
// Credentials — discriminated union per provider
// ---------------------------------------------------------------------------

/** GA4 — measurement protocol (server-side event tracking) +
 *  reporting data API (pull session data). */
export interface GoogleAnalyticsCredentials {
  provider: "google_analytics";
  /** `G-XXXXXXXXXX`. */
  measurementId: string;
  /** Measurement Protocol API secret (per-stream). */
  apiSecret: string;
  /** Numeric Property ID for the Reporting Data API. */
  propertyId: string;
  /** Service-account or OAuth client for Reporting API. JSON shape
   *  mirrors Google's service-account JSON file or an OAuth refresh
   *  token bundle. Optional until the operator wires reporting. */
  serviceAccountCredentials?: object;
}

export interface GoogleAdsCredentials {
  provider: "google_ads";
  /** Approved developer token. */
  developerToken: string;
  clientId: string;
  clientSecret: string;
  refreshToken: string;
  /** Customer ID — 10 digits, no dashes. */
  customerId: string;
  /** Manager (MCC) account ID when the customer is managed. */
  loginCustomerId?: string;
}

export interface MetaPixelCredentials {
  provider: "meta_pixel";
  pixelId: string;
  /** Conversions API token. */
  accessToken: string;
  /** When set, conversion events fire as test events (don't burn
   *  optimization budget). */
  testEventCode?: string;
}

export interface MetaAdsCredentials {
  provider: "meta_ads";
  /** Long-lived system-user access token. */
  accessToken: string;
  /** Ad account id, e.g. `act_123456789`. */
  adAccountId: string;
  businessId?: string;
  /** App secret for `appsecret_proof` signing — when configured. */
  appSecret?: string;
}

export interface TikTokAdsCredentials {
  provider: "tiktok_ads";
  accessToken: string;
  advertiserId: string;
  appId: string;
  secret: string;
}

export interface MailchimpCredentials {
  provider: "mailchimp";
  /** API key — includes the datacenter suffix (e.g. `...usX`). */
  apiKey: string;
}

export interface ConvertKitCredentials {
  provider: "convertkit";
  /** Public API key (used for write operations). */
  apiKey: string;
  /** Secret API key (used for read operations). */
  apiSecret: string;
}

export interface SendgridMarketingCredentials {
  provider: "sendgrid_marketing";
  apiKey: string;
}

export interface ManualMarketingCredentials {
  provider: "manual";
  label?: string;
}

export type MarketingCredentials =
  | GoogleAnalyticsCredentials
  | GoogleAdsCredentials
  | MetaPixelCredentials
  | MetaAdsCredentials
  | TikTokAdsCredentials
  | MailchimpCredentials
  | ConvertKitCredentials
  | SendgridMarketingCredentials
  | ManualMarketingCredentials;

// ---------------------------------------------------------------------------
// Domain types — what providers consume / return
// ---------------------------------------------------------------------------

export interface MarketingCampaignRecord {
  externalCampaignId: string;
  campaignName: string;
  campaignType?: string;
  campaignObjective?: string;
  status: CampaignStatus;
  startDate?: Date;
  endDate?: Date;
  budgetMinor?: bigint;
  budgetCurrency?: string;
  budgetType?: CampaignBudgetType;
  targetingSummary?: Record<string, unknown>;
  rawPayload: Record<string, unknown>;
}

export interface MarketingMetricsForDate {
  externalCampaignId: string;
  metricDate: Date;
  /** Always in minor units. Provider mappers normalize from native
   *  units (micros / major / etc.) before producing this record. */
  spendMinor: bigint;
  spendCurrency: string;
  impressions: bigint;
  reach?: bigint;
  frequency?: number;
  clicks: bigint;
  clickThroughRate?: number;
  costPerClickMinor?: bigint;
  conversions: bigint;
  conversionValueMinor: bigint;
  costPerConversionMinor?: bigint;
  returnOnAdSpend?: number;
  engagements?: bigint;
  videoViews?: bigint;
  videoWatchTimeSeconds?: bigint;
  qualityScore?: number;
  rawMetrics: Record<string, unknown>;
}

export interface AttributionTouchpointRecord {
  sessionId?: string;
  clientId?: string;
  userExternalId?: string;
  touchpointAt: Date;
  channel: TouchpointChannel;
  source?: string;
  medium?: string;
  campaign?: string;
  content?: string;
  term?: string;
  referrerUrl?: string;
  landingUrl?: string;
  userAgent?: string;
  deviceType?: string;
  country?: string;
  rawPayload?: Record<string, unknown>;
}

export interface ConversionEventInput {
  /** Provider-specific event name (e.g. "purchase", "Lead"). */
  eventName: string;
  /** Stable identifier for the visitor — GA4 client_id or Meta _fbp. */
  clientId: string;
  /** Conversion value in major units (the platform expects decimals). */
  eventValue?: number;
  currency?: string;
  /** Free-form bag — provider mappers route into the right field
   *  (Meta `custom_data`, GA4 `params`, etc.). */
  customParameters?: Record<string, unknown>;
  /** Idempotency key — Meta `event_id`, GA4 `transaction_id`. */
  eventId?: string;
  /** PII (already-hashed when sent to ad platforms). Optional. */
  hashedEmail?: string;
  hashedPhone?: string;
  /** When set, the event fires as a test event (Meta
   *  `test_event_code` etc.). */
  testEventCode?: string;
}

export interface ConversionEventResult {
  success: boolean;
  /** Provider-side event id when successful. */
  externalEventId?: string;
  error?: string;
}

export interface MarketingWebhookEvent {
  eventType: string;
  raw: Record<string, unknown>;
}

export interface ConnectionTestResult {
  connected: boolean;
  details: Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// Provider interface — every implementation conforms
// ---------------------------------------------------------------------------

export interface MarketingProviderInterface {
  /** Provider tag — must match the `provider` column on
   *  `marketing_connections`. */
  readonly provider: MarketingProviderName;

  /** Pull campaign metadata. Filtering by date range is best-effort —
   *  some providers don't support it (return empty range filter). */
  fetchCampaigns(input: {
    since?: Date;
    until?: Date;
  }): Promise<MarketingCampaignRecord[]>;

  /** Pull daily per-campaign metrics. The metric_date in each record
   *  identifies a specific (campaign, date) pair — the service
   *  layer's UNIQUE constraint catches duplicates. */
  fetchMetrics(input: {
    campaignIds: string[];
    since: Date;
    until: Date;
  }): Promise<MarketingMetricsForDate[]>;

  /** Optional — analytics providers (GA4 reporting, Mailchimp
   *  campaign metrics) implement. Ad platforms leave undefined; the
   *  attribution engine reads from `attribution_touchpoints`
   *  populated by the JS Tag + UTM tracker. */
  pullAnalyticsTouchpoints?(input: {
    since: Date;
    until: Date;
  }): Promise<AttributionTouchpointRecord[]>;

  /** Optional — server-side event tracking. GA4 Measurement Protocol
   *  + Meta Conversions API + Google Ads Enhanced Conversions all
   *  implement. */
  sendConversionEvent?(
    event: ConversionEventInput,
  ): Promise<ConversionEventResult>;

  /** Optional — webhook providers (Meta Pixel) implement. */
  verifyWebhook?(payload: string, signature: string, secret: string): boolean;
  parseWebhook?(
    payload: Record<string, unknown>,
  ): MarketingWebhookEvent | null;

  testConnection(): Promise<ConnectionTestResult>;
}
