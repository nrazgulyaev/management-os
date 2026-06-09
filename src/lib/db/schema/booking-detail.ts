import {
  pgTable,
  uuid,
  text,
  timestamp,
  integer,
  numeric,
  date,
  boolean,
  index,
} from "drizzle-orm/pg-core";
import { bookings } from "./bookings";
import { organizations } from "./saas";

/**
 * Booking-detail data layer (migration 0120).
 *
 * The booking detail surface needs richer, per-booking structure than the
 * single `bookings` row + the global 1:1 `guests` record can express: the
 * full named party (adults, children, IDs), an itemised charge ledger, the
 * card/Stripe settlement, and free-text requirements + channel-sync counters.
 * Each table is keyed by `booking_id` and is read-only-optional — the detail
 * page degrades gracefully when a booking has no rows.
 */

/** Named party members on a booking (beyond the single lead `guests` row). */
export const bookingGuests = pgTable(
  "booking_guests",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    bookingId: uuid("booking_id")
      .notNull()
      .references(() => bookings.id, { onDelete: "cascade" }),
    // TENANCY (migration 0149): nullable org anchor, backfilled via booking.
    organizationId: uuid("organization_id").references(() => organizations.id),
    fullName: text("full_name").notNull(),
    // role: primary | accompanying | child
    role: text("role").notNull().default("accompanying"),
    // kind: adult | child
    kind: text("kind").notNull().default("adult"),
    isLeadBooker: boolean("is_lead_booker").notNull().default(false),
    /** e.g. "EV-07" → renders "OWNER OF EV-07". */
    ownerVillaCode: text("owner_villa_code"),
    ageYears: integer("age_years"),
    email: text("email"),
    phone: text("phone"),
    nationality: text("nationality"),
    // id_type: passport | kitas | ktp
    idType: text("id_type"),
    idLast4: text("id_last4"),
    idVerified: boolean("id_verified").notNull().default(false),
    sortOrder: integer("sort_order").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("booking_guests_booking_idx").on(t.bookingId),
    index("booking_guests_organization_idx").on(t.organizationId),
  ],
);

/** Itemised charge ledger (TYPE / DESCRIPTION / DATE / AMOUNT). */
export const bookingCharges = pgTable(
  "booking_charges",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    bookingId: uuid("booking_id")
      .notNull()
      .references(() => bookings.id, { onDelete: "cascade" }),
    // TENANCY (migration 0149): nullable org anchor, backfilled via booking.
    organizationId: uuid("organization_id").references(() => organizations.id),
    // charge_type: nightly | service | fee | tax | discount
    chargeType: text("charge_type").notNull(),
    description: text("description").notNull(),
    /** Signed: + for charges, − for fees / refunds. */
    amount: numeric("amount", { precision: 16, scale: 2 }).notNull(),
    currency: text("currency").notNull().default("IDR"),
    /** Right-aligned annotation, e.g. "BASE" | "Refund". */
    note: text("note"),
    occurredOn: date("occurred_on"),
    sortOrder: integer("sort_order").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("booking_charges_booking_idx").on(t.bookingId),
    index("booking_charges_organization_idx").on(t.organizationId),
  ],
);

/** Card / Stripe settlement for a booking. */
export const bookingPayments = pgTable(
  "booking_payments",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    bookingId: uuid("booking_id")
      .notNull()
      .references(() => bookings.id, { onDelete: "cascade" }),
    // TENANCY (migration 0149): nullable org anchor, backfilled via booking.
    organizationId: uuid("organization_id").references(() => organizations.id),
    // provider: stripe | manual | bank
    provider: text("provider").notNull().default("stripe"),
    providerPaymentId: text("provider_payment_id"),
    // method: card | bank | cash
    method: text("method"),
    cardBrand: text("card_brand"),
    cardLast4: text("card_last4"),
    amount: numeric("amount", { precision: 16, scale: 2 }),
    currency: text("currency").notNull().default("IDR"),
    // status: captured | pending | refunded | failed
    status: text("status").notNull().default("captured"),
    capturedAt: timestamp("captured_at", { withTimezone: true }),
    captureNote: text("capture_note"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("booking_payments_booking_idx").on(t.bookingId),
    index("booking_payments_organization_idx").on(t.organizationId),
  ],
);

/** 1:1 booking extras — special requirements + channel-sync counters. */
export const bookingMeta = pgTable(
  "booking_meta",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    bookingId: uuid("booking_id")
      .notNull()
      .unique()
      .references(() => bookings.id, { onDelete: "cascade" }),
    // TENANCY (migration 0149): nullable org anchor, backfilled via booking.
    organizationId: uuid("organization_id").references(() => organizations.id),
    dietary: text("dietary"),
    mobility: text("mobility"),
    opsNotes: text("ops_notes"),
    syncMessagesAutoReplied: integer("sync_messages_auto_replied").notNull().default(0),
    syncMessagesRouted: integer("sync_messages_routed").notNull().default(0),
    syncLastAt: timestamp("sync_last_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("booking_meta_organization_idx").on(t.organizationId)],
);
