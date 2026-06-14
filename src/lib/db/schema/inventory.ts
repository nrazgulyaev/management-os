import {
  pgTable,
  uuid,
  text,
  timestamp,
  boolean,
  bigint,
  numeric,
  date,
  index,
  uniqueIndex,
  type AnyPgColumn,
} from "drizzle-orm/pg-core";
import { appUsers } from "./identity";
import { projects, villas } from "./projects";
import { operationTasks, taskChecklistItems, damageReports } from "./operations";
import { expenseLines } from "./finance";
import { organizations } from "./saas";

/**
 * ============================================================================
 * OWNER: MANAGEMENT OS — Inventory / Procurement cabinet.
 * ============================================================================
 * Tables here (`suppliers`, `inventory_locations`, `inventory_categories`,
 * `inventory_items`, `inventory_stock_levels`, `inventory_movements`,
 * `task_material_usage`, `purchase_requests(_lines)`, `purchase_orders(_lines)`,
 * `inventory_counts(_lines)`) power villa-operations consumables: stocking,
 * procurement, counts, and the finance material-usage bridge.
 *
 * Importers (Management OS only): src/features/inventory/*,
 * src/features/procurement/*, src/features/finance/material-usage-bridge*,
 * src/features/jobs/{material-usage-bridge-job,notification-digest-job}.
 *
 * PARALLEL DOMAIN — DO NOT CONFUSE WITH: src/lib/db/schema/dev-os-inventory.ts
 * (`dev_os_inventory_*`), which is the DEVELOPMENT OS construction-warehouse
 * cabinet. The two are intentionally separate parallel domains: same problem
 * shape (items / locations / stock / movements), different products, different
 * lifecycles, different units, different consumers.
 *
 * RULES:
 *   - DO NOT cross-reference dev_os_inventory_* from this file or its queries.
 *   - DO NOT join inventory_* to dev_os_inventory_* in application code.
 *   - DO NOT merge the two schemas without a data migration (see
 *     docs/INVENTORY-SCHEMA-SPLIT.md for the ADR and unify/keep call).
 *
 * Origin: migration `drizzle/0006_inventory_procurement_attachments.sql` and
 * docs/ADR-0007_INVENTORY_PROCUREMENT_ATTACHMENTS.md.
 *
 * Money columns follow the BIGINT minor-unit rule with a paired `currency`
 * code. Quantities are NUMERIC because some categories ship in fractional
 * units (e.g. 0.5 L of pool chlorine).
 */

export const suppliers = pgTable(
  "suppliers",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    // TENANCY (0153): nullable org anchor + backfill. No threading yet.
    organizationId: uuid("organization_id").references(() => organizations.id, {
      onDelete: "restrict",
    }),
    name: text("name").notNull(),
    supplierType: text("supplier_type").notNull().default("general"),
    contactName: text("contact_name"),
    email: text("email"),
    phone: text("phone"),
    whatsapp: text("whatsapp"),
    website: text("website"),
    address: text("address"),
    country: text("country"),
    currency: text("currency"),
    paymentTerms: text("payment_terms"),
    taxId: text("tax_id"),
    notes: text("notes"),
    status: text("status").notNull().default("active"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("suppliers_status_idx").on(t.status),
    index("suppliers_type_idx").on(t.supplierType),
    index("suppliers_org_idx").on(t.organizationId),
  ],
);

export const inventoryLocations = pgTable(
  "inventory_locations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    // TENANCY (0153): nullable org anchor + backfill. No threading yet.
    organizationId: uuid("organization_id").references(() => organizations.id, {
      onDelete: "restrict",
    }),
    projectId: uuid("project_id").references(() => projects.id, { onDelete: "set null" }),
    villaId: uuid("villa_id").references(() => villas.id, { onDelete: "set null" }),
    name: text("name").notNull(),
    locationType: text("location_type").notNull().default("warehouse"),
    description: text("description"),
    status: text("status").notNull().default("active"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("inv_locations_project_idx").on(t.projectId),
    index("inv_locations_villa_idx").on(t.villaId),
    index("inv_locations_type_idx").on(t.locationType),
    index("inv_locations_org_idx").on(t.organizationId),
  ],
);

export const inventoryCategories = pgTable(
  "inventory_categories",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    // TENANCY (0153): nullable org anchor + backfill. No threading yet.
    organizationId: uuid("organization_id").references(() => organizations.id, {
      onDelete: "restrict",
    }),
    key: text("key").notNull().unique(),
    name: text("name").notNull(),
    parentId: uuid("parent_id").references((): AnyPgColumn => inventoryCategories.id, {
      onDelete: "set null",
    }),
    defaultUnit: text("default_unit").notNull().default("pcs"),
    isConsumable: boolean("is_consumable").notNull().default(true),
    status: text("status").notNull().default("active"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("inv_categories_parent_idx").on(t.parentId),
    index("inv_categories_org_idx").on(t.organizationId),
  ],
);

export const inventoryItems = pgTable(
  "inventory_items",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    // TENANCY (0153): nullable org anchor + backfill. No threading yet.
    organizationId: uuid("organization_id").references(() => organizations.id, {
      onDelete: "restrict",
    }),
    sku: text("sku").unique(),
    name: text("name").notNull(),
    categoryId: uuid("category_id").references(() => inventoryCategories.id, {
      onDelete: "set null",
    }),
    defaultSupplierId: uuid("default_supplier_id").references(() => suppliers.id, {
      onDelete: "set null",
    }),
    unit: text("unit").notNull().default("pcs"),
    itemType: text("item_type").notNull().default("consumable"),
    description: text("description"),
    brand: text("brand"),
    model: text("model"),
    barcode: text("barcode"),
    reorderPoint: numeric("reorder_point"),
    reorderQuantity: numeric("reorder_quantity"),
    unitCostMinor: bigint("unit_cost_minor", { mode: "bigint" }),
    currency: text("currency"),
    ownerChargeable: boolean("owner_chargeable").notNull().default(true),
    trackSerial: boolean("track_serial").notNull().default(false),
    status: text("status").notNull().default("active"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("inv_items_status_idx").on(t.status),
    index("inv_items_category_idx").on(t.categoryId),
    index("inv_items_supplier_idx").on(t.defaultSupplierId),
    index("inv_items_type_idx").on(t.itemType),
    index("inv_items_org_idx").on(t.organizationId),
    // PERF: the items list filters org [+ status/type] and orders by name.
    index("inv_items_org_status_name_idx").on(
      t.organizationId,
      t.status,
      t.name,
    ),
  ],
);

export const inventoryStockLevels = pgTable(
  "inventory_stock_levels",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    // TENANCY (0153): nullable org anchor + backfill. No threading yet.
    organizationId: uuid("organization_id").references(() => organizations.id, {
      onDelete: "restrict",
    }),
    itemId: uuid("item_id")
      .notNull()
      .references(() => inventoryItems.id, { onDelete: "cascade" }),
    locationId: uuid("location_id")
      .notNull()
      .references(() => inventoryLocations.id, { onDelete: "cascade" }),
    quantity: numeric("quantity").notNull().default("0"),
    reservedQuantity: numeric("reserved_quantity").notNull().default("0"),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("inv_stock_unique").on(t.itemId, t.locationId),
    index("inv_stock_item_idx").on(t.itemId),
    index("inv_stock_location_idx").on(t.locationId),
    index("inv_stock_org_idx").on(t.organizationId),
  ],
);

export const inventoryMovements = pgTable(
  "inventory_movements",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    // TENANCY (0153): nullable org anchor + backfill. No threading yet.
    organizationId: uuid("organization_id").references(() => organizations.id, {
      onDelete: "restrict",
    }),
    movementCode: text("movement_code").notNull().unique(),
    itemId: uuid("item_id")
      .notNull()
      .references(() => inventoryItems.id, { onDelete: "restrict" }),
    fromLocationId: uuid("from_location_id").references(() => inventoryLocations.id, {
      onDelete: "set null",
    }),
    toLocationId: uuid("to_location_id").references(() => inventoryLocations.id, {
      onDelete: "set null",
    }),
    quantity: numeric("quantity").notNull(),
    movementType: text("movement_type").notNull(),
    reason: text("reason"),
    taskId: uuid("task_id").references(() => operationTasks.id, { onDelete: "set null" }),
    checklistItemId: uuid("checklist_item_id").references(() => taskChecklistItems.id, {
      onDelete: "set null",
    }),
    damageReportId: uuid("damage_report_id").references(() => damageReports.id, {
      onDelete: "set null",
    }),
    /** FK is added in SQL after `purchase_orders` exists; Drizzle treats it as
     * a plain uuid so the file can compile without a circular import. */
    purchaseOrderId: uuid("purchase_order_id"),
    unitCostMinor: bigint("unit_cost_minor", { mode: "bigint" }),
    currency: text("currency"),
    createdBy: uuid("created_by").references(() => appUsers.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("inv_movements_item_idx").on(t.itemId),
    index("inv_movements_type_idx").on(t.movementType),
    index("inv_movements_task_idx").on(t.taskId),
    index("inv_movements_from_idx").on(t.fromLocationId),
    index("inv_movements_to_idx").on(t.toLocationId),
    index("inv_movements_date_idx").on(t.createdAt),
    index("inv_movements_org_idx").on(t.organizationId),
    // PERF: the movement ledger reads this org's movements newest-first
    // (high-volume table).
    index("inv_movements_org_created_idx").on(
      t.organizationId,
      t.createdAt,
    ),
  ],
);

export const taskMaterialUsage = pgTable(
  "task_material_usage",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    // TENANCY (0153): nullable org anchor + backfill. No threading yet.
    organizationId: uuid("organization_id").references(() => organizations.id, {
      onDelete: "restrict",
    }),
    taskId: uuid("task_id")
      .notNull()
      .references(() => operationTasks.id, { onDelete: "cascade" }),
    itemId: uuid("item_id")
      .notNull()
      .references(() => inventoryItems.id, { onDelete: "restrict" }),
    locationId: uuid("location_id").references(() => inventoryLocations.id, {
      onDelete: "set null",
    }),
    quantity: numeric("quantity").notNull(),
    unitCostMinor: bigint("unit_cost_minor", { mode: "bigint" }),
    currency: text("currency"),
    movementId: uuid("movement_id").references(() => inventoryMovements.id, {
      onDelete: "set null",
    }),
    notes: text("notes"),
    createdBy: uuid("created_by").references(() => appUsers.id, { onDelete: "set null" }),
    // v6 — finance bridge denormalised pointers. The authoritative state lives
    // in `finance_material_usage_links`; these columns make per-row queries
    // (e.g. /field task detail) cheap.
    ownerChargeable: boolean("owner_chargeable").notNull().default(true),
    financeBridgeStatus: text("finance_bridge_status").notNull().default("pending"),
    expenseLineId: uuid("expense_line_id").references(() => expenseLines.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("tmu_task_idx").on(t.taskId),
    index("tmu_item_idx").on(t.itemId),
    index("tmu_bridge_status_idx").on(t.financeBridgeStatus),
    index("tmu_org_idx").on(t.organizationId),
  ],
);

export const purchaseRequests = pgTable(
  "purchase_requests",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    // TENANCY (0153): nullable org anchor + backfill. No threading yet.
    organizationId: uuid("organization_id").references(() => organizations.id, {
      onDelete: "restrict",
    }),
    requestCode: text("request_code").notNull().unique(),
    projectId: uuid("project_id").references(() => projects.id, { onDelete: "set null" }),
    villaId: uuid("villa_id").references(() => villas.id, { onDelete: "set null" }),
    requestedBy: uuid("requested_by").references(() => appUsers.id, { onDelete: "set null" }),
    supplierId: uuid("supplier_id").references(() => suppliers.id, { onDelete: "set null" }),
    title: text("title").notNull(),
    description: text("description"),
    priority: text("priority").notNull().default("normal"),
    status: text("status").notNull().default("draft"),
    requiredBy: date("required_by"),
    totalEstimatedMinor: bigint("total_estimated_minor", { mode: "bigint" }),
    currency: text("currency"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("pr_status_idx").on(t.status),
    index("pr_project_idx").on(t.projectId),
    index("pr_supplier_idx").on(t.supplierId),
    index("pr_org_idx").on(t.organizationId),
  ],
);

export const purchaseRequestLines = pgTable(
  "purchase_request_lines",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    // TENANCY (0153): nullable org anchor + backfill. No threading yet.
    organizationId: uuid("organization_id").references(() => organizations.id, {
      onDelete: "restrict",
    }),
    requestId: uuid("request_id")
      .notNull()
      .references(() => purchaseRequests.id, { onDelete: "cascade" }),
    itemId: uuid("item_id").references(() => inventoryItems.id, { onDelete: "set null" }),
    description: text("description").notNull(),
    quantity: numeric("quantity").notNull(),
    unit: text("unit").notNull().default("pcs"),
    estimatedUnitCostMinor: bigint("estimated_unit_cost_minor", { mode: "bigint" }),
    currency: text("currency"),
    notes: text("notes"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("pr_lines_request_idx").on(t.requestId),
    index("pr_lines_org_idx").on(t.organizationId),
  ],
);

export const purchaseOrders = pgTable(
  "purchase_orders",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    // TENANCY (0153): nullable org anchor + backfill. No threading yet.
    organizationId: uuid("organization_id").references(() => organizations.id, {
      onDelete: "restrict",
    }),
    poCode: text("po_code").notNull().unique(),
    requestId: uuid("request_id").references(() => purchaseRequests.id, { onDelete: "set null" }),
    supplierId: uuid("supplier_id").references(() => suppliers.id, { onDelete: "set null" }),
    projectId: uuid("project_id").references(() => projects.id, { onDelete: "set null" }),
    villaId: uuid("villa_id").references(() => villas.id, { onDelete: "set null" }),
    status: text("status").notNull().default("draft"),
    orderedBy: uuid("ordered_by").references(() => appUsers.id, { onDelete: "set null" }),
    orderedAt: timestamp("ordered_at", { withTimezone: true }),
    expectedDelivery: date("expected_delivery"),
    receivedAt: timestamp("received_at", { withTimezone: true }),
    currency: text("currency"),
    totalMinor: bigint("total_minor", { mode: "bigint" }),
    notes: text("notes"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("po_status_idx").on(t.status),
    index("po_supplier_idx").on(t.supplierId),
    index("po_request_idx").on(t.requestId),
    index("po_org_idx").on(t.organizationId),
  ],
);

export const purchaseOrderLines = pgTable(
  "purchase_order_lines",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    // TENANCY (0153): nullable org anchor + backfill. No threading yet.
    organizationId: uuid("organization_id").references(() => organizations.id, {
      onDelete: "restrict",
    }),
    purchaseOrderId: uuid("purchase_order_id")
      .notNull()
      .references(() => purchaseOrders.id, { onDelete: "cascade" }),
    itemId: uuid("item_id").references(() => inventoryItems.id, { onDelete: "set null" }),
    description: text("description").notNull(),
    quantityOrdered: numeric("quantity_ordered").notNull(),
    quantityReceived: numeric("quantity_received").notNull().default("0"),
    unit: text("unit").notNull().default("pcs"),
    unitCostMinor: bigint("unit_cost_minor", { mode: "bigint" }),
    currency: text("currency"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("po_lines_po_idx").on(t.purchaseOrderId),
    index("po_lines_org_idx").on(t.organizationId),
  ],
);

export const inventoryCounts = pgTable(
  "inventory_counts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    // TENANCY (0153): nullable org anchor + backfill. No threading yet.
    organizationId: uuid("organization_id").references(() => organizations.id, {
      onDelete: "restrict",
    }),
    countCode: text("count_code").notNull().unique(),
    locationId: uuid("location_id")
      .notNull()
      .references(() => inventoryLocations.id, { onDelete: "cascade" }),
    status: text("status").notNull().default("draft"),
    countedBy: uuid("counted_by").references(() => appUsers.id, { onDelete: "set null" }),
    approvedBy: uuid("approved_by").references(() => appUsers.id, { onDelete: "set null" }),
    countedAt: timestamp("counted_at", { withTimezone: true }),
    approvedAt: timestamp("approved_at", { withTimezone: true }),
    notes: text("notes"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("inv_counts_location_idx").on(t.locationId),
    index("inv_counts_status_idx").on(t.status),
    index("inv_counts_org_idx").on(t.organizationId),
  ],
);

export const inventoryCountLines = pgTable(
  "inventory_count_lines",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    // TENANCY (0153): nullable org anchor + backfill. No threading yet.
    organizationId: uuid("organization_id").references(() => organizations.id, {
      onDelete: "restrict",
    }),
    countId: uuid("count_id")
      .notNull()
      .references(() => inventoryCounts.id, { onDelete: "cascade" }),
    itemId: uuid("item_id")
      .notNull()
      .references(() => inventoryItems.id, { onDelete: "cascade" }),
    expectedQuantity: numeric("expected_quantity"),
    countedQuantity: numeric("counted_quantity").notNull(),
    varianceQuantity: numeric("variance_quantity"),
    notes: text("notes"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("inv_count_lines_count_idx").on(t.countId),
    index("inv_count_lines_org_idx").on(t.organizationId),
  ],
);

export type Supplier = typeof suppliers.$inferSelect;
export type InventoryLocation = typeof inventoryLocations.$inferSelect;
export type InventoryCategory = typeof inventoryCategories.$inferSelect;
export type InventoryItem = typeof inventoryItems.$inferSelect;
export type InventoryStockLevel = typeof inventoryStockLevels.$inferSelect;
export type InventoryMovement = typeof inventoryMovements.$inferSelect;
export type NewInventoryMovement = typeof inventoryMovements.$inferInsert;
export type TaskMaterialUsage = typeof taskMaterialUsage.$inferSelect;
export type PurchaseRequest = typeof purchaseRequests.$inferSelect;
export type PurchaseRequestLine = typeof purchaseRequestLines.$inferSelect;
export type PurchaseOrder = typeof purchaseOrders.$inferSelect;
export type PurchaseOrderLine = typeof purchaseOrderLines.$inferSelect;
export type InventoryCount = typeof inventoryCounts.$inferSelect;
export type InventoryCountLine = typeof inventoryCountLines.$inferSelect;
