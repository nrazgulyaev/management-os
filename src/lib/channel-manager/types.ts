/**
 * Stage 6.P1.A — Channel Manager provider types.
 *
 * Single `ChannelManagerProvider` interface every channel implementation
 * (Booking.com, Airbnb, Trip.com, Agoda, Expedia, VRBO, Hotels.com)
 * conforms to. Mirrors the Stage 3.A AI-provider / Stage 3.D WhatsApp /
 * Stage 4.A Storage / Stage 5.E Notification provider conventions.
 *
 * Pure types — no DB, no `import "server-only"`. Importable from client
 * code (UI types) and tests.
 */

import type {
  ChannelName,
  ChannelReservationState,
  ChannelPaymentModel,
} from "@/lib/db/schema/channel-manager";

// Re-export for downstream importers that don't want a schema dep.
export type { ChannelName, ChannelReservationState, ChannelPaymentModel };

// ---------------------------------------------------------------------------
// Credentials — discriminated union, one variant per channel
// ---------------------------------------------------------------------------

export interface BookingComCredentials {
  channel: "booking_com";
  username: string;
  password: string;
  /** Numeric Booking.com hotel ID. */
  hotelId: string;
  environment: "sandbox" | "production";
}

export interface AirbnbCredentials {
  channel: "airbnb";
  accessToken: string;
  refreshToken: string;
  /** Unix epoch ms — when accessToken expires. */
  expiresAt: number;
  listingId: string;
}

export interface TripComCredentials {
  channel: "trip_com";
  partnerId: string;
  apiKey: string;
  hotelId: string;
}

export interface AgodaCredentials {
  channel: "agoda";
  hotelId: string;
  apiKey: string;
  /** Used for the X-Agoda-Signature HMAC. Distinct from apiKey. */
  apiSecret: string;
  environment: "sandbox" | "production";
}

export interface ExpediaCredentials {
  channel: "expedia";
  hotelId: string;
  eqcUsername: string;
  eqcPassword: string;
  environment: "sandbox" | "production";
}

export interface VRBOCredentials {
  channel: "vrbo";
  /** VRBO runs on Expedia infrastructure — same EQC creds. */
  hotelId: string;
  eqcUsername: string;
  eqcPassword: string;
  environment: "sandbox" | "production";
}

export interface HotelsComCredentials {
  channel: "hotels_com";
  /** Hotels.com runs on Expedia infrastructure — same EQC creds. */
  hotelId: string;
  eqcUsername: string;
  eqcPassword: string;
  environment: "sandbox" | "production";
}

export type ChannelCredentials =
  | BookingComCredentials
  | AirbnbCredentials
  | TripComCredentials
  | AgodaCredentials
  | ExpediaCredentials
  | VRBOCredentials
  | HotelsComCredentials;

// ---------------------------------------------------------------------------
// Inventory + rates push inputs
// ---------------------------------------------------------------------------

/**
 * Per-day availability count to push to a channel.
 *
 * `availabilityPerDay` keyed by ISO date (YYYY-MM-DD) so the value is
 * independently parseable in any timezone. Value is the number of units
 * available for sale on that date — for a single-villa connection this
 * is 0 or 1, for a multi-room property it can be larger.
 */
export interface AvailabilityInput {
  villaId: string;
  externalPropertyId: string;
  startDate: Date;
  endDate: Date;
  availabilityPerDay: Map<string, number>;
}

export interface RateDayInput {
  amountMinor: bigint;
  currency: string;
  minStay?: number;
  maxStay?: number;
}

export interface RatesInput {
  villaId: string;
  externalPropertyId: string;
  ratePlanId: string;
  startDate: Date;
  endDate: Date;
  ratesPerDay: Map<string, RateDayInput>;
}

export interface AmenitiesInput {
  externalPropertyId: string;
  /** Channel-specific amenity codes — caller responsible for mapping. */
  amenities: string[];
}

// ---------------------------------------------------------------------------
// Sync result — what every push/pull returns
// ---------------------------------------------------------------------------

export interface SyncError {
  field?: string;
  message: string;
}

export interface SyncResult {
  success: boolean;
  recordsProcessed: number;
  recordsSucceeded: number;
  recordsFailed: number;
  errors: SyncError[];
  durationMs: number;
  /** External API calls made for this attempt (DryRun = 0). */
  apiCallsCount: number;
}

// ---------------------------------------------------------------------------
// Reservation pull
// ---------------------------------------------------------------------------

export interface ChannelReservationGuest {
  firstName: string;
  lastName: string;
  email?: string;
  phone?: string;
  /** ISO 3166-1 alpha-2 country code if the channel provides it. */
  country?: string;
}

/**
 * Reservation as returned by a channel (push or pull). The shape is
 * normalized across channels so the downstream workflow doesn't have
 * to special-case per channel.
 *
 * `rawPayload` carries the original channel-shaped data for replay /
 * debugging — projected fields above may drift across channel updates,
 * but rawPayload is always whatever the channel sent.
 */
export interface ChannelReservationData {
  externalReservationId: string;
  /** Channel's own status string — providers normalize this if useful. */
  externalStatus: string;
  guest: ChannelReservationGuest;
  checkIn: Date;
  checkOut: Date;
  adults: number;
  children?: number;
  infants?: number;
  totalAmountMinor: bigint;
  currency: string;
  commissionMinor?: bigint;
  taxesMinor?: bigint;
  serviceFeesMinor?: bigint;
  paymentCollectedBy: ChannelPaymentModel;
  paymentStatus?: string;
  specialRequests?: string;
  reservationCreatedAt: Date;
  rawPayload: Record<string, unknown>;
}

export interface PullReservationsInput {
  externalPropertyId: string;
  /** Only fetch reservations modified since this timestamp. Channels
   *  that don't support filtering will return everything and the caller
   *  can filter in-memory. */
  modifiedSince?: Date;
  limit?: number;
}

// ---------------------------------------------------------------------------
// Webhook
// ---------------------------------------------------------------------------

export type WebhookEventType =
  | "reservation.created"
  | "reservation.modified"
  | "reservation.cancelled"
  | "rate.modified"
  | "inventory.modified";

export interface WebhookEvent {
  type: WebhookEventType;
  externalReservationId?: string;
  payload: Record<string, unknown>;
  /** Original signature header value — providers verify against the
   *  raw body using `verifyWebhook` before parsing. */
  signature: string;
  timestamp: Date;
}

// ---------------------------------------------------------------------------
// Connection test
// ---------------------------------------------------------------------------

export interface ConnectionTestResult {
  connected: boolean;
  /** Channel-specific diagnostic data — environment, hotel ID echo,
   *  HTTP status, error message. Not for end-user display verbatim;
   *  the connections UI shows a curated subset. */
  details: Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// The interface every channel implements
// ---------------------------------------------------------------------------

export interface ChannelManagerProvider {
  readonly name: ChannelName;

  // Inventory
  pushAvailability(input: AvailabilityInput): Promise<SyncResult>;
  pushRates(input: RatesInput): Promise<SyncResult>;
  pushAmenities(input: AmenitiesInput): Promise<SyncResult>;

  // Reservations
  pullReservations(input: PullReservationsInput): Promise<ChannelReservationData[]>;

  // Webhooks
  /** Verify HMAC signature against the raw request body. Constant-time. */
  verifyWebhook(payload: string, signature: string, secret: string): boolean;
  /** Parse a verified payload into a normalized event, or null if the
   *  payload type is unknown to this provider. */
  parseWebhook(payload: Record<string, unknown>): WebhookEvent | null;

  // Status
  testConnection(): Promise<ConnectionTestResult>;
}
