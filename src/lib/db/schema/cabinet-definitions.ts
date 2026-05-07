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
  ],
);

export type CabinetDefinition = typeof cabinetDefinitions.$inferSelect;
export type NewCabinetDefinition = typeof cabinetDefinitions.$inferInsert;
