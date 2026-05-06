import type { DeliveryChannel, NotificationProvider } from "./types";

/**
 * Default-safe provider. Never sends anything; reports `sent` so the queue
 * lifecycle still progresses. Used when external providers aren't
 * configured or `NOTIFICATIONS_DRY_RUN=1`.
 *
 * The accompanying `notification_deliveries` row carries `provider="noop"`
 * so operators can spot the dry-run channel in the admin log.
 */
export const noopProvider: NotificationProvider = {
  key: "noop",
  supports: (_channel: DeliveryChannel) => true,
  isConfigured: () => true,
  async send(input) {
    return {
      status: "sent",
      providerMessageId: `noop-${input.notificationId}`,
      responseJson: { dryRun: true, channel: input.channel },
    };
  },
};
