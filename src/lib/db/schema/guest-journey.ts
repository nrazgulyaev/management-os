import {
  pgTable,
  uuid,
  text,
  timestamp,
  integer,
  boolean,
  jsonb,
  index,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { appUsers } from "./identity";
import { projects, villas } from "./projects";
import { bookings, guests } from "./bookings";
import { guestStayTokens } from "./guest-stays";
import { guestServices } from "./guest-services";
import { notificationQueue } from "./notifications";

/**
 * Prompt 102 — Guest Journey Automation.
 *
 * Five reporting / orchestration tables. The canonical sources stay
 * where they are; these tables drive the deterministic journey rule
 * engine + guest-visible suggestions feed + post-stay review request
 * tracking.
 *
 * Owner reads NEVER hit these tables directly — they go through
 * `owner_visible_events` (Prompt 101) which is rebuilt from the
 * subset of `guest_journey_events` flagged `owner_visible=true`.
 */

export const guestJourneyRules = pgTable(
  "guest_journey_rules",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    ruleKey: text("rule_key").notNull().unique(),
    name: text("name").notNull(),
    description: text("description"),
    journeyStage: text("journey_stage").notNull(),
    triggerAnchor: text("trigger_anchor").notNull(),
    offsetMinutes: integer("offset_minutes").notNull().default(0),
    channel: text("channel").notNull().default("in_app"),
    templateKey: text("template_key"),
    suggestionType: text("suggestion_type"),
    serviceId: uuid("service_id").references(() => guestServices.id, {
      onDelete: "set null",
    }),
    villaId: uuid("villa_id").references(() => villas.id, {
      onDelete: "set null",
    }),
    projectId: uuid("project_id").references(() => projects.id, {
      onDelete: "set null",
    }),
    appliesToChannel: text("applies_to_channel"),
    conditionsJson: jsonb("conditions_json"),
    payloadJson: jsonb("payload_json"),
    priority: text("priority").notNull().default("normal"),
    status: text("status").notNull().default("active"),
    createdBy: uuid("created_by").references(() => appUsers.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("guest_journey_rules_status_idx").on(t.status),
    index("guest_journey_rules_stage_idx").on(t.journeyStage),
    index("guest_journey_rules_anchor_idx").on(t.triggerAnchor),
    index("guest_journey_rules_villa_idx").on(t.villaId),
    index("guest_journey_rules_project_idx").on(t.projectId),
  ],
);

export const guestJourneySuggestions = pgTable(
  "guest_journey_suggestions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    bookingId: uuid("booking_id").references(() => bookings.id, {
      onDelete: "cascade",
    }),
    stayTokenId: uuid("stay_token_id").references(() => guestStayTokens.id, {
      onDelete: "set null",
    }),
    ruleId: uuid("rule_id").references(() => guestJourneyRules.id, {
      onDelete: "set null",
    }),
    villaId: uuid("villa_id").references(() => villas.id, {
      onDelete: "set null",
    }),
    projectId: uuid("project_id").references(() => projects.id, {
      onDelete: "set null",
    }),
    suggestionType: text("suggestion_type").notNull(),
    title: text("title").notNull(),
    body: text("body"),
    ctaLabel: text("cta_label"),
    ctaHref: text("cta_href"),
    serviceId: uuid("service_id").references(() => guestServices.id, {
      onDelete: "set null",
    }),
    suggestedFor: timestamp("suggested_for", { withTimezone: true }),
    expiresAt: timestamp("expires_at", { withTimezone: true }),
    status: text("status").notNull().default("active"),
    clickedAt: timestamp("clicked_at", { withTimezone: true }),
    dismissedAt: timestamp("dismissed_at", { withTimezone: true }),
    convertedAt: timestamp("converted_at", { withTimezone: true }),
    priority: text("priority").notNull().default("normal"),
    ownerVisible: boolean("owner_visible").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    uniqueIndex("guest_journey_suggestions_booking_rule_unique")
      .on(t.bookingId, t.ruleId)
      .where(sql`${t.ruleId} IS NOT NULL`),
    index("guest_journey_suggestions_booking_status_idx").on(
      t.bookingId,
      t.status,
    ),
    index("guest_journey_suggestions_token_status_idx").on(
      t.stayTokenId,
      t.status,
    ),
    index("guest_journey_suggestions_for_idx").on(t.suggestedFor),
    index("guest_journey_suggestions_type_idx").on(t.suggestionType),
  ],
);

export const guestJourneyRuns = pgTable(
  "guest_journey_runs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    bookingId: uuid("booking_id").references(() => bookings.id, {
      onDelete: "cascade",
    }),
    stayTokenId: uuid("stay_token_id").references(() => guestStayTokens.id, {
      onDelete: "set null",
    }),
    ruleId: uuid("rule_id").references(() => guestJourneyRules.id, {
      onDelete: "cascade",
    }),
    scheduledFor: timestamp("scheduled_for", { withTimezone: true }),
    executedAt: timestamp("executed_at", { withTimezone: true }),
    status: text("status").notNull().default("pending"),
    skipReason: text("skip_reason"),
    errorMessage: text("error_message"),
    notificationQueueId: uuid("notification_queue_id").references(
      () => notificationQueue.id,
      { onDelete: "set null" },
    ),
    suggestionId: uuid("suggestion_id").references(
      () => guestJourneySuggestions.id,
      { onDelete: "set null" },
    ),
    metricsJson: jsonb("metrics_json"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    uniqueIndex("guest_journey_runs_booking_rule_unique").on(
      t.bookingId,
      t.ruleId,
    ),
    index("guest_journey_runs_status_scheduled_idx").on(
      t.status,
      t.scheduledFor,
    ),
    index("guest_journey_runs_booking_idx").on(t.bookingId),
    index("guest_journey_runs_rule_idx").on(t.ruleId),
  ],
);

export const guestJourneyEvents = pgTable(
  "guest_journey_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    bookingId: uuid("booking_id").references(() => bookings.id, {
      onDelete: "cascade",
    }),
    stayTokenId: uuid("stay_token_id").references(() => guestStayTokens.id, {
      onDelete: "set null",
    }),
    eventType: text("event_type").notNull(),
    sourceType: text("source_type"),
    sourceId: uuid("source_id"),
    title: text("title").notNull(),
    description: text("description"),
    eventAt: timestamp("event_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    ownerVisible: boolean("owner_visible").notNull().default(false),
    severity: text("severity").notNull().default("info"),
    metadataJson: jsonb("metadata_json"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("guest_journey_events_booking_at_idx").on(
      t.bookingId,
      sql`${t.eventAt} DESC`,
    ),
    index("guest_journey_events_token_at_idx").on(
      t.stayTokenId,
      sql`${t.eventAt} DESC`,
    ),
    index("guest_journey_events_owner_visible_idx").on(t.ownerVisible),
  ],
);

export const guestReviewRequests = pgTable(
  "guest_review_requests",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    bookingId: uuid("booking_id").references(() => bookings.id, {
      onDelete: "cascade",
    }),
    guestId: uuid("guest_id").references(() => guests.id, {
      onDelete: "set null",
    }),
    villaId: uuid("villa_id").references(() => villas.id, {
      onDelete: "set null",
    }),
    projectId: uuid("project_id").references(() => projects.id, {
      onDelete: "set null",
    }),
    channel: text("channel").notNull(),
    reviewTargetUrl: text("review_target_url"),
    requestStage: text("request_stage").notNull().default("initial"),
    status: text("status").notNull().default("pending"),
    scheduledFor: timestamp("scheduled_for", { withTimezone: true }),
    sentAt: timestamp("sent_at", { withTimezone: true }),
    clickedAt: timestamp("clicked_at", { withTimezone: true }),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    notificationQueueId: uuid("notification_queue_id").references(
      () => notificationQueue.id,
      { onDelete: "set null" },
    ),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    uniqueIndex("guest_review_requests_booking_channel_unique").on(
      t.bookingId,
      t.channel,
    ),
    index("guest_review_requests_status_scheduled_idx").on(
      t.status,
      t.scheduledFor,
    ),
  ],
);

export type GuestJourneyRule = typeof guestJourneyRules.$inferSelect;
export type NewGuestJourneyRule = typeof guestJourneyRules.$inferInsert;
export type GuestJourneySuggestion =
  typeof guestJourneySuggestions.$inferSelect;
export type NewGuestJourneySuggestion =
  typeof guestJourneySuggestions.$inferInsert;
export type GuestJourneyRun = typeof guestJourneyRuns.$inferSelect;
export type NewGuestJourneyRun = typeof guestJourneyRuns.$inferInsert;
export type GuestJourneyEvent = typeof guestJourneyEvents.$inferSelect;
export type NewGuestJourneyEvent = typeof guestJourneyEvents.$inferInsert;
export type GuestReviewRequest = typeof guestReviewRequests.$inferSelect;
export type NewGuestReviewRequest = typeof guestReviewRequests.$inferInsert;
