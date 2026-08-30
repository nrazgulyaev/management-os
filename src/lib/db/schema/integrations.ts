import {
  pgTable,
  uuid,
  text,
  timestamp,
  boolean,
  integer,
  date,
  jsonb,
  index,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { appUsers } from "./identity";
import { projects, villas } from "./projects";
import { bookingChannels, bookings } from "./bookings";
import { operationTasks } from "./operations";
import { taskMaterialUsage } from "./inventory";
import { inventoryMovements } from "./inventory";
import { expenseLines } from "./finance";
import { organizations } from "./saas";

/**
 * v6 — Booking channels calendar sync, automation, and finance bridge.
 * See docs/ADR-0008 + drizzle/0007_booking_channels_calendar_sync_automation.sql
 *
 * NOTE: feed URLs may carry vendor secrets (Airbnb iCal URLs are unguessable).
 * RLS on `channel_calendar_feeds` is internal-only — never expose raw URLs to
 * owners or guests via PostgREST.
 */

export const channelCalendarFeeds = pgTable(
  "channel_calendar_feeds",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    bookingChannelId: uuid("booking_channel_id").references(
      () => bookingChannels.id,
      { onDelete: "set null" },
    ),
    villaId: uuid("villa_id")
      .notNull()
      .references(() => villas.id, { onDelete: "cascade" }),
    projectId: uuid("project_id").references(() => projects.id, {
      onDelete: "set null",
    }),
    /** TENANCY (migration 0154): nullable org anchor, backfilled via
     *  villa → project.organization_id (else feed.project_id). Not threaded yet. */
    organizationId: uuid("organization_id").references(() => organizations.id, {
      onDelete: "restrict",
    }),
    feedName: text("feed_name").notNull(),
    feedUrl: text("feed_url").notNull(),
    feedType: text("feed_type").notNull().default("ical"),
    status: text("status").notNull().default("active"),
    lastSyncedAt: timestamp("last_synced_at", { withTimezone: true }),
    lastSuccessAt: timestamp("last_success_at", { withTimezone: true }),
    lastErrorAt: timestamp("last_error_at", { withTimezone: true }),
    lastError: text("last_error"),
    syncIntervalMinutes: integer("sync_interval_minutes").notNull().default(180),
    createdBy: uuid("created_by").references(() => appUsers.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("ccf_villa_idx").on(t.villaId),
    index("ccf_status_idx").on(t.status),
    index("ccf_channel_idx").on(t.bookingChannelId),
    index("channel_calendar_feeds_organization_idx").on(t.organizationId),
  ],
);

export const channelCalendarEvents = pgTable(
  "channel_calendar_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    feedId: uuid("feed_id")
      .notNull()
      .references(() => channelCalendarFeeds.id, { onDelete: "cascade" }),
    /** TENANCY (migration 0154): nullable org anchor, backfilled via
     *  feed → channel_calendar_feeds.organization_id. Not threaded yet. */
    organizationId: uuid("organization_id").references(() => organizations.id, {
      onDelete: "restrict",
    }),
    externalUid: text("external_uid").notNull(),
    externalSummary: text("external_summary"),
    externalDescription: text("external_description"),
    externalLocation: text("external_location"),
    checkIn: date("check_in").notNull(),
    checkOut: date("check_out").notNull(),
    status: text("status").notNull().default("active"),
    rawIcs: jsonb("raw_ics"),
    bookingId: uuid("booking_id").references(() => bookings.id, { onDelete: "set null" }),
    conflictStatus: text("conflict_status").notNull().default("none"),
    conflictNotes: text("conflict_notes"),
    firstSeenAt: timestamp("first_seen_at", { withTimezone: true }).notNull().defaultNow(),
    lastSeenAt: timestamp("last_seen_at", { withTimezone: true }).notNull().defaultNow(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("cce_feed_uid_unique").on(t.feedId, t.externalUid),
    index("cce_feed_idx").on(t.feedId),
    index("cce_booking_idx").on(t.bookingId),
    index("cce_dates_idx").on(t.checkIn, t.checkOut),
    index("cce_status_idx").on(t.status),
    index("channel_calendar_events_organization_idx").on(t.organizationId),
  ],
);

export const bookingConflicts = pgTable(
  "booking_conflicts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    villaId: uuid("villa_id")
      .notNull()
      .references(() => villas.id, { onDelete: "cascade" }),
    bookingId: uuid("booking_id").references(() => bookings.id, { onDelete: "cascade" }),
    calendarEventId: uuid("calendar_event_id").references(
      () => channelCalendarEvents.id,
      { onDelete: "cascade" },
    ),
    /** TENANCY (migration 0154): nullable org anchor, backfilled via
     *  villa → project.organization_id. Not threaded yet. */
    organizationId: uuid("organization_id").references(() => organizations.id, {
      onDelete: "restrict",
    }),
    conflictType: text("conflict_type").notNull(),
    severity: text("severity").notNull().default("warning"),
    description: text("description").notNull(),
    status: text("status").notNull().default("open"),
    resolvedBy: uuid("resolved_by").references(() => appUsers.id, { onDelete: "set null" }),
    resolvedAt: timestamp("resolved_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("bc_villa_idx").on(t.villaId),
    index("bc_status_idx").on(t.status),
    index("bc_booking_idx").on(t.bookingId),
    index("booking_conflicts_organization_idx").on(t.organizationId),
  ],
);

export const bookingAutomationRules = pgTable(
  "booking_automation_rules",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    projectId: uuid("project_id").references(() => projects.id, { onDelete: "cascade" }),
    villaId: uuid("villa_id").references(() => villas.id, { onDelete: "cascade" }),
    /** TENANCY (migration 0154): nullable org anchor, backfilled via
     *  project (else villa → project).organization_id. Not threaded yet. */
    organizationId: uuid("organization_id").references(() => organizations.id, {
      onDelete: "restrict",
    }),
    ruleName: text("rule_name").notNull(),
    triggerEvent: text("trigger_event").notNull(),
    taskCategory: text("task_category").notNull(),
    taskTypeKey: text("task_type_key"),
    checklistTemplateKey: text("checklist_template_key"),
    titleTemplate: text("title_template").notNull(),
    dueOffsetMinutes: integer("due_offset_minutes").notNull().default(0),
    assignedRole: text("assigned_role"),
    assignedTo: uuid("assigned_to").references(() => appUsers.id, { onDelete: "set null" }),
    priority: text("priority").notNull().default("normal"),
    status: text("status").notNull().default("active"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("bar_status_idx").on(t.status),
    index("bar_trigger_idx").on(t.triggerEvent),
    index("bar_villa_idx").on(t.villaId),
    index("bar_project_idx").on(t.projectId),
    index("booking_automation_rules_organization_idx").on(t.organizationId),
  ],
);

export const bookingAutomationRuns = pgTable(
  "booking_automation_runs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    bookingId: uuid("booking_id")
      .notNull()
      .references(() => bookings.id, { onDelete: "cascade" }),
    ruleId: uuid("rule_id").references(() => bookingAutomationRules.id, {
      onDelete: "set null",
    }),
    taskId: uuid("task_id").references(() => operationTasks.id, { onDelete: "set null" }),
    /** TENANCY (migration 0154): nullable org anchor, backfilled via
     *  booking → bookings.organization_id. Not threaded yet. */
    organizationId: uuid("organization_id").references(() => organizations.id, {
      onDelete: "restrict",
    }),
    runStatus: text("run_status").notNull().default("created"),
    reason: text("reason"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("bar_run_booking_idx").on(t.bookingId),
    index("booking_automation_runs_organization_idx").on(t.organizationId),
  ],
);

export const financeMaterialUsageLinks = pgTable(
  "finance_material_usage_links",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    taskMaterialUsageId: uuid("task_material_usage_id")
      .notNull()
      .references(() => taskMaterialUsage.id, { onDelete: "cascade" }),
    inventoryMovementId: uuid("inventory_movement_id").references(
      () => inventoryMovements.id,
      { onDelete: "set null" },
    ),
    expenseLineId: uuid("expense_line_id").references(() => expenseLines.id, {
      onDelete: "set null",
    }),
    bookingId: uuid("booking_id").references(() => bookings.id, { onDelete: "set null" }),
    villaId: uuid("villa_id").references(() => villas.id, { onDelete: "set null" }),
    projectId: uuid("project_id").references(() => projects.id, { onDelete: "set null" }),
    /** TENANCY (migration 0154): nullable org anchor, backfilled via
     *  villa/project/booking → organization_id. Not threaded yet. */
    organizationId: uuid("organization_id").references(() => organizations.id, {
      onDelete: "restrict",
    }),
    ownerChargeable: boolean("owner_chargeable").notNull().default(true),
    status: text("status").notNull().default("pending"),
    reason: text("reason"),
    createdBy: uuid("created_by").references(() => appUsers.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("fmul_usage_unique").on(t.taskMaterialUsageId),
    index("fmul_status_idx").on(t.status),
    index("fmul_expense_idx").on(t.expenseLineId),
    index("finance_material_usage_links_organization_idx").on(t.organizationId),
  ],
);

/**
 * ICAL-EXPORT-1 (migration 0187) — outbound iCal feed tokens, one ACTIVE per
 * villa (partial unique index lives in SQL). Capability-URL model mirroring
 * guest_stay_tokens: only the SHA-256 hash + 8-char display prefix persist;
 * the raw token is shown once at generate/rotate. The public route
 * /api/ical/[token] resolves by hash and serves the villa's blocking events
 * so OTAs can import availability FROM us (we could only import before).
 */
export const villaIcalExportTokens = pgTable(
  "villa_ical_export_tokens",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    villaId: uuid("villa_id")
      .notNull()
      .references(() => villas.id, { onDelete: "cascade" }),
    tokenHash: text("token_hash").notNull().unique(),
    tokenPrefix: text("token_prefix").notNull(),
    isActive: boolean("is_active").notNull().default(true),
    createdBy: uuid("created_by").references(() => appUsers.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    rotatedAt: timestamp("rotated_at", { withTimezone: true }),
    lastAccessedAt: timestamp("last_accessed_at", { withTimezone: true }),
    accessCount: integer("access_count").notNull().default(0),
  },
  (t) => [index("villa_ical_export_tokens_org_idx").on(t.organizationId)],
);

export type ChannelCalendarFeed = typeof channelCalendarFeeds.$inferSelect;
export type ChannelCalendarEvent = typeof channelCalendarEvents.$inferSelect;
export type BookingConflict = typeof bookingConflicts.$inferSelect;
export type BookingAutomationRule = typeof bookingAutomationRules.$inferSelect;
export type BookingAutomationRun = typeof bookingAutomationRuns.$inferSelect;
export type FinanceMaterialUsageLink = typeof financeMaterialUsageLinks.$inferSelect;
export type VillaIcalExportToken = typeof villaIcalExportTokens.$inferSelect;
