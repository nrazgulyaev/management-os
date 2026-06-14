import {
  pgTable,
  uuid,
  text,
  timestamp,
  integer,
  boolean,
  bigint,
  date,
  jsonb,
  index,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { appUsers } from "./identity";
import { projects, villas } from "./projects";
import { bookings, guests } from "./bookings";
import { pricingQuoteLogs } from "./dynamic-pricing";
import { organizations } from "./saas";

/**
 * Prompt 105 — Direct Booking Hold & Checkout Stub.
 *
 * Five tables back the no-payment direct-booking flow. Holds are
 * temporary inventory locks; requests are guest-submitted forms;
 * events are the append-only timeline; rate-limits gate public abuse;
 * expiry runs record what the cron job did.
 */

export const directBookingHolds = pgTable(
  "direct_booking_holds",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    // TENANCY (0153): nullable org anchor + backfill. No threading yet.
    organizationId: uuid("organization_id").references(() => organizations.id, {
      onDelete: "restrict",
    }),
    holdCode: text("hold_code").notNull().unique(),
    holdTokenHash: text("hold_token_hash").notNull().unique(),
    tokenPrefix: text("token_prefix").notNull(),
    villaId: uuid("villa_id")
      .notNull()
      .references(() => villas.id, { onDelete: "cascade" }),
    projectId: uuid("project_id").references(() => projects.id, {
      onDelete: "set null",
    }),
    quoteLogId: uuid("quote_log_id").references(() => pricingQuoteLogs.id, {
      onDelete: "set null",
    }),
    checkIn: date("check_in").notNull(),
    checkOut: date("check_out").notNull(),
    nights: integer("nights").notNull(),
    guestCount: integer("guest_count").notNull().default(1),
    channelKey: text("channel_key").notNull().default("direct"),
    currency: text("currency").notNull(),
    totalMinor: bigint("total_minor", { mode: "bigint" }).notNull(),
    averageNightlyMinor: bigint("average_nightly_minor", {
      mode: "bigint",
    }).notNull(),
    quoteSnapshotJson: jsonb("quote_snapshot_json").notNull(),
    status: text("status").notNull().default("active"),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    convertedBookingId: uuid("converted_booking_id").references(
      () => bookings.id,
      { onDelete: "set null" },
    ),
    sourceIpHash: text("source_ip_hash"),
    userAgentHash: text("user_agent_hash"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("direct_booking_holds_villa_dates_idx").on(
      t.villaId,
      t.checkIn,
      t.checkOut,
    ),
    index("direct_booking_holds_status_expires_idx").on(t.status, t.expiresAt),
    index("direct_booking_holds_token_prefix_idx").on(t.tokenPrefix),
    index("direct_booking_holds_org_idx").on(t.organizationId),
  ],
);

export const directBookingRequests = pgTable(
  "direct_booking_requests",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    // TENANCY (0153): nullable org anchor + backfill. No threading yet.
    organizationId: uuid("organization_id").references(() => organizations.id, {
      onDelete: "restrict",
    }),
    requestCode: text("request_code").notNull().unique(),
    holdId: uuid("hold_id")
      .notNull()
      .references(() => directBookingHolds.id, { onDelete: "cascade" }),
    villaId: uuid("villa_id")
      .notNull()
      .references(() => villas.id, { onDelete: "cascade" }),
    projectId: uuid("project_id").references(() => projects.id, {
      onDelete: "set null",
    }),
    guestId: uuid("guest_id").references(() => guests.id, {
      onDelete: "set null",
    }),
    bookingId: uuid("booking_id").references(() => bookings.id, {
      onDelete: "set null",
    }),
    guestFirstName: text("guest_first_name").notNull(),
    guestLastName: text("guest_last_name"),
    guestEmail: text("guest_email").notNull(),
    guestPhone: text("guest_phone"),
    guestCountry: text("guest_country"),
    guestCount: integer("guest_count").notNull(),
    specialRequests: text("special_requests"),
    arrivalTime: text("arrival_time"),
    purposeOfStay: text("purpose_of_stay"),
    marketingConsent: boolean("marketing_consent").notNull().default(false),
    termsAccepted: boolean("terms_accepted").notNull().default(false),
    status: text("status").notNull().default("submitted"),
    decisionNote: text("decision_note"),
    reviewedBy: uuid("reviewed_by").references(() => appUsers.id, {
      onDelete: "set null",
    }),
    reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
    expiresAt: timestamp("expires_at", { withTimezone: true }),
    // Prompt 107 — finance bridge mirror.
    financeBridgeStatus: text("finance_bridge_status")
      .notNull()
      .default("pending"),
    /** Soft FK to direct_booking_finance_links.id. Drizzle does NOT
     *  model the back-reference here to avoid a circular import; the
     *  migration installs the FK constraint at the SQL layer. */
    financeLinkId: uuid("finance_link_id"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("direct_booking_requests_status_idx").on(
      t.status,
      sql`${t.createdAt} DESC`,
    ),
    index("direct_booking_requests_email_idx").on(t.guestEmail),
    index("direct_booking_requests_hold_idx").on(t.holdId),
    index("direct_booking_requests_finance_bridge_idx").on(
      t.financeBridgeStatus,
    ),
    index("direct_booking_requests_org_idx").on(t.organizationId),
    // PERF: the admin inbox lists this org's requests by status, newest first.
    index("direct_booking_requests_org_status_created_idx").on(
      t.organizationId,
      t.status,
      sql`${t.createdAt} DESC`,
    ),
  ],
);

export const directBookingRequestEvents = pgTable(
  "direct_booking_request_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    // TENANCY (0153): nullable org anchor + backfill. No threading yet.
    organizationId: uuid("organization_id").references(() => organizations.id, {
      onDelete: "restrict",
    }),
    requestId: uuid("request_id")
      .notNull()
      .references(() => directBookingRequests.id, { onDelete: "cascade" }),
    eventType: text("event_type").notNull(),
    actorType: text("actor_type").notNull(),
    actorUserId: uuid("actor_user_id").references(() => appUsers.id, {
      onDelete: "set null",
    }),
    message: text("message"),
    metadataJson: jsonb("metadata_json"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("direct_booking_request_events_request_idx").on(
      t.requestId,
      sql`${t.createdAt} DESC`,
    ),
    index("direct_booking_request_events_type_idx").on(t.eventType),
    index("direct_booking_request_events_org_idx").on(t.organizationId),
  ],
);

export const directBookingHoldRateLimits = pgTable(
  "direct_booking_hold_rate_limits",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    // TENANCY (0153): nullable org anchor + backfill. No threading yet.
    organizationId: uuid("organization_id").references(() => organizations.id, {
      onDelete: "restrict",
    }),
    ipHash: text("ip_hash").notNull(),
    windowStart: timestamp("window_start", { withTimezone: true }).notNull(),
    holdCount: integer("hold_count").notNull().default(0),
    blockedUntil: timestamp("blocked_until", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    uniqueIndex("direct_booking_hold_rate_limits_ip_window_unique").on(
      t.ipHash,
      t.windowStart,
    ),
    index("direct_booking_hold_rate_limits_blocked_idx").on(t.blockedUntil),
    index("direct_booking_hold_rate_limits_org_idx").on(t.organizationId),
  ],
);

export const directBookingExpiryRuns = pgTable(
  "direct_booking_expiry_runs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    // TENANCY (0153): nullable org anchor + backfill. No threading yet.
    organizationId: uuid("organization_id").references(() => organizations.id, {
      onDelete: "restrict",
    }),
    runCode: text("run_code").notNull().unique(),
    expiredHoldsCount: integer("expired_holds_count").notNull().default(0),
    expiredRequestsCount: integer("expired_requests_count")
      .notNull()
      .default(0),
    releasedBlocksCount: integer("released_blocks_count").notNull().default(0),
    startedAt: timestamp("started_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    finishedAt: timestamp("finished_at", { withTimezone: true }),
    status: text("status").notNull().default("running"),
    errorMessage: text("error_message"),
  },
  (t) => [
    index("direct_booking_expiry_runs_status_idx").on(
      t.status,
      sql`${t.startedAt} DESC`,
    ),
    index("direct_booking_expiry_runs_org_idx").on(t.organizationId),
  ],
);

export type DirectBookingHold = typeof directBookingHolds.$inferSelect;
export type NewDirectBookingHold = typeof directBookingHolds.$inferInsert;
export type DirectBookingRequest = typeof directBookingRequests.$inferSelect;
export type NewDirectBookingRequest =
  typeof directBookingRequests.$inferInsert;
export type DirectBookingRequestEvent =
  typeof directBookingRequestEvents.$inferSelect;
export type NewDirectBookingRequestEvent =
  typeof directBookingRequestEvents.$inferInsert;
export type DirectBookingHoldRateLimit =
  typeof directBookingHoldRateLimits.$inferSelect;
export type NewDirectBookingHoldRateLimit =
  typeof directBookingHoldRateLimits.$inferInsert;
export type DirectBookingExpiryRun =
  typeof directBookingExpiryRuns.$inferSelect;
export type NewDirectBookingExpiryRun =
  typeof directBookingExpiryRuns.$inferInsert;
