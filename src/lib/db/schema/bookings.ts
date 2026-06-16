import {
  pgTable,
  uuid,
  text,
  timestamp,
  numeric,
  integer,
  date,
  boolean,
  index,
} from "drizzle-orm/pg-core";
import { villas } from "./projects";
import { organizations } from "./saas";

export const bookingChannels = pgTable("booking_channels", {
  id: uuid("id").primaryKey().defaultRandom(),
  key: text("key").notNull().unique(),
  name: text("name").notNull(),
  // type: ota | direct | agent | social | corporate
  type: text("type").notNull().default("ota"),
  // commission_model: percent | fixed | tiered | none
  commissionModel: text("commission_model"),
  defaultCommissionPct: numeric("default_commission_pct", { precision: 6, scale: 3 }),
  status: text("status").notNull().default("active"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const guests = pgTable(
  "guests",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    fullName: text("full_name").notNull(),
    email: text("email"),
    phone: text("phone"),
    nationality: text("nationality"),
    preferredLanguage: text("preferred_language"),
    whatsapp: text("whatsapp"),
    // status: active | archived
    status: text("status").notNull().default("active"),
    /** TENANCY (migration 0176): nullable org anchor, backfilled from the
     *  guest's earliest booking (else ARCONIQUE_DEFAULT). Threaded into
     *  listGuests + the createGuest / channel-manager / direct-booking writers.
     *  Guests have no project/villa FK — this column is their only org link. */
    organizationId: uuid("organization_id").references(() => organizations.id, {
      onDelete: "restrict",
    }),
    /** VIP signal (migration 0175): the guest is VIP across all stays. Read by
     *  the front-office vip-prep monitor; a per-stay override lives on bookings. */
    isVip: boolean("is_vip").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("guests_email_idx").on(t.email),
    index("guests_status_idx").on(t.status),
    index("guests_is_vip_idx").on(t.isVip),
    index("guests_organization_idx").on(t.organizationId),
  ],
);

export const bookings = pgTable(
  "bookings",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    villaId: uuid("villa_id")
      .notNull()
      .references(() => villas.id, { onDelete: "restrict" }),
    // TENANCY (migration 0149 add + backfill; 0155 NOT NULL cutover):
    // org anchor backfilled via villa -> project.organization_id; threaded
    // through every insert + the primary list/detail reads (thread-ops).
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id),
    guestId: uuid("guest_id").references(() => guests.id, { onDelete: "set null" }),
    channelId: uuid("channel_id").references(() => bookingChannels.id, {
      onDelete: "set null",
    }),
    bookingCode: text("booking_code").notNull().unique(),
    sourceReference: text("source_reference"),
    // status: inquiry | tentative | confirmed | checked_in | checked_out | cancelled | no_show
    status: text("status").notNull().default("confirmed"),
    checkIn: date("check_in").notNull(),
    checkOut: date("check_out").notNull(),
    nights: integer("nights").notNull(),
    adults: integer("adults"),
    children: integer("children"),
    currency: text("currency").notNull().default("USD"),
    grossAmount: numeric("gross_amount", { precision: 14, scale: 2 }).notNull(),
    cleaningFeeAmount: numeric("cleaning_fee_amount", { precision: 14, scale: 2 })
      .notNull()
      .default("0"),
    channelFeeAmount: numeric("channel_fee_amount", { precision: 14, scale: 2 })
      .notNull()
      .default("0"),
    paymentFeeAmount: numeric("payment_fee_amount", { precision: 14, scale: 2 })
      .notNull()
      .default("0"),
    netExpectedAmount: numeric("net_expected_amount", { precision: 14, scale: 2 }),
    notes: text("notes"),
    /** Per-stay VIP override (migration 0175), tri-state: NULL = inherit the
     *  guest flag; true = flag this stay; false = exclude this stay. */
    isVip: boolean("is_vip"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("bookings_villa_idx").on(t.villaId, t.checkIn),
    index("bookings_status_idx").on(t.status),
    index("bookings_channel_idx").on(t.channelId),
    index("bookings_organization_idx").on(t.organizationId),
    // PERF: dashboard KPI/aggregate queries filter org + status + a check-in
    // range together; the single-column org index forces a separate scan/sort.
    index("bookings_org_status_checkin_idx").on(
      t.organizationId,
      t.status,
      t.checkIn,
    ),
    index("bookings_org_checkin_idx").on(t.organizationId, t.checkIn),
    index("bookings_is_vip_idx").on(t.isVip),
    // PERF (0181): the statement-generator occupancy pull + per-villa
    // portfolio subqueries filter villa_id + status IN (...) + a check_in
    // range. bookings_villa_idx (villa_id, check_in) lacks the status leg.
    index("bookings_villa_status_checkin_idx").on(
      t.villaId,
      t.status,
      t.checkIn,
    ),
  ],
);

export type BookingChannel = typeof bookingChannels.$inferSelect;
export type NewBookingChannel = typeof bookingChannels.$inferInsert;
export type Guest = typeof guests.$inferSelect;
export type NewGuest = typeof guests.$inferInsert;
export type Booking = typeof bookings.$inferSelect;
export type NewBooking = typeof bookings.$inferInsert;
