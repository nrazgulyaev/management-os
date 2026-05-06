/**
 * Stage 5.A.2 — Material/finish specifications library.
 */

import {
  pgTable,
  uuid,
  text,
  timestamp,
  boolean,
  index,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { vendors } from "./site-operations";
import { appUsers } from "./identity";

export const specifications = pgTable(
  "specifications",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    specCode: text("spec_code").notNull().unique(),
    specName: text("spec_name").notNull(),
    description: text("description").notNull(),
    /**
     * 'wall_finish' | 'floor_finish' | 'ceiling_finish' | 'paint'
     * | 'tile' | 'stone' | 'wood' | 'metal' | 'glass'
     * | 'plumbing_fixture' | 'electrical_fixture' | 'lighting'
     * | 'door_window' | 'hardware' | 'appliance' | 'furniture'
     * | 'landscape' | 'pool' | 'mep' | 'structural' | 'other'
     */
    specCategory: text("spec_category").notNull(),
    brand: text("brand"),
    modelNumber: text("model_number"),
    colorCode: text("color_code"),
    dimensions: text("dimensions"),
    finishType: text("finish_type"),
    applicableStandards: text("applicable_standards").array(),
    toleranceSpecifications: text("tolerance_specifications"),
    referenceDocuments: uuid("reference_documents")
      .array()
      .notNull()
      .default(sql`'{}'`),
    preferredVendorId: uuid("preferred_vendor_id").references(() => vendors.id),
    alternativeVendorIds: uuid("alternative_vendor_ids")
      .array()
      .notNull()
      .default(sql`'{}'`),
    isActive: boolean("is_active").notNull().default(true),
    supersededBy: uuid("superseded_by"),
    notes: text("notes"),
    createdBy: uuid("created_by").references(() => appUsers.id),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => ({
    categoryIdx: index("specifications_category_idx").on(t.specCategory),
    activeIdx: index("specifications_active_idx").on(t.isActive),
  }),
);

export type Specification = typeof specifications.$inferSelect;
export type NewSpecification = typeof specifications.$inferInsert;
