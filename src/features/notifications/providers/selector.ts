import { isNotificationsDryRun } from "@/lib/env";
import type { DeliveryChannel, NotificationProvider } from "./types";

/**
 * Pure selector: given the four providers, pick one for the channel.
 * Extracted so tests can supply stub providers without dragging in
 * `@/lib/db/client` (the in-app provider's transitive dep).
 *
 * Selection rules:
 *   - in_app channel → always the in-app provider
 *   - email + dry-run on  → noop
 *   - email + dry-run off + Resend OK → resend
 *   - email + dry-run off + Resend ❌ → noop
 *   - sms / whatsapp + dry-run on  → noop
 *   - sms / whatsapp + dry-run off + Twilio OK → twilio
 *   - sms / whatsapp + dry-run off + Twilio ❌ → noop
 *   - telegram → noop (deferred)
 */
export function selectProviderFor(
  channel: DeliveryChannel,
  providers: {
    inApp: NotificationProvider;
    noop: NotificationProvider;
    resend: NotificationProvider;
    twilio: NotificationProvider;
  },
  opts: { forceDryRun?: boolean } = {},
): NotificationProvider {
  if (channel === "in_app") return providers.inApp;
  const dry = opts.forceDryRun ?? isNotificationsDryRun();
  if (dry) return providers.noop;
  if (channel === "email" && providers.resend.isConfigured()) return providers.resend;
  if (
    (channel === "sms" || channel === "whatsapp") &&
    providers.twilio.isConfigured()
  )
    return providers.twilio;
  return providers.noop;
}
