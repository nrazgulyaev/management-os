import { z } from "zod";

/**
 * Zod input schemas for the statement-transparency server actions.
 * Centralised here so admin forms / CLI utilities share the same shape.
 */

export const statementIdSchema = z.object({
  statementId: z.string().uuid(),
});

export const ownerIdSchema = z.object({
  ownerId: z.string().uuid(),
});

export const warningIdSchema = z.object({
  warningId: z.string().uuid(),
});

export const bulkRebuildSchema = z.object({
  withinDays: z.coerce.number().int().min(1).max(365).optional(),
  status: z.enum(["draft", "issued", "approved"]).optional(),
});
