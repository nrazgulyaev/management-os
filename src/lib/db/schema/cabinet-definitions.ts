import {
  pgTable,
  uuid,
  text,
  timestamp,
  integer,
  boolean,
  index,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { organizations } from "./saas";

/**
 * Stage 7.A — Cabinet definitions metadata.
 *
 * Platform-wide table (NOT org-scoped). Each org sees the same cabinet
 * catalog; visibility is filtered by:
 *   - role membership (`allowed_role_keys` overlap with user's roles)
 *   - plan membership (`min_plan_code` <= org's active plan tier — Stage 7.B)
 *   - cabinet active flag (`is_active`)
 */
export const cabinetDefinitions = pgTable(
  "cabinet_definitions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    /** TENANCY (migration 0154): nullable column added for schema uniformity.
     *  This is a PLATFORM-WIDE catalog (every org sees the same cabinet set —
     *  visibility is by role/plan, not tenant), so it is only backfilled to
     *  ARCONIQUE_DEFAULT and must NOT be threaded into reads. */
    organizationId: uuid("organization_id").references(() => organizations.id, {
      onDelete: "restrict",
    }),
    slug: text("slug").notNull().unique(),
    displayName: text("display_name").notNull(),
    description: text("description"),
    defaultRoute: text("default_route").notNull(),
    iconKey: text("icon_key"),
    /** Array of RoleKey values (Mgmt OS or Dev OS) that this cabinet serves. */
    allowedRoleKeys: text("allowed_role_keys")
      .array()
      .notNull()
      .default(sql`ARRAY[]::TEXT[]`),
    /** Widget keys allowed for this cabinet — used by Stage 7.B feature gating. */
    allowedWidgets: text("allowed_widgets")
      .array()
      .notNull()
      .default(sql`ARRAY[]::TEXT[]`),
    /** Stage 7.B — minimum plan tier required (null = any plan). */
    minPlanCode: text("min_plan_code"),
    isActive: boolean("is_active").notNull().default(true),
    isSystem: boolean("is_system").notNull().default(true),
    sortOrder: integer("sort_order").notNull().default(100),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("cabinet_definitions_active_idx").on(t.isActive),
    index("cabinet_definitions_sort_idx").on(t.sortOrder),
    index("cabinet_definitions_organization_idx").on(t.organizationId),
  ],
);

export type CabinetDefinition = typeof cabinetDefinitions.$inferSelect;
export type NewCabinetDefinition = typeof cabinetDefinitions.$inferInsert;
