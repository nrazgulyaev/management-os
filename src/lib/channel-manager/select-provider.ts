import type { ChannelName } from "@/lib/db/schema/channel-manager";
import { DryRunChannelProvider } from "./providers/dry-run";
import { BookingComProvider } from "./providers/booking-com/provider";
import { AirbnbProvider } from "./providers/airbnb/provider";
import { TripComProvider } from "./providers/trip-com/provider";
import { AgodaProvider } from "./providers/agoda/provider";
import { ExpediaProvider } from "./providers/expedia/provider";
import { VRBOProvider } from "./providers/vrbo/provider";
import { HotelsComProvider } from "./providers/hotels-com/provider";
import type { ChannelCredentials, ChannelManagerProvider } from "./types";

/**
 * Stage 6.P1.A — Channel provider selector.
 *
 * Mirrors the Stage 3.A AI provider / Stage 3.D WhatsApp provider
 * pattern: one entry point, returns a real implementation when
 * credentials are present, returns a DryRun fallback otherwise.
 *
 * P1.A scope ships only the DryRun fallback. P1.B/C/D land each real
 * provider behind this selector — the switch grows but the contract
 * doesn't change. Callers (cron jobs, webhook routes, service layer)
 * always go through this function so they get the same interface
 * regardless of credential state.
 *
 * `direct` is intentionally not handled here — it's a non-channel
 * marker for bookings that originate inside the platform. Callers
 * shouldn't be invoking provider methods on a `direct` connection.
 */
export function selectChannelProvider(
  channel: ChannelName,
  credentials: ChannelCredentials | null,
): ChannelManagerProvider {
  // `direct` is intentionally not a real channel — it tags bookings
  // that originate inside the platform. Any provider call against it
  // is a no-op via DryRun rather than an error.
  if (channel === "direct") {
    return new DryRunChannelProvider(channel);
  }

  // No credentials → safe default. Same answer for any real channel.
  if (!credentials) {
    return new DryRunChannelProvider(channel);
  }

  // Defensive: the DB-stored channel must match the credentials union
  // tag. A mismatch means somebody persisted the wrong shape; fall
  // back to DryRun rather than returning a misconfigured real provider.
  if (credentials.channel !== channel) {
    return new DryRunChannelProvider(channel);
  }

  switch (channel) {
    case "booking_com":
      return new BookingComProvider(
        credentials as Extract<ChannelCredentials, { channel: "booking_com" }>,
      );

    case "airbnb":
      return new AirbnbProvider(
        credentials as Extract<ChannelCredentials, { channel: "airbnb" }>,
      );

    case "trip_com":
      return new TripComProvider(
        credentials as Extract<ChannelCredentials, { channel: "trip_com" }>,
      );

    case "agoda":
      return new AgodaProvider(
        credentials as Extract<ChannelCredentials, { channel: "agoda" }>,
      );

    case "expedia":
      return new ExpediaProvider(
        {
          ...(credentials as Extract<ChannelCredentials, { channel: "expedia" }>),
          channel: "expedia",
        },
      );

    case "vrbo":
      return new VRBOProvider(
        credentials as Extract<ChannelCredentials, { channel: "vrbo" }>,
      );

    case "hotels_com":
      return new HotelsComProvider(
        credentials as Extract<ChannelCredentials, { channel: "hotels_com" }>,
      );

    default: {
      // Exhaustiveness guard. If a new ChannelName is added but not
      // handled here, TypeScript will flag this assignment.
      const exhaustive: never = channel;
      void exhaustive;
      return new DryRunChannelProvider(channel as ChannelName);
    }
  }
}
