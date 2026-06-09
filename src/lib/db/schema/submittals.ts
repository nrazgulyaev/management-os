/**
 * Coordination cabinet (migration 0126) — submittals register.
 *
 * Material / shop-drawing / sample submittals from vendors to the design
 * team for approval. This register did not previously exist; RFIs lived in a
 * table register and punch-list lived in qa_qc. The Coordination cabinet at
 * /development-os/coordination unifies all three over a drawing via
 * coordination_pins.
 *
 * Single-tenant style (mirrors rfis / turnovers — org scoping via project_id).
 */

import {
  pgTable,
  uuid,
  text,
  timestamp,
  index,
} from "drizzle-orm/pg-core";
import { projects } from "./projects";
import { vendors } from "./site-operations";
import { appUsers } from "./identity";
import { organizations } from "./saas";

export const SUBMITTAL_TYPES = [
  "shop_drawing",
  "material",
  "product_data",
  "sample",
  "mockup",
  "method_statement",
  "other",
] as const;
export type SubmittalType = (typeof SUBMITTAL_TYPES)[number];

/**
 * Lifecycle:
 *   open → submitted → under_review →
 *      ├→ approved
 *      ├→ approved_as_noted
 *      ├→ revise_resubmit → under_review (loop)
 *      └→ rejected
 *   any → closed
 */
export const SUBMITTAL_STATUSES = [
  "open",
  "submitted",
  "under_review",
  "approved",
  "approved_as_noted",
  "revise_resubmit",
  "rejected",
  "closed",
] as const;
export type SubmittalStatus = (typeof SUBMITTAL_STATUSES)[number];

export const submittals = pgTable(
  "submittals",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    /**
     * TENANCY (migration 0150) — NULLABLE org column, backfilled via
     * project_id -> projects.organization_id. Not yet threaded into queries
     * and not DB-enforced NOT NULL; the app still org-scopes via project_id.
     */
    organizationId: uuid("organization_id").references(() => organizations.id, {
      onDelete: "restrict",
    }),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    /** e.g. SUB-EV02-0007. */
    ref: text("ref").notNull().unique(),
    title: text("title").notNull(),
    /** Enum: SUBMITTAL_TYPES. */
    submittalType: text("submittal_type").notNull(),
    /** structural | architectural | mep | finishes | landscape | civil | other */
    discipline: text("discipline").notNull().default("other"),
    specSection: text("spec_section"),
    description: text("description"),
    vendorId: uuid("vendor_id").references(() => vendors.id, {
      onDelete: "set null",
    }),
    /** Enum: SUBMITTAL_STATUSES. */
    status: text("status").notNull().default("open"),
    priority: text("priority").notNull().default("medium"),
    submittedAt: timestamp("submitted_at", { withTimezone: true }),
    reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
    closedAt: timestamp("closed_at", { withTimezone: true }),
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
    index("submittals_project_idx").on(t.projectId),
    index("submittals_status_idx").on(t.status),
    index("submittals_discipline_idx").on(t.discipline),
    index("submittals_created_idx").on(t.createdAt),
    index("submittals_organization_idx").on(t.organizationId),
  ],
);

export type Submittal = typeof submittals.$inferSelect;
export type NewSubmittal = typeof submittals.$inferInsert;
