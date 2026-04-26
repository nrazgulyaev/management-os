import { z } from "zod";

const optionalUuid = z
  .string()
  .uuid()
  .optional()
  .or(z.literal(""))
  .transform((v) => (v === "" ? undefined : v));

const optionalText = z.string().max(2000).optional().or(z.literal(""));

const currency3 = z
  .string()
  .length(3, "currency must be 3 letters")
  .toUpperCase();

export const supplierTypeEnum = z.enum([
  "general",
  "linens",
  "toiletries",
  "maintenance",
  "electrical",
  "plumbing",
  "furniture",
  "construction",
  "chemicals",
  "food_beverage",
  "service",
]);

export const locationTypeEnum = z.enum([
  "warehouse",
  "villa_storage",
  "housekeeping_cart",
  "maintenance_room",
  "supplier",
  "disposal",
]);

export const itemTypeEnum = z.enum([
  "consumable",
  "linen",
  "towel",
  "amenity",
  "chemical",
  "spare_part",
  "equipment",
  "furniture",
  "appliance",
  "tool",
]);

export const movementTypeEnum = z.enum([
  "receive",
  "consume",
  "transfer",
  "adjust",
  "damage",
  "write_off",
  "return_to_supplier",
  "count_correction",
]);

// -----------------------------------------------------------------------------
// Suppliers
// -----------------------------------------------------------------------------
export const createSupplierSchema = z.object({
  name: z.string().min(2).max(200),
  supplierType: supplierTypeEnum.default("general"),
  contactName: optionalText,
  email: z.string().email().optional().or(z.literal("")),
  phone: optionalText,
  whatsapp: optionalText,
  website: z.string().url().optional().or(z.literal("")),
  address: optionalText,
  country: optionalText,
  currency: currency3.optional().or(z.literal("")),
  paymentTerms: optionalText,
  taxId: optionalText,
  notes: optionalText,
});
export type CreateSupplierInput = z.infer<typeof createSupplierSchema>;

// -----------------------------------------------------------------------------
// Locations
// -----------------------------------------------------------------------------
export const createInventoryLocationSchema = z.object({
  name: z.string().min(2).max(200),
  locationType: locationTypeEnum.default("warehouse"),
  description: optionalText,
  projectId: optionalUuid,
  villaId: optionalUuid,
});

// -----------------------------------------------------------------------------
// Categories
// -----------------------------------------------------------------------------
export const createInventoryCategorySchema = z.object({
  key: z.string().min(2).max(60).regex(/^[a-z][a-z0-9_]*$/),
  name: z.string().min(2).max(120),
  parentId: optionalUuid,
  defaultUnit: z.string().min(1).max(20).default("pcs"),
  isConsumable: z.coerce.boolean().optional().default(true),
});

// -----------------------------------------------------------------------------
// Items
// -----------------------------------------------------------------------------
export const createInventoryItemSchema = z.object({
  name: z.string().min(2).max(200),
  sku: z.string().max(64).optional().or(z.literal("")),
  categoryId: optionalUuid,
  defaultSupplierId: optionalUuid,
  unit: z.string().min(1).max(20).default("pcs"),
  itemType: itemTypeEnum.default("consumable"),
  description: optionalText,
  brand: optionalText,
  model: optionalText,
  barcode: optionalText,
  reorderPoint: z.coerce.number().nonnegative().optional(),
  reorderQuantity: z.coerce.number().nonnegative().optional(),
  unitCostMinor: z.coerce.bigint().optional(),
  currency: currency3.optional().or(z.literal("")),
  ownerChargeable: z.coerce.boolean().optional().default(true),
  trackSerial: z.coerce.boolean().optional().default(false),
});

// -----------------------------------------------------------------------------
// Movements
// -----------------------------------------------------------------------------
export const createMovementSchema = z.object({
  itemId: z.string().uuid(),
  movementType: movementTypeEnum,
  fromLocationId: optionalUuid,
  toLocationId: optionalUuid,
  quantity: z.coerce.number(),
  reason: optionalText,
  taskId: optionalUuid,
  checklistItemId: optionalUuid,
  damageReportId: optionalUuid,
  purchaseOrderId: optionalUuid,
  unitCostMinor: z.coerce.bigint().optional(),
  currency: currency3.optional().or(z.literal("")),
  allowNegative: z.coerce.boolean().optional().default(false),
});

export const taskMaterialUsageSchema = z.object({
  taskId: z.string().uuid(),
  itemId: z.string().uuid(),
  locationId: z.string().uuid(),
  quantity: z.coerce.number().positive(),
  notes: optionalText,
});

// -----------------------------------------------------------------------------
// Counts
// -----------------------------------------------------------------------------
export const createInventoryCountSchema = z.object({
  locationId: z.string().uuid(),
  notes: optionalText,
});

export type CreateInventoryItemInput = z.infer<typeof createInventoryItemSchema>;
export type CreateMovementInput = z.infer<typeof createMovementSchema>;
export type TaskMaterialUsageInput = z.infer<typeof taskMaterialUsageSchema>;
