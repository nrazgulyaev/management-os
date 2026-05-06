/**
 * Stage 6.P1.A — Channel Manager schema.
 *
 * 4 tables (migrations 0076 + 0077):
 *   - channel_connections          per-villa × channel connection record
 *                                  with encrypted credentials, mappings,
 *                                  sync state, commercial fields
 *   - channel_sync_log             per-attempt audit (push + pull + webhook)
 *   - channel_reservations         every reservation pulled or pushed via
 *                                  webhook, with raw payload + projected
 *                                  fields + lifecycle state
 *   - channel_commission_records   commission liability tracking for
 *                                  bookkeeper reconciliation
 *
 * RLS: per-org isolation via is_in_user_organization() (Stage 5.J helper).
 */

import { sql } from "drizzle-orm";
import {
  pgTable,
  uuid,
  text,
  timestamp,
  bigint,
  integer,
  boolean,
  jsonb,
  date,
  numeric,
  index,
} from "drizzle-orm/pg-core";
import { organizations } from "./saas";
import { appUsers } from "./identity";
import { villas } from "./projects";
import { bookings } from "./bookings";
import { contacts } from "./contacts";

// ---------------------------------------------------------------------------
// channel_connections
// ---------------------------------------------------------------------------
export const channelConnections = pgTable(
  "channel_connections",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    villaId: uuid("villa_id")
      .notNull()
      .references(() => villas.id, { onDelete: "cascade" }),

    /** ChannelName: 'booking_com' | 'airbnb' | 'trip_com' | 'agoda' | 'expedia' | 'vrbo' | 'hotels_com' | 'direct' */
    channel: text("channel").notNull(),

    externalPropertyId: text("external_property_id").notNull(),
    externalRoomId: text("external_room_id"),
    externalRatePlanIds: text("external_rate_plan_ids").array(),

    /** ChannelConnectionStatus FSM */
    status: text("status").notNull().default("pending"),

    /**
     * Encrypted JSONB. Per-channel discriminated union — see
     * docs/CHANNEL-CREDENTIALS-FORMAT.md. Encrypted at the application
     * layer using STAY_LINK_KMS_SECRET (same envelope as guest-stay
     * tokens + oauth_connections.access_token).
     */
    credentials: jsonb("credentials"),

    /** HMAC secret the channel uses to sign webhook deliveries. */
    webhookSecret: text("webhook_secret"),

    /** { internalRatePlanId: externalRatePlanId, ... } */
    ratePlanMapping: jsonb("rate_plan_mapping").notNull().default(sql`'{}'::jsonb`),
    /** { internalAmenityKey: externalAmenityCode, ... } */
    amenityMapping: jsonb("amenity_mapping").notNull().default(sql`'{}'::jsonb`),
    /** { internalPolicyKey: externalPolicyCode, ... } */
    policyMapping: jsonb("policy_mapping").notNull().default(sql`'{}'::jsonb`),

    lastInventorySyncAt: timestamp("last_inventory_sync_at", { withTimezone: true }),
    lastInventorySyncStatus: text("last_inventory_sync_status"),
    lastInventorySyncError: text("last_inventory_sync_error"),

    lastReservationSyncAt: timestamp("last_reservation_sync_at", { withTimezone: true }),
    lastReservationSyncStatus: text("last_reservation_sync_status"),
    lastReservationSyncError: text("last_reservation_sync_error"),

    /** e.g. 15.00 for Booking.com's typical 15% commission */
    channelCommissionPct: numeric("channel_commission_pct", { precision: 5, scale: 2 }),
    /** 'channel' | 'merchant' | 'hotel_collect' */
    channelPaymentModel: text("channel_payment_model"),

    connectedBy: uuid("connected_by").references(() => appUsers.id, {
      onDelete: "set null",
    }),
    connectedAt: timestamp("connected_at", { withTimezone: true }),
    archivedAt: timestamp("archived_at", { withTimezone: true }),
    archiveReason: text("archive_reason"),

    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("channel_connections_villa_idx").on(t.villaId),
    index("channel_connections_status_idx").on(t.status),
    index("channel_connections_channel_idx").on(t.channel),
  ],
);

// ---------------------------------------------------------------------------
// channel_sync_log
// ---------------------------------------------------------------------------
export const channelSyncLog = pgTable(
  "channel_sync_log",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    channelConnectionId: uuid("channel_connection_id")
      .notNull()
      .references(() => channelConnections.id, { onDelete: "cascade" }),

    /** ChannelSyncType */
    syncType: text("sync_type").notNull(),
    /** ChannelSyncTriggerSource */
    triggerSource: text("trigger_source").notNull(),

    startDate: date("start_date"),
    endDate: date("end_date"),

    recordsProcessed: integer("records_processed").notNull().default(0),
    recordsSucceeded: integer("records_succeeded").notNull().default(0),
    recordsFailed: integer("records_failed").notNull().default(0),

    /** ChannelSyncStatus */
    status: text("status").notNull(),
    errorMessage: text("error_message"),
    errorDetails: jsonb("error_details"),

    durationMs: integer("duration_ms"),
    triggeredAt: timestamp("triggered_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    completedAt: timestamp("completed_at", { withTimezone: true }),

    /** Number of external API calls — DryRun providers set 0. */
    apiCallsCount: integer("api_calls_count").notNull().default(0),

    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("channel_sync_log_connection_idx").on(t.channelConnectionId),
    index("channel_sync_log_status_idx").on(t.status),
    index("channel_sync_log_triggered_idx").on(sql`${t.triggeredAt} DESC`),
  ],
);

// ---------------------------------------------------------------------------
// channel_reservations
// ---------------------------------------------------------------------------
export const channelReservations = pgTable(
  "channel_reservations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    channelConnectionId: uuid("channel_connection_id")
      .notNull()
      .references(() => channelConnections.id, { onDelete: "cascade" }),

    externalReservationId: text("external_reservation_id").notNull(),
    externalStatus: text("external_status"),
    /** Source-of-truth raw payload from the channel — opaque blob. */
    rawPayload: jsonb("raw_payload").notNull(),

    internalBookingId: uuid("internal_booking_id").references(() => bookings.id, {
      onDelete: "set null",
    }),
    internalGuestContactId: uuid("internal_guest_contact_id").references(
      () => contacts.id,
      { onDelete: "set null" },
    ),

    guestFirstName: text("guest_first_name"),
    guestLastName: text("guest_last_name"),
    guestEmail: text("guest_email"),
    guestPhone: text("guest_phone"),
    guestCountry: text("guest_country"),

    checkIn: date("check_in").notNull(),
    checkOut: date("check_out").notNull(),
    numAdults: integer("num_adults"),
    numChildren: integer("num_children"),
    numInfants: integer("num_infants"),

    totalAmountMinor: bigint("total_amount_minor", { mode: "bigint" }),
    currency: text("currency").notNull(),
    channelCommissionMinor: bigint("channel_commission_minor", { mode: "bigint" }),
    taxesMinor: bigint("taxes_minor", { mode: "bigint" }),
    serviceFeesMinor: bigint("service_fees_minor", { mode: "bigint" }),

    paymentStatus: text("payment_status"),
    /** 'channel' | 'hotel' | 'mixed' */
    paymentCollectedBy: text("payment_collected_by"),

    /** ChannelReservationState FSM */
    reservationState: text("reservation_state").notNull().default("received"),

    conflictPending: boolean("conflict_pending").notNull().default(false),
    conflictWithReservationId: uuid("conflict_with_reservation_id"),

    cancellationDate: timestamp("cancellation_date", { withTimezone: true }),
    cancellationReason: text("cancellation_reason"),

    specialRequests: text("special_requests"),
    internalNotes: text("internal_notes"),

    reservationCreatedAt: timestamp("reservation_created_at", {
      withTimezone: true,
    }).notNull(),
    receivedAt: timestamp("received_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    lastModifiedAt: timestamp("last_modified_at", { withTimezone: true }),

    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("channel_reservations_org_idx").on(t.organizationId),
    index("channel_reservations_dates_idx").on(t.checkIn, t.checkOut),
    index("channel_reservations_state_idx").on(t.reservationState),
    index("channel_reservations_received_idx").on(sql`${t.receivedAt} DESC`),
  ],
);

// ---------------------------------------------------------------------------
// channel_commission_records
// ---------------------------------------------------------------------------
export const channelCommissionRecords = pgTable(
  "channel_commission_records",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    channelReservationId: uuid("channel_reservation_id")
      .notNull()
      .references(() => channelReservations.id, { onDelete: "cascade" })
      .unique(),

    commissionAmountMinor: bigint("commission_amount_minor", {
      mode: "bigint",
    }).notNull(),
    commissionCurrency: text("commission_currency").notNull(),

    invoiceReceived: boolean("invoice_received").notNull().default(false),
    invoiceReceivedAt: timestamp("invoice_received_at", { withTimezone: true }),
    invoiceAmountMinor: bigint("invoice_amount_minor", { mode: "bigint" }),
    invoiceReference: text("invoice_reference"),

    paymentMade: boolean("payment_made").notNull().default(false),
    paymentMadeAt: timestamp("payment_made_at", { withTimezone: true }),

    reconciled: boolean("reconciled").notNull().default(false),
    reconciledAt: timestamp("reconciled_at", { withTimezone: true }),

    notes: text("notes"),

    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
);

// ---------------------------------------------------------------------------
// Type exports
// ---------------------------------------------------------------------------
export type ChannelConnection = typeof channelConnections.$inferSelect;
export type NewChannelConnection = typeof channelConnections.$inferInsert;
export type ChannelSyncLogEntry = typeof channelSyncLog.$inferSelect;
export type NewChannelSyncLogEntry = typeof channelSyncLog.$inferInsert;
export type ChannelReservation = typeof channelReservations.$inferSelect;
export type NewChannelReservation = typeof channelReservations.$inferInsert;
export type ChannelCommissionRecord = typeof channelCommissionRecords.$inferSelect;
export type NewChannelCommissionRecord = typeof channelCommissionRecords.$inferInsert;

// ---------------------------------------------------------------------------
// String-union types — kept here so consumers can import without pulling
// the Drizzle table definitions. These mirror the SQL CHECK constraints
// in migrations 0076 + 0077; updates require updating both.
// ---------------------------------------------------------------------------

export type ChannelName =
  | "booking_com"
  | "airbnb"
  | "trip_com"
  | "agoda"
  | "expedia"
  | "vrbo"
  | "hotels_com"
  | "direct";

export const CHANNEL_NAMES: readonly ChannelName[] = [
  "booking_com",
  "airbnb",
  "trip_com",
  "agoda",
  "expedia",
  "vrbo",
  "hotels_com",
  "direct",
] as const;

export type ChannelConnectionStatus =
  | "pending"
  | "connecting"
  | "active"
  | "paused"
  | "error"
  | "archived";

export const CHANNEL_CONNECTION_STATUSES: readonly ChannelConnectionStatus[] = [
  "pending",
  "connecting",
  "active",
  "paused",
  "error",
  "archived",
] as const;

export type ChannelSyncType =
  | "inventory_push"
  | "rates_push"
  | "amenities_push"
  | "reservations_pull"
  | "reservation_status_pull"
  | "webhook_received";

export const CHANNEL_SYNC_TYPES: readonly ChannelSyncType[] = [
  "inventory_push",
  "rates_push",
  "amenities_push",
  "reservations_pull",
  "reservation_status_pull",
  "webhook_received",
] as const;

export type ChannelSyncTriggerSource =
  | "cron"
  | "manual"
  | "webhook"
  | "reservation_event";

export type ChannelSyncStatus =
  | "pending"
  | "running"
  | "success"
  | "partial"
  | "failed";

export type ChannelPaymentModel = "channel" | "merchant" | "hotel_collect";

export type ChannelReservationState =
  | "received"
  | "confirmed"
  | "modified"
  | "cancelled"
  | "no_show"
  | "completed";

export const CHANNEL_RESERVATION_STATES: readonly ChannelReservationState[] = [
  "received",
  "confirmed",
  "modified",
  "cancelled",
  "no_show",
  "completed",
] as const;
