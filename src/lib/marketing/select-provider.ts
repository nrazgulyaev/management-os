import type { MarketingProviderName } from "@/lib/db/schema/p4-marketing";
import { DryRunMarketingProvider } from "./providers/dry-run";
import { GoogleAnalyticsProvider } from "./providers/google-analytics/provider";
import { MetaPixelProvider } from "./providers/meta-pixel/provider";
import type {
  MarketingCredentials,
  MarketingProviderInterface,
} from "./types";

/**
 * Stage 6.P4.A — Marketing provider selector.
 *
 * One entry point — returns a real implementation when credentials
 * are present and match the requested provider, returns a DryRun
 * fallback otherwise. Mirrors the proven Stage 3.A AI / Stage 6.P1.A
 * channel-manager / Stage 6.P2.A messaging / Stage 6.P3.A bank +
 * payment selector pattern.
 *
 * P4.A scope ships only the DryRun fallback. P4.B/C/D/E land each
 * real provider behind this selector — the switch grows but the
 * contract doesn't change. Service layer + cron sweep + UI always
 * go through this function so they get the same interface
 * regardless of credential state.
 */
export function selectMarketingProvider(
  provider: MarketingProviderName,
  credentials: MarketingCredentials | null,
): MarketingProviderInterface {
  // "other" is a catch-all schema slot — no real implementation.
  if (provider === "other") {
    return new DryRunMarketingProvider(provider);
  }

  // No credentials → safe default. Same answer for any provider.
  if (!credentials) {
    return new DryRunMarketingProvider(provider);
  }

  // Defensive: the DB-stored provider tag must match the credentials
  // discriminator. A mismatch means somebody persisted the wrong
  // shape; fall back to DryRun rather than constructing a
  // misconfigured real provider.
  if (credentials.provider !== provider) {
    return new DryRunMarketingProvider(provider);
  }

  switch (provider) {
    case "google_analytics":
      // P4.B landed GA4 — see providers/google-analytics/.
      if (credentials.provider !== "google_analytics") {
        return new DryRunMarketingProvider(provider);
      }
      return new GoogleAnalyticsProvider(credentials);

    case "meta_pixel":
      // P4.B landed Meta Pixel — see providers/meta-pixel/.
      if (credentials.provider !== "meta_pixel") {
        return new DryRunMarketingProvider(provider);
      }
      return new MetaPixelProvider(credentials);

    // P4.C lands Google Ads.
    case "google_ads":
    // P4.D lands Meta Ads.
    case "meta_ads":
    // P4.E lands TikTok + Mailchimp + ConvertKit + SendGrid.
    case "tiktok_ads":
    case "mailchimp":
    case "convertkit":
    case "sendgrid_marketing":
    // Manual stays DryRun by design.
    case "manual":
      return new DryRunMarketingProvider(provider);

    default: {
      // Exhaustiveness guard — TS flags missing cases when a new
      // MarketingProviderName value is added.
      const exhaustive: never = provider;
      void exhaustive;
      return new DryRunMarketingProvider(provider as MarketingProviderName);
    }
  }
}
