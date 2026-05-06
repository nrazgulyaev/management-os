import "server-only";

import { eq } from "drizzle-orm";
import { z } from "zod";
import { requireDb } from "@/lib/db/client";
import { waterfallRules } from "@/lib/db/schema/waterfall-rules";
import { requireInternalUser } from "@/features/auth/permissions";
import type { WaterfallRuleType } from "./waterfall-helpers";

const ruleTypes = [
  "generic_50_50",
  "arconique_25_credit",
  "preferred_return_then_split",
  "waterfall_with_hurdle",
  "capital_first_then_split",
  "tiered_promote",
  "custom",
] as const satisfies readonly WaterfallRuleType[];

const createRuleSchema = z
  .object({
    scope: z.enum(["project", "commitment"]),
    projectId: z.string().uuid().nullable().optional(),
    commitmentId: z.string().uuid().nullable().optional(),
    ruleLabel: z.string().min(1),
    ruleType: z.enum(ruleTypes),
    ruleParameters: z.record(z.unknown()).default({}),
    effectiveFrom: z.string().optional(),
    effectiveUntil: z.string().nullable().optional(),
    description: z.string().nullable().optional(),
    legalReference: z.string().nullable().optional(),
    notes: z.string().nullable().optional(),
  })
  .superRefine((value, ctx) => {
    if (value.scope === "project") {
      if (!value.projectId) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "projectId required when scope='project'",
          path: ["projectId"],
        });
      }
      if (value.commitmentId) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "commitmentId must be null when scope='project'",
          path: ["commitmentId"],
        });
      }
    } else {
      if (!value.commitmentId) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "commitmentId required when scope='commitment'",
          path: ["commitmentId"],
        });
      }
      if (value.projectId) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "projectId must be null when scope='commitment'",
          path: ["projectId"],
        });
      }
    }
  });

export async function createWaterfallRule(
  input: z.input<typeof createRuleSchema>,
) {
  await requireInternalUser();
  const parsed = createRuleSchema.parse(input);
  const db = requireDb();
  const [row] = await db
    .insert(waterfallRules)
    .values({
      scope: parsed.scope,
      projectId: parsed.projectId ?? null,
      commitmentId: parsed.commitmentId ?? null,
      ruleLabel: parsed.ruleLabel,
      ruleType: parsed.ruleType,
      ruleParameters: parsed.ruleParameters,
      effectiveFrom: parsed.effectiveFrom ?? new Date().toISOString().slice(0, 10),
      effectiveUntil: parsed.effectiveUntil ?? null,
      description: parsed.description ?? null,
      legalReference: parsed.legalReference ?? null,
      notes: parsed.notes ?? null,
    })
    .returning();
  return row;
}

export async function deactivateWaterfallRule(input: { id: string }) {
  await requireInternalUser();
  const db = requireDb();
  const [row] = await db
    .update(waterfallRules)
    .set({ isActive: false, effectiveUntil: new Date().toISOString().slice(0, 10) })
    .where(eq(waterfallRules.id, input.id))
    .returning();
  return row;
}

const updateParamsSchema = z.object({
  id: z.string().uuid(),
  ruleParameters: z.record(z.unknown()),
});

export async function updateWaterfallRuleParameters(
  input: z.input<typeof updateParamsSchema>,
) {
  await requireInternalUser();
  const parsed = updateParamsSchema.parse(input);
  const db = requireDb();
  const [row] = await db
    .update(waterfallRules)
    .set({ ruleParameters: parsed.ruleParameters })
    .where(eq(waterfallRules.id, parsed.id))
    .returning();
  return row;
}
