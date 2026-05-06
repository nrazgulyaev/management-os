/**
 * Stage 4.C.1 — Development OS warehouse / inventory.
 *
 * Namespaced with `dev_os_` prefix to avoid collision with the existing
 * Management OS `inventory_items` table (villa operations consumables,
 * different schema).
 *
 * Forward-FK reservation: dev_os_inventory_movements.work_package_id →
 * work_packages(id) added in 0052.
 */

import {
  pgTable,
  uuid,
  text,
  timestamp,
  date,
  bigint,
  numeric,
  boolean,
  index,
  unique,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { projects, villas } from "./projects";
import { vendors } from "./site-operations";
import { appUsers } from "./identity";
import { documents } from "./documents";
import {
  materialPurchaseOrders,
  materialDeliveries,
  siteReports,
} from "./site-operations";
import { qaQcIssues } from "./qa-qc";

export const devOsInventoryItems = pgTable(
  "dev_os_inventory_items",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    sku: text("sku").notNull().unique(),
    displayName: text("display_name").notNull(),
    description: text("description"),
    category: text("category").notNull(),
    unitOfMeasure: text("unit_of_measure").notNull(),
    averageCostMinor: bigint("average_cost_minor", { mode: "bigint" }),
    lastPurchasePriceMinor: bigint("last_purchase_price_minor", {
      mode: "bigint",
    }),
    lastPurchaseDate: date("last_purchase_date"),
    defaultCurrency: text("default_currency").default("IDR"),
    minimumStockLevel: numeric("minimum_stock_level", {
      precision: 12,
      scale: 4,
    }),
    reorderPoint: numeric("reorder_point", { precision: 12, scale: 4 }),
    preferredVendorId: uuid("preferred_vendor_id").references(() => vendors.id),
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
    activeIdx: index("dev_os_inventory_items_active_idx").on(t.isActive),
    categoryIdx: index("dev_os_inventory_items_category_idx").on(t.category),
    vendorIdx: index("dev_os_inventory_items_vendor_idx").on(
      t.preferredVendorId,
    ),
  }),
);

export const devOsInventoryLocations = pgTable(
  "dev_os_inventory_locations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    locationCode: text("location_code").notNull().unique(),
    displayName: text("display_name").notNull(),
    /**
     * 'warehouse' | 'site' | 'in_transit' | 'consumed' | 'damaged' | 'returned'
     */
    locationType: text("location_type").notNull(),
    projectId: uuid("project_id").references(() => projects.id),
    isActive: boolean("is_active").notNull().default(true),
    notes: text("notes"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => ({
    typeIdx: index("dev_os_inventory_locations_type_idx").on(t.locationType),
    projectIdx: index("dev_os_inventory_locations_project_idx").on(t.projectId),
  }),
);

export const devOsInventoryStockBalances = pgTable(
  "dev_os_inventory_stock_balances",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    itemId: uuid("item_id")
      .notNull()
      .references(() => devOsInventoryItems.id),
    locationId: uuid("location_id")
      .notNull()
      .references(() => devOsInventoryLocations.id),
    quantityOnHand: numeric("quantity_on_hand", { precision: 14, scale: 4 })
      .notNull()
      .default("0"),
    quantityReserved: numeric("quantity_reserved", { precision: 14, scale: 4 })
      .notNull()
      .default("0"),
    /** GENERATED STORED in DB = on_hand - reserved. */
    quantityAvailable: numeric("quantity_available", {
      precision: 14,
      scale: 4,
    })
      .generatedAlwaysAs(sql`quantity_on_hand - quantity_reserved`),
    lastMovementAt: timestamp("last_movement_at", { withTimezone: true }),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => ({
    itemIdx: index("dev_os_inventory_stock_balances_item_idx").on(t.itemId),
    locationIdx: index("dev_os_inventory_stock_balances_location_idx").on(
      t.locationId,
    ),
    itemLocationUnique: unique().on(t.itemId, t.locationId),
  }),
);

export const devOsInventoryMovements = pgTable(
  "dev_os_inventory_movements",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    movementCode: text("movement_code").notNull().unique(),
    itemId: uuid("item_id")
      .notNull()
      .references(() => devOsInventoryItems.id),
    /** Always positive — direction is encoded in movement_type + locations. */
    quantity: numeric("quantity", { precision: 14, scale: 4 }).notNull(),
    /**
     * 'received' | 'reserved' | 'unreserved' | 'issued_to_site' | 'used'
     * | 'returned' | 'damaged' | 'lost' | 'transferred' | 'written_off' | 'adjusted'
     */
    movementType: text("movement_type").notNull(),
    fromLocationId: uuid("from_location_id").references(
      () => devOsInventoryLocations.id,
    ),
    toLocationId: uuid("to_location_id").references(
      () => devOsInventoryLocations.id,
    ),
    projectId: uuid("project_id").references(() => projects.id),
    villaId: uuid("villa_id").references(() => villas.id),
    /** FK to work_packages added in migration 0052. */
    workPackageId: uuid("work_package_id"),
    relatedPoId: uuid("related_po_id").references(
      () => materialPurchaseOrders.id,
    ),
    relatedDeliveryId: uuid("related_delivery_id").references(
      () => materialDeliveries.id,
    ),
    relatedSiteReportId: uuid("related_site_report_id").references(
      () => siteReports.id,
    ),
    relatedQaQcIssueId: uuid("related_qa_qc_issue_id").references(
      () => qaQcIssues.id,
    ),
    responsibleUserId: uuid("responsible_user_id")
      .notNull()
      .references(() => appUsers.id),
    movementDate: date("movement_date").notNull(),
    reason: text("reason"),
    notes: text("notes"),
    proofDocumentId: uuid("proof_document_id").references(() => documents.id),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => ({
    itemIdx: index("dev_os_inventory_movements_item_idx").on(t.itemId),
    typeIdx: index("dev_os_inventory_movements_type_idx").on(t.movementType),
    dateIdx: index("dev_os_inventory_movements_date_idx").on(t.movementDate),
    projectIdx: index("dev_os_inventory_movements_project_idx").on(t.projectId),
    villaIdx: index("dev_os_inventory_movements_villa_idx").on(t.villaId),
  }),
);

export type DevOsInventoryItem = typeof devOsInventoryItems.$inferSelect;
export type NewDevOsInventoryItem = typeof devOsInventoryItems.$inferInsert;
export type DevOsInventoryLocation = typeof devOsInventoryLocations.$inferSelect;
export type NewDevOsInventoryLocation =
  typeof devOsInventoryLocations.$inferInsert;
export type DevOsInventoryStockBalance =
  typeof devOsInventoryStockBalances.$inferSelect;
export type NewDevOsInventoryStockBalance =
  typeof devOsInventoryStockBalances.$inferInsert;
export type DevOsInventoryMovement = typeof devOsInventoryMovements.$inferSelect;
export type NewDevOsInventoryMovement =
  typeof devOsInventoryMovements.$inferInsert;
