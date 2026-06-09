/**
 * Stage 5.B.1 — Asset types registry.
 *
 * Seeded with 12 default types in migration 0057. Used by `villas`
 * (which is now semantically the assets table — see arch doc).
 */

import {
  pgTable,
  uuid,
  text,
  timestamp,
  boolean,
  integer,
  jsonb,
  index,
} from "drizzle-orm/pg-core";
import { organizations } from "./saas";

export const assetTypes = pgTable(
  "asset_types",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    // TENANCY (0153): nullable org anchor + backfill. No threading yet.
    organizationId: uuid("organization_id").references(() => organizations.id, {
      onDelete: "restrict",
    }),
    typeKey: text("type_key").notNull().unique(),
    displayName: text("display_name").notNull(),
    description: text("description"),
    /**
     * 'residential' | 'hospitality' | 'food_beverage' | 'wellness'
     * | 'mixed_use' | 'commercial' | 'land' | 'amenity' | 'other'
     */
    assetCategory: text("asset_category").notNull(),
    defaultAttributesSchema: jsonb("default_attributes_schema"),
    isSaleable: boolean("is_saleable").notNull().default(true),
    isRentable: boolean("is_rentable").notNull().default(false),
    isRevenueGenerating: boolean("is_revenue_generating").notNull().default(true),
    displayOrder: integer("display_order").notNull().default(0),
    iconKey: text("icon_key"),
    isActive: boolean("is_active").notNull().default(true),
    notes: text("notes"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => ({
    categoryIdx: index("asset_types_category_idx").on(t.assetCategory),
    activeIdx: index("asset_types_active_idx").on(t.isActive),
    orgIdx: index("asset_types_org_idx").on(t.organizationId),
  }),
);

export type AssetType = typeof assetTypes.$inferSelect;
export type NewAssetType = typeof assetTypes.$inferInsert;
