import {
  pgTable,
  uuid,
  text,
  timestamp,
  integer,
  boolean,
  bigint,
  date,
  index,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { appUsers } from "./identity";
import { bookings } from "./bookings";
import {
  directBookingHolds,
  directBookingRequests,
} from "./direct-booking";
import { directBookingDeposits } from "./payments";

/**
 * Prompt 109 — Guest Booking Notifications + Guest Status Center.
 *
 * Four token-scoped, RLS-forced internal-only tables.  Guests reach
 * these tables only through token-bound server actions — there is
 * intentionally no public RLS policy.  Every column the guest sees
 * goes through the redaction seam in
 * `src/features/direct-booking/guest-status-pure.ts` /
 * `guest-messages-pure.ts`.
 */

export const directBookingGuestNotifications = pgTable(
  "direct_booking_guest_notifications",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    holdId: uuid("hold_id").references(() => directBookingHolds.id, {
      onDelete: "set null",
    }),
    requestId: uuid("request_id").references(() => directBookingRequests.id, {
      onDelete: "set null",
    }),
    depositId: uuid("deposit_id").references(() => directBookingDeposits.id, {
      onDelete: "set null",
    }),
    bookingId: uuid("booking_id").references(() => bookings.id, {
      onDelete: "set null",
    }),
    notificationKey: text("notification_key").notNull(),
    publicTitle: text("public_title").notNull(),
    publicBody: text("public_body").notNull(),
    publicActionLabel: text("public_action_label"),
    publicActionHref: text("public_action_href"),
    severity: text("severity").notNull().default("info"),
    status: text("status").notNull().default("unread"),
    dedupeKey: text("dedupe_key").notNull(),
    visibleFrom: timestamp("visible_from", { withTimezone: true })
      .notNull()
      .defaultNow(),
    readAt: timestamp("read_at", { withTimezone: true }),
    archivedAt: timestamp("archived_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("direct_booking_guest_notifications_hold_idx").on(
      t.holdId,
      sql`${t.createdAt} DESC`,
    ),
    index("direct_booking_guest_notifications_request_idx").on(
      t.requestId,
      sql`${t.createdAt} DESC`,
    ),
    index("direct_booking_guest_notifications_deposit_idx").on(
      t.depositId,
      sql`${t.createdAt} DESC`,
    ),
    index("direct_booking_guest_notifications_booking_idx").on(
      t.bookingId,
      sql`${t.createdAt} DESC`,
    ),
    index("direct_booking_guest_notifications_status_idx").on(t.status),
    index("direct_booking_guest_notifications_key_idx").on(t.notificationKey),
    index("direct_booking_guest_notifications_severity_idx").on(t.severity),
    uniqueIndex("direct_booking_guest_notifications_dedupe_unique").on(
      t.dedupeKey,
    ),
  ],
);

export const directBookingGuestStatusSnapshots = pgTable(
  "direct_booking_guest_status_snapshots",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    holdId: uuid("hold_id")
      .notNull()
      .references(() => directBookingHolds.id, { onDelete: "cascade" }),
    requestId: uuid("request_id").references(() => directBookingRequests.id, {
      onDelete: "set null",
    }),
    depositId: uuid("deposit_id").references(() => directBookingDeposits.id, {
      onDelete: "set null",
    }),
    bookingId: uuid("booking_id").references(() => bookings.id, {
      onDelete: "set null",
    }),
    publicStage: text("public_stage").notNull(),
    headline: text("headline").notNull(),
    body: text("body").notNull(),
    nextActionLabel: text("next_action_label"),
    nextActionHref: text("next_action_href"),
    guestCanAct: boolean("guest_can_act").notNull().default(false),
    holdExpiresAt: timestamp("hold_expires_at", { withTimezone: true }),
    depositExpiresAt: timestamp("deposit_expires_at", { withTimezone: true }),
    totalAmountMinor: bigint("total_amount_minor", { mode: "bigint" }),
    depositAmountMinor: bigint("deposit_amount_minor", { mode: "bigint" }),
    balanceDueMinor: bigint("balance_due_minor", { mode: "bigint" }),
    currency: text("currency"),
    villaLabel: text("villa_label"),
    checkIn: date("check_in"),
    checkOut: date("check_out"),
    nights: integer("nights"),
    guestCount: integer("guest_count"),
    sourceUpdatedAt: timestamp("source_updated_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    uniqueIndex("direct_booking_guest_status_snapshots_hold_unique").on(
      t.holdId,
    ),
    index("direct_booking_guest_status_snapshots_request_idx").on(t.requestId),
    index("direct_booking_guest_status_snapshots_deposit_idx").on(t.depositId),
    index("direct_booking_guest_status_snapshots_booking_idx").on(t.bookingId),
    index("direct_booking_guest_status_snapshots_stage_idx").on(t.publicStage),
  ],
);

export const directBookingGuestMessageThreads = pgTable(
  "direct_booking_guest_message_threads",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    holdId: uuid("hold_id").references(() => directBookingHolds.id, {
      onDelete: "set null",
    }),
    requestId: uuid("request_id").references(() => directBookingRequests.id, {
      onDelete: "set null",
    }),
    bookingId: uuid("booking_id").references(() => bookings.id, {
      onDelete: "set null",
    }),
    status: text("status").notNull().default("open"),
    guestUnreadCount: integer("guest_unread_count").notNull().default(0),
    staffUnreadCount: integer("staff_unread_count").notNull().default(0),
    lastGuestMessageAt: timestamp("last_guest_message_at", {
      withTimezone: true,
    }),
    lastStaffMessageAt: timestamp("last_staff_message_at", {
      withTimezone: true,
    }),
    lastMessageAt: timestamp("last_message_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("direct_booking_guest_message_threads_hold_idx").on(t.holdId),
    index("direct_booking_guest_message_threads_request_idx").on(t.requestId),
    index("direct_booking_guest_message_threads_booking_idx").on(t.bookingId),
    index("direct_booking_guest_message_threads_status_idx").on(t.status),
    index("direct_booking_guest_message_threads_last_msg_idx").on(
      sql`${t.lastMessageAt} DESC`,
    ),
    uniqueIndex("direct_booking_guest_message_threads_request_unique")
      .on(t.requestId)
      .where(sql`${t.requestId} IS NOT NULL`),
  ],
);

export const directBookingGuestMessages = pgTable(
  "direct_booking_guest_messages",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    threadId: uuid("thread_id")
      .notNull()
      .references(() => directBookingGuestMessageThreads.id, {
        onDelete: "cascade",
      }),
    authorType: text("author_type").notNull(),
    body: text("body").notNull(),
    bodyRedacted: text("body_redacted").notNull(),
    visibility: text("visibility").notNull().default("guest_visible"),
    statusSnapshot: text("status_snapshot"),
    readByGuestAt: timestamp("read_by_guest_at", { withTimezone: true }),
    readByStaffAt: timestamp("read_by_staff_at", { withTimezone: true }),
    createdByAppUserId: uuid("created_by_app_user_id").references(
      () => appUsers.id,
      { onDelete: "set null" },
    ),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("direct_booking_guest_messages_thread_idx").on(
      t.threadId,
      sql`${t.createdAt} DESC`,
    ),
    index("direct_booking_guest_messages_author_idx").on(t.authorType),
    index("direct_booking_guest_messages_visibility_idx").on(t.visibility),
  ],
);

export type DirectBookingGuestNotification =
  typeof directBookingGuestNotifications.$inferSelect;
export type NewDirectBookingGuestNotification =
  typeof directBookingGuestNotifications.$inferInsert;
export type DirectBookingGuestStatusSnapshot =
  typeof directBookingGuestStatusSnapshots.$inferSelect;
export type NewDirectBookingGuestStatusSnapshot =
  typeof directBookingGuestStatusSnapshots.$inferInsert;
export type DirectBookingGuestMessageThread =
  typeof directBookingGuestMessageThreads.$inferSelect;
export type NewDirectBookingGuestMessageThread =
  typeof directBookingGuestMessageThreads.$inferInsert;
export type DirectBookingGuestMessage =
  typeof directBookingGuestMessages.$inferSelect;
export type NewDirectBookingGuestMessage =
  typeof directBookingGuestMessages.$inferInsert;
