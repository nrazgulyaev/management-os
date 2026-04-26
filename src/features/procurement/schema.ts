import { z } from "zod";

const optionalUuid = z
  .string()
  .uuid()
  .optional()
  .or(z.literal(""))
  .transform((v) => (v === "" ? undefined : v));

const optionalText = z.string().max(2000).optional().or(z.literal(""));

const currency3 = z.string().length(3).toUpperCase();

export const purchaseRequestStatusEnum = z.enum([
  "draft",
  "submitted",
  "approved",
  "rejected",
  "ordered",
  "cancelled",
]);

export const purchaseOrderStatusEnum = z.enum([
  "draft",
  "sent",
  "confirmed",
  "partially_received",
  "received",
  "cancelled",
]);

export const PR_TRANSITIONS: Record<string, string[]> = {
  draft: ["submitted", "cancelled"],
  submitted: ["approved", "rejected", "cancelled"],
  approved: ["ordered", "cancelled"],
  rejected: ["draft", "cancelled"],
  ordered: [],
  cancelled: [],
};

export const PO_TRANSITIONS: Record<string, string[]> = {
  draft: ["sent", "cancelled"],
  sent: ["confirmed", "partially_received", "received", "cancelled"],
  confirmed: ["partially_received", "received", "cancelled"],
  partially_received: ["received", "cancelled"],
  received: [],
  cancelled: [],
};

export function canTransition(
  table: Record<string, string[]>,
  from: string,
  to: string,
): boolean {
  if (from === to) return true;
  return (table[from] ?? []).includes(to);
}

// -----------------------------------------------------------------------------
// Purchase requests
// -----------------------------------------------------------------------------
export const createPurchaseRequestSchema = z.object({
  title: z.string().min(2).max(200),
  description: optionalText,
  priority: z.enum(["low", "normal", "high", "urgent"]).default("normal"),
  projectId: optionalUuid,
  villaId: optionalUuid,
  supplierId: optionalUuid,
  requiredBy: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().or(z.literal("")),
  totalEstimatedMinor: z.coerce.bigint().optional(),
  currency: currency3.optional().or(z.literal("")),
});

export const purchaseRequestIdSchema = z.object({ id: z.string().uuid() });

export const purchaseRequestLineSchema = z.object({
  requestId: z.string().uuid(),
  itemId: optionalUuid,
  description: z.string().min(2).max(500),
  quantity: z.coerce.number().positive(),
  unit: z.string().min(1).max(20).default("pcs"),
  estimatedUnitCostMinor: z.coerce.bigint().optional(),
  currency: currency3.optional().or(z.literal("")),
  notes: optionalText,
});

// -----------------------------------------------------------------------------
// Purchase orders
// -----------------------------------------------------------------------------
export const createPurchaseOrderSchema = z.object({
  supplierId: optionalUuid,
  projectId: optionalUuid,
  villaId: optionalUuid,
  requestId: optionalUuid,
  expectedDelivery: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional()
    .or(z.literal("")),
  currency: currency3.optional().or(z.literal("")),
  notes: optionalText,
});

export const purchaseOrderIdSchema = z.object({ id: z.string().uuid() });

export const receivePurchaseOrderLineSchema = z.object({
  purchaseOrderId: z.string().uuid(),
  lineId: z.string().uuid(),
  receivedQuantity: z.coerce.number().nonnegative(),
  toLocationId: z.string().uuid(),
});

export type CreatePurchaseRequestInput = z.infer<typeof createPurchaseRequestSchema>;
export type CreatePurchaseOrderInput = z.infer<typeof createPurchaseOrderSchema>;
