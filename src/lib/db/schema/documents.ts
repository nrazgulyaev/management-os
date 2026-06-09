import {
  pgTable,
  uuid,
  text,
  timestamp,
  integer,
  index,
  boolean,
} from "drizzle-orm/pg-core";
import { appUsers } from "./identity";

/**
 * Lightweight document metadata. Real bytes live in Supabase Storage at
 * `<storage_bucket>/<storage_path>`. Visibility is enforced both at app
 * level and via storage RLS policies.
 */
export const documents = pgTable(
  "documents",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    title: text("title").notNull(),
    // document_type: contract | invoice | receipt | photo | statement | kyc | certificate | guide | policy | other
    documentType: text("document_type").notNull(),
    // entity_type: project | villa | owner | booking | supplier | task | maintenance
    entityType: text("entity_type").notNull(),
    entityId: uuid("entity_id").notNull(),
    storageBucket: text("storage_bucket"),
    storagePath: text("storage_path"),
    fileName: text("file_name"),
    mimeType: text("mime_type"),
    sizeBytes: integer("size_bytes"),
    // visibility: internal | owner | guest | public
    visibility: text("visibility").notNull().default("internal"),
    // status: active | archived
    status: text("status").notNull().default("active"),
    uploadedBy: uuid("uploaded_by").references(() => appUsers.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
    // Phase 2 data-wiring PR 3 — owner-portal metadata. The
    // audit also proposed `owner_id` + `visible_to_owner`
    // columns, but `entityType='owner' + entityId` and
    // `visibility='owner'` already cover those — keeping the
    // existing pattern + adding only the genuinely-new
    // signing / expiry columns.
    signedAt: timestamp("signed_at", { withTimezone: true }),
    /** Content hash captured at sign time. */
    signedHash: text("signed_hash"),
    expiresAt: timestamp("expires_at", { withTimezone: true }),
    /** Convenience flag — denormalises visibility for the owner-portal documents
     *  cabinet query. True ⇔ visibility ∈ ('owner','public'). Backfill defaults
     *  via the migration. */
    visibleToOwner: boolean("visible_to_owner").notNull().default(false),
    /** Documents-app v1 (migration 0132) — set when fed to the AI knowledge
     *  base; null when not fed / removed. Drives the AI-knowledge tab. */
    aiFedAt: timestamp("ai_fed_at", { withTimezone: true }),
  },
  (t) => [
    index("documents_entity_idx").on(t.entityType, t.entityId),
    index("documents_type_idx").on(t.documentType),
    index("documents_status_idx").on(t.status),
    index("documents_owner_kind_created_idx").on(t.entityType, t.entityId, t.documentType, t.createdAt),
  ],
);

export type Document = typeof documents.$inferSelect;
export type NewDocument = typeof documents.$inferInsert;
