import {
  pgTable,
  uuid,
  text,
  timestamp,
  integer,
  boolean,
  index,
} from "drizzle-orm/pg-core";
import { appUsers } from "./identity";
import { documents } from "./documents";
import { organizations } from "./saas";

/**
 * Documents-app v1 (migration 0132).
 *
 * Layers an interactive app on top of the flat `documents` table:
 *  - `documentTemplates`     — Generate-from-template source rows.
 *  - `documentVersions`      — per-document version history (compare).
 *  - `documentSignatureRequests` — e-sign request lifecycle.
 *
 * The Feed-to-AI flag lives as `documents.ai_fed_at` (added in 0132).
 */

export const documentTemplates = pgTable(
  "document_templates",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    // TENANCY-FINANCE-DOCS (migration 0151) — nullable org anchor,
    // backfilled to ARCONIQUE_DEFAULT (templates are org-global today).
    // Not query-threaded yet.
    organizationId: uuid("organization_id").references(() => organizations.id, {
      onDelete: "restrict",
    }),
    name: text("name").notNull(),
    documentType: text("document_type").notNull().default("contract"),
    description: text("description"),
    /** Body with `{{placeholder}}` tokens, rendered at generate time. */
    body: text("body").notNull().default(""),
    /** Visibility applied to docs generated from this template. */
    defaultVisibility: text("default_visibility").notNull().default("internal"),
    isActive: boolean("is_active").notNull().default(true),
    createdBy: uuid("created_by").references(() => appUsers.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("document_templates_active_idx").on(t.isActive),
    index("document_templates_type_idx").on(t.documentType),
    index("document_templates_org_idx").on(t.organizationId),
  ],
);

export const documentVersions = pgTable(
  "document_versions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    // TENANCY-FINANCE-DOCS (migration 0151) — nullable org anchor,
    // backfilled via documents.organization_id. Not query-threaded yet.
    organizationId: uuid("organization_id").references(() => organizations.id, {
      onDelete: "restrict",
    }),
    documentId: uuid("document_id")
      .notNull()
      .references(() => documents.id, { onDelete: "cascade" }),
    versionNo: integer("version_no").notNull().default(1),
    title: text("title").notNull(),
    storageBucket: text("storage_bucket"),
    storagePath: text("storage_path"),
    fileName: text("file_name"),
    sizeBytes: integer("size_bytes"),
    contentHash: text("content_hash"),
    changeNote: text("change_note"),
    isCurrent: boolean("is_current").notNull().default(false),
    createdBy: uuid("created_by").references(() => appUsers.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("document_versions_doc_idx").on(t.documentId, t.versionNo),
    index("document_versions_current_idx").on(t.documentId, t.isCurrent),
    index("document_versions_org_idx").on(t.organizationId),
  ],
);

export const documentSignatureRequests = pgTable(
  "document_signature_requests",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    // TENANCY-FINANCE-DOCS (migration 0151) — nullable org anchor,
    // backfilled via documents.organization_id. Not query-threaded yet.
    organizationId: uuid("organization_id").references(() => organizations.id, {
      onDelete: "restrict",
    }),
    documentId: uuid("document_id")
      .notNull()
      .references(() => documents.id, { onDelete: "cascade" }),
    signerName: text("signer_name").notNull(),
    signerEmail: text("signer_email"),
    signerRole: text("signer_role").notNull().default("owner"),
    /** pending | sent | signed | countersigned | declined | cancelled */
    status: text("status").notNull().default("pending"),
    message: text("message"),
    reminderCount: integer("reminder_count").notNull().default(0),
    lastReminderAt: timestamp("last_reminder_at", { withTimezone: true }),
    sentAt: timestamp("sent_at", { withTimezone: true }),
    signedAt: timestamp("signed_at", { withTimezone: true }),
    countersignedAt: timestamp("countersigned_at", { withTimezone: true }),
    requestedBy: uuid("requested_by").references(() => appUsers.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("document_signature_requests_doc_idx").on(t.documentId),
    index("document_signature_requests_status_idx").on(t.status),
    index("document_signature_requests_org_idx").on(t.organizationId),
  ],
);

export type DocumentTemplate = typeof documentTemplates.$inferSelect;
export type NewDocumentTemplate = typeof documentTemplates.$inferInsert;
export type DocumentVersion = typeof documentVersions.$inferSelect;
export type NewDocumentVersion = typeof documentVersions.$inferInsert;
export type DocumentSignatureRequest = typeof documentSignatureRequests.$inferSelect;
export type NewDocumentSignatureRequest = typeof documentSignatureRequests.$inferInsert;
