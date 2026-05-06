/**
 * Stage 6.P0.7 — Bulk import + OAuth foundation schema.
 *
 * 2 tables (migration 0075):
 *   - bulk_import_jobs   per-org CSV/XLSX/Sheets/JSON import tracking
 *   - oauth_connections  per-(org,user,provider,account) encrypted tokens
 */

import { sql } from "drizzle-orm";
import {
  pgTable,
  uuid,
  text,
  timestamp,
  bigint,
  integer,
  boolean,
  jsonb,
  index,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { organizations } from "./saas";
import { appUsers } from "./identity";
import { documents } from "./documents";

export const bulkImportJobs = pgTable(
  "bulk_import_jobs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    jobCode: text("job_code").notNull().unique(),
    /** 13 supported entity types — see migration check constraint */
    entityType: text("entity_type").notNull(),
    /** 'csv' | 'xlsx' | 'google_sheets' | 'json' */
    sourceType: text("source_type").notNull(),
    sourceFilename: text("source_filename"),
    sourceSizeBytes: bigint("source_size_bytes", { mode: "bigint" }),
    sourceDocumentId: uuid("source_document_id").references(
      () => documents.id,
      { onDelete: "set null" },
    ),
    /**
     * Inline source storage. CSV / JSON stored as text; XLSX stored as
     * base64. Read by the cron processor to parse + insert in batches.
     */
    sourceContent: text("source_content"),
    /** { externalColumnName: internalFieldPath } map */
    fieldMapping: jsonb("field_mapping").notNull(),
    /** When set, the wizard saves the mapping under this name for reuse. */
    saveMappingAs: text("save_mapping_as"),
    /** FSM: pending → validating → ready → processing → completed | failed | cancelled */
    status: text("status").notNull().default("pending"),
    totalRows: integer("total_rows"),
    processedRows: integer("processed_rows").notNull().default(0),
    successfulRows: integer("successful_rows").notNull().default(0),
    failedRows: integer("failed_rows").notNull().default(0),
    /** [{ row: 5, field: "email", error: "Invalid email format" }, …] */
    errorLog: jsonb("error_log"),
    /** UUIDs of records created by this job — supports rollback ergonomics */
    createdEntityIds: uuid("created_entity_ids").array(),
    initiatedBy: uuid("initiated_by")
      .notNull()
      .references(() => appUsers.id),
    initiatedAt: timestamp("initiated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    validatedAt: timestamp("validated_at", { withTimezone: true }),
    startedAt: timestamp("started_at", { withTimezone: true }),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("bulk_import_jobs_org_idx").on(t.organizationId),
    index("bulk_import_jobs_status_idx").on(t.status),
    index("bulk_import_jobs_initiated_idx").on(sql`${t.initiatedAt} DESC`),
  ],
);

export const oauthConnections = pgTable(
  "oauth_connections",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => appUsers.id, { onDelete: "cascade" }),
    /** 'google' | 'microsoft' | 'meta' | … */
    provider: text("provider").notNull(),
    accountEmail: text("account_email"),
    accountName: text("account_name"),
    /**
     * Encrypted at the application layer (Web Crypto AES-GCM, key derived
     * from STAY_LINK_KMS_SECRET — same envelope as guest-stay tokens).
     * Never persist plaintext.
     */
    accessToken: text("access_token").notNull(),
    refreshToken: text("refresh_token"),
    expiresAt: timestamp("expires_at", { withTimezone: true }),
    scopes: text("scopes").array(),
    isActive: boolean("is_active").notNull().default(true),
    lastUsedAt: timestamp("last_used_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("oauth_connections_org_user_idx").on(t.organizationId, t.userId),
    index("oauth_connections_active_idx").on(t.isActive),
    uniqueIndex("oauth_connections_org_user_provider_account_unique")
      .on(t.organizationId, t.userId, t.provider, t.accountEmail)
      .where(sql`${t.accountEmail} IS NOT NULL`),
  ],
);

export type BulkImportJob = typeof bulkImportJobs.$inferSelect;
export type NewBulkImportJob = typeof bulkImportJobs.$inferInsert;
export type OAuthConnection = typeof oauthConnections.$inferSelect;
export type NewOAuthConnection = typeof oauthConnections.$inferInsert;

/** Status FSM — string union for type-safety on transitions */
export type BulkImportJobStatus =
  | "pending"
  | "validating"
  | "ready"
  | "processing"
  | "completed"
  | "failed"
  | "cancelled";

export type BulkImportEntityType =
  | "transactions"
  | "contacts"
  | "vendors"
  | "buyers"
  | "investors"
  | "materials"
  | "inventory_items"
  | "site_reports"
  | "qa_qc_issues"
  | "leads"
  | "reservations"
  | "invoices"
  | "tasks";

export type BulkImportSourceType = "csv" | "xlsx" | "google_sheets" | "json";

export const BULK_IMPORT_ENTITY_TYPES: readonly BulkImportEntityType[] = [
  "transactions",
  "contacts",
  "vendors",
  "buyers",
  "investors",
  "materials",
  "inventory_items",
  "site_reports",
  "qa_qc_issues",
  "leads",
  "reservations",
  "invoices",
  "tasks",
] as const;

export const BULK_IMPORT_SOURCE_TYPES: readonly BulkImportSourceType[] = [
  "csv",
  "xlsx",
  "google_sheets",
  "json",
] as const;
