import { z } from "zod";

export const grantTypeEnum = z.enum([
  "owner_portal",
  "investor_readonly",
  "finance_approver",
]);

export const createGrantSchema = z.object({
  appUserId: z.string().uuid(),
  ownerId: z.string().uuid(),
  grantType: grantTypeEnum.default("owner_portal"),
  notes: z.string().max(500).optional().or(z.literal("")),
});

export const grantIdSchema = z.object({
  id: z.string().uuid(),
});

export type CreateGrantInput = z.infer<typeof createGrantSchema>;
export type GrantType = z.infer<typeof grantTypeEnum>;
