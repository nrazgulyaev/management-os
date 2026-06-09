/**
 * CRM-SAVED-VIEWS-BULK (#169 · migration 0145) — crm_saved_views.
 *
 * A saved "view" is a named snapshot of a CRM list's advanced filter plus its
 * visible column set (Attio's killer feature). Org + user scoped: private to
 * `appUserId` unless `isShared`, in which case the whole `organizationId` sees
 * it. Drives the <FilterBar> saved-view switcher on the owners list first,
 * then contacts + leads.
 *
 * TENANCY (#169 policy): `organizationId` is NULLABLE (no `.notNull`); reads
 * scope by org in the query layer for real sessions, but the demo /
 * unauthenticated path keeps working without a backfill.
 */

import {
  boolean,
  index,
  jsonb,
  pgTable,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";

/** Which CRM list a saved view targets. */
export type CrmSavedViewEntity = "owners" | "contacts" | "leads";

export const crmSavedViews = pgTable(
  "crm_saved_views",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    /** Tenant scope — NULLABLE per tenancy policy. */
    organizationId: uuid("organization_id"),
    /** Owning app user. NULL → legacy / system-seeded. */
    appUserId: uuid("app_user_id"),
    /** Enum: owners | contacts | leads. */
    entity: text("entity").notNull().default("owners"),
    name: text("name").notNull(),
    /** Serialized advanced filter: [{ field, op, values: string[] }]. */
    filterJson: jsonb("filter_json").notNull().default([]),
    /** Ordered visible column keys, or NULL for the list default. */
    columnsJson: jsonb("columns_json"),
    /** Org-shared (whole org) vs private to appUserId. */
    isShared: boolean("is_shared").notNull().default(false),
    /** The user's default view for this entity (enforced in the action). */
    isDefault: boolean("is_default").notNull().default(false),
    createdByAppUserId: uuid("created_by_app_user_id"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("crm_saved_views_org_entity_idx").on(t.organizationId, t.entity),
    index("crm_saved_views_user_entity_idx").on(t.appUserId, t.entity),
    index("crm_saved_views_entity_shared_idx").on(t.entity, t.isShared),
  ],
);

export type CrmSavedView = typeof crmSavedViews.$inferSelect;
export type NewCrmSavedView = typeof crmSavedViews.$inferInsert;
