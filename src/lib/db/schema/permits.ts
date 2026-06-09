/**
 * Stage 4.A.1 — Project permits lifecycle (PBG, SLF, etc.).
 *
 * Permits are per-project; documents attach via a junction table to the
 * existing `documents` table (no duplicate storage tracking).
 */

import {
  pgTable,
  uuid,
  text,
  timestamp,
  date,
  bigint,
  index,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { projects } from "./projects";
import { documents } from "./documents";
import { organizations } from "./saas";

export const projectPermits = pgTable(
  "project_permits",
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

    /** See migration CHECK for full enum */
    permitType: text("permit_type").notNull(),
    permitLabel: text("permit_label").notNull(),

    /** See migration CHECK for full enum */
    status: text("status").notNull().default("planned"),

    preparationStartedAt: date("preparation_started_at"),
    submittedAt: date("submitted_at"),
    targetApprovalDate: date("target_approval_date"),
    receivedAt: date("received_at"),
    expiresAt: date("expires_at"),

    permitNumber: text("permit_number"),
    issuingAuthority: text("issuing_authority"),

    plannedCostMinor: bigint("planned_cost_minor", { mode: "bigint" }),
    actualCostMinor: bigint("actual_cost_minor", { mode: "bigint" }),
    currency: text("currency").notNull().default("USD"),

    responsiblePerson: text("responsible_person"),
    notes: text("notes"),
    rejectionReason: text("rejection_reason"),

    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("project_permits_project_idx").on(t.projectId),
    index("project_permits_organization_idx").on(t.organizationId),
    index("project_permits_status_idx").on(t.status),
    index("project_permits_type_idx").on(t.permitType),
    index("project_permits_expires_idx")
      .on(t.expiresAt)
      .where(sql`${t.expiresAt} IS NOT NULL`),
  ],
);

export type ProjectPermit = typeof projectPermits.$inferSelect;
export type NewProjectPermit = typeof projectPermits.$inferInsert;

export const projectPermitDocuments = pgTable(
  "project_permit_documents",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    permitId: uuid("permit_id")
      .notNull()
      .references(() => projectPermits.id, { onDelete: "cascade" }),
    documentId: uuid("document_id")
      .notNull()
      .references(() => documents.id, { onDelete: "cascade" }),
    /** 'application' | 'approval_letter' | 'rejection_notice' | 'supporting_doc' */
    documentRole: text("document_role"),
    uploadedAt: timestamp("uploaded_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("project_permit_documents_permit_idx").on(t.permitId),
  ],
);

export type ProjectPermitDocument =
  typeof projectPermitDocuments.$inferSelect;
export type NewProjectPermitDocument =
  typeof projectPermitDocuments.$inferInsert;
