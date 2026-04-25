import { z } from "zod";

export const docTypeEnum = z.enum([
  "contract",
  "invoice",
  "receipt",
  "photo",
  "statement",
  "kyc",
  "certificate",
  "guide",
  "policy",
  "other",
]);

export const docEntityEnum = z.enum([
  "project",
  "villa",
  "owner",
  "booking",
  "supplier",
  "task",
  "maintenance",
]);

export const docVisibilityEnum = z.enum(["internal", "owner", "guest", "public"]);
export const docStatusEnum = z.enum(["active", "archived"]);

export const createDocumentSchema = z.object({
  title: z.string().min(2).max(200),
  documentType: docTypeEnum,
  entityType: docEntityEnum,
  entityId: z.string().uuid(),
  storageBucket: z.string().max(64).optional().or(z.literal("")),
  storagePath: z.string().max(512).optional().or(z.literal("")),
  fileName: z.string().max(200).optional().or(z.literal("")),
  visibility: docVisibilityEnum.default("internal"),
  status: docStatusEnum.default("active"),
});

export type CreateDocumentInput = z.infer<typeof createDocumentSchema>;
