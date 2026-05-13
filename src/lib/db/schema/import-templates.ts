/**
 * Sprint 4 — import_templates Drizzle model.
 *
 * One row per (org, name, version) — versioning lets operators iterate
 * a mapping without losing the prior one. See drizzle/0097 for the
 * column_mapping JSONB shape.
 */

import {
  boolean,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

import { organizations } from "./saas";

export const importTemplates = pgTable(
  "import_templates",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    version: integer("version").notNull().default(1),
    sourceKind: text("source_kind").notNull(),
    destinationKind: text("destination_kind").notNull().default("transactions"),
    columnMapping: jsonb("column_mapping").notNull(),
    notes: text("notes"),
    isActive: boolean("is_active").notNull().default(true),
    createdByUserId: uuid("created_by_user_id"),
    lastUsedAt: timestamp("last_used_at", { withTimezone: true }),
    useCount: integer("use_count").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("import_templates_org_idx").on(t.organizationId),
    index("import_templates_active_idx").on(t.isActive),
    uniqueIndex("import_templates_org_name_version_uq").on(
      t.organizationId,
      t.name,
      t.version,
    ),
  ],
);

export type ImportTemplate = typeof importTemplates.$inferSelect;
export type NewImportTemplate = typeof importTemplates.$inferInsert;
