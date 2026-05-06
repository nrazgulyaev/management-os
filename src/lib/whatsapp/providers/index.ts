import "server-only";

import { DryRunWhatsAppProvider } from "./dry-run";
import { TwilioWhatsAppProvider } from "./twilio";
import { MetaCloudWhatsAppProvider } from "./meta-cloud";
import type { WhatsAppProvider } from "./types";

export type {
  WhatsAppProvider,
  ProviderName,
  SendMessageInput,
  SendMessageResult,
  SendTemplateInput,
  ParsedInboundMessage,
  TranscribeResult,
  VerifyWebhookArgs,
} from "./types";
export { WhatsAppProviderError, NotImplementedError, normalisePhone } from "./types";

let cached: WhatsAppProvider | null = null;

/**
 * Returns the configured WhatsApp provider for the current process.
 *
 * Selection (Stage 3.D):
 *   1. WHATSAPP_PROVIDER=dry_run                  → DryRunProvider.
 *   2. WHATSAPP_PROVIDER=meta_cloud               → MetaCloudProvider (stub).
 *   3. WHATSAPP_PROVIDER=twilio OR auto-detect    → TwilioProvider when
 *      TWILIO_ACCOUNT_SID + TWILIO_AUTH_TOKEN configured.
 *   4. Otherwise (no creds, prod env not strict)  → DryRunProvider.
 *
 * In production with `WHATSAPP_REQUIRE_REAL_PROVIDER=1`, the factory
 * refuses to fall back to DryRun — throws on init so a misconfigured
 * production deploy fails loudly instead of silently dropping every
 * outbound message.
 */
export function getWhatsAppProvider(): WhatsAppProvider {
  if (cached) return cached;
  const explicit = process.env.WHATSAPP_PROVIDER;
  if (explicit === "dry_run") {
    cached = new DryRunWhatsAppProvider();
    return cached;
  }
  if (explicit === "meta_cloud") {
    cached = new MetaCloudWhatsAppProvider();
    return cached;
  }
  if (
    explicit === "twilio" ||
    (process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN)
  ) {
    const twilio = new TwilioWhatsAppProvider();
    if (twilio.isAvailable()) {
      cached = twilio;
      return cached;
    }
    if (
      process.env.NODE_ENV === "production" &&
      process.env.WHATSAPP_REQUIRE_REAL_PROVIDER === "1"
    ) {
      throw new Error(
        "TwilioWhatsAppProvider requested but credentials are missing — refusing to fall back to DryRun in production with WHATSAPP_REQUIRE_REAL_PROVIDER=1.",
      );
    }
  }
  if (
    process.env.NODE_ENV === "production" &&
    process.env.WHATSAPP_REQUIRE_REAL_PROVIDER === "1"
  ) {
    throw new Error(
      "No real WhatsApp provider configured but WHATSAPP_REQUIRE_REAL_PROVIDER=1 in production.",
    );
  }
  cached = new DryRunWhatsAppProvider();
  return cached;
}

/** Test seam — allows specs to inject a fake provider. */
export function _setWhatsAppProviderForTest(
  provider: WhatsAppProvider | null,
): void {
  cached = provider;
}
