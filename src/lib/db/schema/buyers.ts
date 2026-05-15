/**
 * Stage 4.B.3 — Buyer Portal entities.
 *
 * Buyers are distinct from investors: they purchase specific villa units
 * and live in a separate workspace gated by RLS (`current_buyer_id()`).
 *
 * "units" in the spec = `villas` in this codebase.
 */

import {
  pgTable,
  uuid,
  text,
  timestamp,
  date,
  boolean,
  numeric,
  index,
  unique,
} from "drizzle-orm/pg-core";
import { villas, projects } from "./projects";
import { contacts } from "./contacts";
import { reservations, contracts } from "./sales";
import { appUsers } from "./identity";
import { organizations } from "./saas";

export const buyers = pgTable(
  "buyers",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    // TENANT-1: organization_id added by migration 0072.
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id),
    buyerCode: text("buyer_code").notNull().unique(),

    contactId: uuid("contact_id").references(() => contacts.id),

    displayName: text("display_name").notNull(),
    primaryEmail: text("primary_email"),
    primaryPhone: text("primary_phone"),
    whatsappPhone: text("whatsapp_phone"),
    preferredLanguage: text("preferred_language").notNull().default("en"),

    /**
     * 'not_started' | 'in_progress' | 'submitted' | 'verified' | 'rejected' | 'expired'
     */
    kycStatus: text("kyc_status").notNull().default("not_started"),
    kycCompletedAt: timestamp("kyc_completed_at", { withTimezone: true }),

    supabaseUserId: uuid("supabase_user_id"),
    portalAccessEnabled: boolean("portal_access_enabled")
      .notNull()
      .default(false),
    portalInvitedAt: timestamp("portal_invited_at", { withTimezone: true }),
    portalFirstLoginAt: timestamp("portal_first_login_at", { withTimezone: true }),
    portalLastLoginAt: timestamp("portal_last_login_at", { withTimezone: true }),

    /** Internal-only — never exposed via the buyer portal. */
    internalNotes: text("internal_notes"),

    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => ({
    supabaseUserIdx: index("buyers_supabase_user_idx").on(t.supabaseUserId),
    kycStatusIdx: index("buyers_kyc_status_idx").on(t.kycStatus),
    contactIdx: index("buyers_contact_idx").on(t.contactId),
  }),
);

export const buyerUnitAssignments = pgTable(
  "buyer_unit_assignments",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    // TENANT-1: organization_id added by migration 0072.
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id),
    buyerId: uuid("buyer_id")
      .notNull()
      .references(() => buyers.id, { onDelete: "cascade" }),
    unitId: uuid("unit_id")
      .notNull()
      .references(() => villas.id),
    /**
     * 'reserved' | 'contracted' | 'paying' | 'paid_in_full' | 'handed_over' | 'cancelled'
     */
    status: text("status").notNull().default("reserved"),

    reservationId: uuid("reservation_id").references(() => reservations.id),
    contractId: uuid("contract_id").references(() => contracts.id),

    assignedAt: date("assigned_at").notNull(),
    contractedAt: date("contracted_at"),
    handedOverAt: date("handed_over_at"),

    isVisibleInPortal: boolean("is_visible_in_portal").notNull().default(true),

    notes: text("notes"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => ({
    buyerIdx: index("buyer_unit_assignments_buyer_idx").on(t.buyerId),
    unitIdx: index("buyer_unit_assignments_unit_idx").on(t.unitId),
    statusIdx: index("buyer_unit_assignments_status_idx").on(t.status),
    buyerUnitUnique: unique().on(t.buyerId, t.unitId),
  }),
);

export const buyerProgressReports = pgTable(
  "buyer_progress_reports",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    // TENANT-1: organization_id added by migration 0072. Declared
    // nullable in TS to avoid breaking out-of-scope insert callsites
    // (e.g. buyer-progress-actions.ts) not yet migrated to pass it.
    organizationId: uuid("organization_id").references(() => organizations.id),
    /** NULL = project-level report. */
    unitId: uuid("unit_id").references(() => villas.id),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id),

    reportingPeriodStart: date("reporting_period_start").notNull(),
    reportingPeriodEnd: date("reporting_period_end").notNull(),

    currentProgressPercentage: numeric("current_progress_percentage", {
      precision: 5,
      scale: 2,
    }),
    worksCompletedSummary: text("works_completed_summary"),
    worksPlannedSummary: text("works_planned_summary"),
    nextMilestone: text("next_milestone"),
    expectedHandoverDate: date("expected_handover_date"),
    /** 'high' | 'medium' | 'low' */
    budgetProgressConfidence: text("budget_progress_confidence"),
    highlightedRisks: text("highlighted_risks"),
    managementCommentary: text("management_commentary"),

    /** Photo IDs from documents schema, curated by operator. */
    curatedPhotoIds: uuid("curated_photo_ids").array(),

    /**
     * 'draft' | 'pending_approval' | 'approved' | 'published' | 'archived'
     */
    status: text("status").notNull().default("draft"),

    approvedBy: uuid("approved_by").references(() => appUsers.id),
    approvedAt: timestamp("approved_at", { withTimezone: true }),
    publishedAt: timestamp("published_at", { withTimezone: true }),

    notes: text("notes"),
    /** Internal-only — never exposed via the buyer portal. */
    internalNotes: text("internal_notes"),

    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => ({
    unitIdx: index("buyer_progress_reports_unit_idx").on(t.unitId),
    projectIdx: index("buyer_progress_reports_project_idx").on(t.projectId),
    statusIdx: index("buyer_progress_reports_status_idx").on(t.status),
  }),
);

export type Buyer = typeof buyers.$inferSelect;
export type NewBuyer = typeof buyers.$inferInsert;
export type BuyerUnitAssignment = typeof buyerUnitAssignments.$inferSelect;
export type NewBuyerUnitAssignment = typeof buyerUnitAssignments.$inferInsert;
export type BuyerProgressReport = typeof buyerProgressReports.$inferSelect;
export type NewBuyerProgressReport = typeof buyerProgressReports.$inferInsert;
