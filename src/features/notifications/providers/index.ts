import type {
  DeliveryChannel,
  NotificationProvider,
  ProviderKey,
} from "./types";
import { noopProvider } from "./noop";
import { inAppProvider } from "./in-app";
import { resendProvider } from "./resend";
import { twilioProvider } from "./twilio";
import { selectProviderFor } from "./selector";

/**
 * Wired entry point used by the delivery engine. The pure selector lives
 * in `./selector.ts` so tests can verify the rules directly without
 * pulling in `@/lib/db/client` (the in-app provider's transitive dep).
 *
 * Selection rules (delegated to `selectProviderFor`):
 *   - in_app channel → always the in-app provider.
 *   - email + dry-run on  → noop. dry-run off + Resend OK → resend.
 *   - sms / whatsapp + dry-run on → noop. dry-run off + Twilio OK → twilio.
 *   - telegram → noop.
 */
export function selectProvider(
  channel: DeliveryChannel,
  opts: { forceDryRun?: boolean } = {},
): NotificationProvider {
  return selectProviderFor(
    channel,
    {
      inApp: inAppProvider,
      noop: noopProvider,
      resend: resendProvider,
      twilio: twilioProvider,
    },
    opts,
  );
}

export const ALL_PROVIDERS: NotificationProvider[] = [
  inAppProvider,
  resendProvider,
  twilioProvider,
  noopProvider,
];

export type { DeliveryChannel, NotificationProvider, ProviderKey };
export {
  inAppProvider,
  noopProvider,
  resendProvider,
  twilioProvider,
};
