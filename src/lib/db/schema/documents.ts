import {
  pgTable,
  uuid,
  text,
  timestamp,
  integer,
  index,
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
  },
  (t) => [
    index("documents_entity_idx").on(t.entityType, t.entityId),
    index("documents_type_idx").on(t.documentType),
    index("documents_status_idx").on(t.status),
  ],
);

export type Document = typeof documents.$inferSelect;
export type NewDocument = typeof documents.$inferInsert;
