import {
  pgTable,
  uuid,
  text,
  timestamp,
  boolean,
  bigint,
  integer,
  numeric,
  jsonb,
  date,
  index,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { projects, villas } from "./projects";
import { owners } from "./ownership";
import { appUsers } from "./identity";
import { bookings } from "./bookings";
import { villaCalendarBlocks } from "./availability";

/**
 * V9B — owner-stay primitive. Policies + requests + relocation candidates
 * + equivalence groups. Approved owner stays materialise as
 * `villa_calendar_blocks` rows (block_type='owner_stay'); this module
 * never duplicates the calendar — it produces the blocks that V9A's
 * conflict detector reads.
 */

export const ownerStayPolicies = pgTable(
  "owner_stay_policies",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    projectId: uuid("project_id").references(() => projects.id, {
      onDelete: "cascade",
    }),
    villaId: uuid("villa_id").references(() => villas.id, { onDelete: "cascade" }),
    policyName: text("policy_name").notNull(),
    freeNightsPerYear: integer("free_nights_per_year").notNull().default(14),
    freeNightsApplyToPeak: boolean("free_nights_apply_to_peak")
      .notNull()
      .default(false),
    requiresApproval: boolean("requires_approval").notNull().default(true),
    allowDisplacingGuestBookings: boolean("allow_displacing_guest_bookings")
      .notNull()
      .default(false),
    relocationAllowed: boolean("relocation_allowed").notNull().default(true),
    operationalCostModel: text("operational_cost_model")
      .notNull()
      .default("actual_costs"),
    fixedOperationalCostMinor: bigint("fixed_operational_cost_minor", {
      mode: "number",
    }),
    currency: text("currency"),
    compensationModel: text("compensation_model")
      .notNull()
      .default("management_fee_on_expected_gross"),
    compensationPercent: numeric("compensation_percent"),
    fixedCompensationMinor: bigint("fixed_compensation_minor", {
      mode: "number",
    }),
    blackoutDates: jsonb("blackout_dates"),
    peakSeasonRules: jsonb("peak_season_rules"),
    status: text("status").notNull().default("active"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("owner_stay_policies_villa_idx").on(t.villaId),
    index("owner_stay_policies_project_idx").on(t.projectId),
    index("owner_stay_policies_status_idx").on(t.status),
  ],
);

export const ownerStayRequests = pgTable(
  "owner_stay_requests",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    ownerId: uuid("owner_id")
      .notNull()
      .references(() => owners.id, { onDelete: "cascade" }),
    requestedByAppUserId: uuid("requested_by_app_user_id").references(
      () => appUsers.id,
      { onDelete: "set null" },
    ),
    villaId: uuid("villa_id")
      .notNull()
      .references(() => villas.id, { onDelete: "cascade" }),
    projectId: uuid("project_id").references(() => projects.id, {
      onDelete: "set null",
    }),
    requestedStart: date("requested_start").notNull(),
    requestedEnd: date("requested_end").notNull(),
    guestsCount: integer("guests_count"),
    purpose: text("purpose"),
    status: text("status").notNull().default("requested"),
    adminDecision: text("admin_decision"),
    adminNotes: text("admin_notes"),
    estimatedGrossRevenueMinor: bigint("estimated_gross_revenue_minor", {
      mode: "number",
    })
      .notNull()
      .default(0),
    estimatedManagementCompensationMinor: bigint(
      "estimated_management_compensation_minor",
      { mode: "number" },
    )
      .notNull()
      .default(0),
    estimatedOperationalCostMinor: bigint("estimated_operational_cost_minor", {
      mode: "number",
    })
      .notNull()
      .default(0),
    estimatedTotalOwnerChargeMinor: bigint("estimated_total_owner_charge_minor", {
      mode: "number",
    })
      .notNull()
      .default(0),
    currency: text("currency").notNull().default("USD"),
    allowanceYear: integer("allowance_year"),
    allowanceNightsApplied: integer("allowance_nights_applied")
      .notNull()
      .default(0),
    billableNights: integer("billable_nights").notNull().default(0),
    relocationRequired: boolean("relocation_required").notNull().default(false),
    relocationPossible: boolean("relocation_possible"),
    approvedBy: uuid("approved_by").references(() => appUsers.id, {
      onDelete: "set null",
    }),
    approvedAt: timestamp("approved_at", { withTimezone: true }),
    rejectedBy: uuid("rejected_by").references(() => appUsers.id, {
      onDelete: "set null",
    }),
    rejectedAt: timestamp("rejected_at", { withTimezone: true }),
    createdCalendarBlockId: uuid("created_calendar_block_id").references(
      () => villaCalendarBlocks.id,
      { onDelete: "set null" },
    ),
    /** v9C — finance bridge status. Mirrors the latest
     *  `owner_stay_finance_links.bridge_status` for the request. */
    financeBridgeStatus: text("finance_bridge_status")
      .notNull()
      .default("pending"),
    /** v9C — pointer to the bridge row (nullable until first attempt).
     *  FK enforced via the migration. Declared without `.references()`
     *  to avoid a Drizzle circular import with `owner-stay-finance.ts`. */
    financeLinkId: uuid("finance_link_id"),
    /** v9C — set when admin marks the stay completed. */
    completedAt: timestamp("completed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("owner_stay_requests_owner_idx").on(t.ownerId),
    index("owner_stay_requests_villa_idx").on(t.villaId, t.requestedStart),
    index("owner_stay_requests_status_idx").on(t.status),
    index("owner_stay_requests_year_idx").on(t.ownerId, t.allowanceYear),
    index("owner_stay_requests_finance_bridge_idx").on(t.financeBridgeStatus),
  ],
);

export const villaEquivalenceGroups = pgTable(
  "villa_equivalence_groups",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    projectId: uuid("project_id").references(() => projects.id, {
      onDelete: "cascade",
    }),
    name: text("name").notNull(),
    description: text("description"),
    status: text("status").notNull().default("active"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [index("villa_equivalence_groups_project_idx").on(t.projectId)],
);

export const villaEquivalenceGroupMembers = pgTable(
  "villa_equivalence_group_members",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    groupId: uuid("group_id")
      .notNull()
      .references(() => villaEquivalenceGroups.id, { onDelete: "cascade" }),
    villaId: uuid("villa_id")
      .notNull()
      .references(() => villas.id, { onDelete: "cascade" }),
    qualityRank: integer("quality_rank").notNull().default(100),
    notes: text("notes"),
    status: text("status").notNull().default("active"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    uniqueIndex("villa_equivalence_group_members_unique").on(
      t.groupId,
      t.villaId,
    ),
    index("villa_equivalence_group_members_villa_idx").on(t.villaId),
  ],
);

export const bookingRelocationCandidates = pgTable(
  "booking_relocation_candidates",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    ownerStayRequestId: uuid("owner_stay_request_id")
      .notNull()
      .references(() => ownerStayRequests.id, { onDelete: "cascade" }),
    bookingId: uuid("booking_id")
      .notNull()
      .references(() => bookings.id, { onDelete: "cascade" }),
    fromVillaId: uuid("from_villa_id")
      .notNull()
      .references(() => villas.id, { onDelete: "cascade" }),
    toVillaId: uuid("to_villa_id")
      .notNull()
      .references(() => villas.id, { onDelete: "cascade" }),
    candidateStatus: text("candidate_status").notNull().default("candidate"),
    score: numeric("score").notNull().default("0"),
    guestImpactLevel: text("guest_impact_level").notNull().default("low"),
    reason: text("reason"),
    revenueDifferenceMinor: bigint("revenue_difference_minor", { mode: "number" })
      .notNull()
      .default(0),
    currency: text("currency").notNull().default("USD"),
    requiresGuestNotification: boolean("requires_guest_notification")
      .notNull()
      .default(true),
    approvedBy: uuid("approved_by").references(() => appUsers.id, {
      onDelete: "set null",
    }),
    approvedAt: timestamp("approved_at", { withTimezone: true }),
    appliedAt: timestamp("applied_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("booking_relocation_candidates_request_idx").on(t.ownerStayRequestId),
    index("booking_relocation_candidates_booking_idx").on(t.bookingId),
    index("booking_relocation_candidates_status_idx").on(t.candidateStatus),
  ],
);

export type OwnerStayPolicy = typeof ownerStayPolicies.$inferSelect;
export type NewOwnerStayPolicy = typeof ownerStayPolicies.$inferInsert;
export type OwnerStayRequest = typeof ownerStayRequests.$inferSelect;
export type NewOwnerStayRequest = typeof ownerStayRequests.$inferInsert;
export type VillaEquivalenceGroup = typeof villaEquivalenceGroups.$inferSelect;
export type NewVillaEquivalenceGroup =
  typeof villaEquivalenceGroups.$inferInsert;
export type VillaEquivalenceGroupMember =
  typeof villaEquivalenceGroupMembers.$inferSelect;
export type NewVillaEquivalenceGroupMember =
  typeof villaEquivalenceGroupMembers.$inferInsert;
export type BookingRelocationCandidate =
  typeof bookingRelocationCandidates.$inferSelect;
export type NewBookingRelocationCandidate =
  typeof bookingRelocationCandidates.$inferInsert;
