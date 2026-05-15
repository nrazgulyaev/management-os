/**
 * Stage 5.A.2 — BOQ documents + sections + items.
 *
 * `boq_items.total_minor` is `GENERATED STORED` in the DB
 * = `(quantity * unit_rate_minor)::BIGINT`.
 */

import {
  pgTable,
  uuid,
  text,
  timestamp,
  numeric,
  integer,
  bigint,
  index,
  unique,
} from "drizzle-orm/pg-core";
import { projects, villas } from "./projects";
import { appUsers } from "./identity";
import { devCostCategories } from "./dev-finance";
import { devOsInventoryItems } from "./dev-os-inventory";
import { organizations } from "./saas";

export const boqDocuments = pgTable(
  "boq_documents",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    // TENANT-1: migration 0072 added organization_id NOT NULL.
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id),
    boqCode: text("boq_code").notNull().unique(),
    title: text("title").notNull(),
    description: text("description"),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id),
    villaId: uuid("villa_id").references(() => villas.id),
    versionLabel: text("version_label").notNull(),
    versionNumber: integer("version_number").notNull().default(1),
    /**
     * 'draft' | 'under_review' | 'approved' | 'tender' | 'awarded'
     * | 'superseded' | 'archived'
     */
    status: text("status").notNull().default("draft"),
    totalAmountMinor: bigint("total_amount_minor", { mode: "bigint" }),
    currency: text("currency").notNull().default("IDR"),
    approvedBy: uuid("approved_by").references(() => appUsers.id),
    approvedAt: timestamp("approved_at", { withTimezone: true }),
    preparedBy: uuid("prepared_by").references(() => appUsers.id),
    qsFirm: text("qs_firm"),
    notes: text("notes"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => ({
    projectIdx: index("boq_documents_project_idx").on(t.projectId),
    villaIdx: index("boq_documents_villa_idx").on(t.villaId),
    statusIdx: index("boq_documents_status_idx").on(t.status),
  }),
);

export const boqSections = pgTable(
  "boq_sections",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    // TENANT-1: migration 0072 added organization_id NOT NULL.
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id),
    boqDocumentId: uuid("boq_document_id")
      .notNull()
      .references(() => boqDocuments.id, { onDelete: "cascade" }),
    parentSectionId: uuid("parent_section_id"),
    sectionCode: text("section_code").notNull(),
    sectionName: text("section_name").notNull(),
    description: text("description"),
    displayOrder: integer("display_order").notNull().default(0),
    subtotalMinor: bigint("subtotal_minor", { mode: "bigint" }),
    notes: text("notes"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => ({
    documentIdx: index("boq_sections_document_idx").on(t.boqDocumentId),
    parentIdx: index("boq_sections_parent_idx").on(t.parentSectionId),
    documentCodeUnique: unique().on(t.boqDocumentId, t.sectionCode),
  }),
);

export const boqItems = pgTable(
  "boq_items",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    // TENANT-1: migration 0072 added organization_id NOT NULL.
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id),
    sectionId: uuid("section_id")
      .notNull()
      .references(() => boqSections.id, { onDelete: "cascade" }),
    itemCode: text("item_code").notNull(),
    description: text("description").notNull(),
    quantity: numeric("quantity", { precision: 14, scale: 4 }).notNull(),
    unitOfMeasure: text("unit_of_measure").notNull(),
    unitRateMinor: bigint("unit_rate_minor", { mode: "bigint" }).notNull(),
    rateCurrency: text("rate_currency").notNull().default("IDR"),
    /** GENERATED STORED in DB. */
    totalMinor: bigint("total_minor", { mode: "bigint" }),
    costCategoryId: uuid("cost_category_id").references(
      () => devCostCategories.id,
    ),
    /** FK to specifications added inside migration 0055. */
    specificationId: uuid("specification_id"),
    inventoryItemId: uuid("inventory_item_id").references(
      () => devOsInventoryItems.id,
    ),
    wasteFactor: numeric("waste_factor", { precision: 5, scale: 4 }).default("0"),
    logisticsFactor: numeric("logistics_factor", {
      precision: 5,
      scale: 4,
    }).default("0"),
    laborFactor: numeric("labor_factor", { precision: 5, scale: 4 }).default("0"),
    displayOrder: integer("display_order").notNull().default(0),
    notes: text("notes"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => ({
    sectionIdx: index("boq_items_section_idx").on(t.sectionId),
    categoryIdx: index("boq_items_category_idx").on(t.costCategoryId),
    inventoryIdx: index("boq_items_inventory_idx").on(t.inventoryItemId),
    sectionCodeUnique: unique().on(t.sectionId, t.itemCode),
  }),
);

export type BoqDocument = typeof boqDocuments.$inferSelect;
export type NewBoqDocument = typeof boqDocuments.$inferInsert;
export type BoqSection = typeof boqSections.$inferSelect;
export type NewBoqSection = typeof boqSections.$inferInsert;
export type BoqItem = typeof boqItems.$inferSelect;
export type NewBoqItem = typeof boqItems.$inferInsert;
