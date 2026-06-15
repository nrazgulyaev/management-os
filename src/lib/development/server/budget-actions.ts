import "server-only";

import { eq, and, isNull, sql } from "drizzle-orm";
import { z } from "zod";
import { requireDb } from "@/lib/db/client";
import { devBudgetLines } from "@/lib/db/schema/dev-finance";
import { projects } from "@/lib/db/schema/projects";
import { SUPPORTED_CURRENCIES } from "@/lib/development/constants/investor-constants";
import { requireOrgId } from "@/features/auth/require-org";

const createSchema = z.object({
  projectId: z.string().uuid(),
  categoryId: z.string().uuid(),
  unitId: z.string().uuid().optional().nullable(),
  budgetedAmountUsdMinor: z.union([z.bigint(), z.string(), z.number()]),
  budgetedAtCurrency: z.enum(SUPPORTED_CURRENCIES).default("USD"),
  budgetedAmountOriginalMinor: z
    .union([z.bigint(), z.string(), z.number()])
    .optional()
    .nullable(),
  budgetedFxRate: z
    .string()
    .regex(/^\d+(\.\d+)?$/)
    .optional()
    .nullable(),
  effectiveFrom: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  notes: z.string().optional().nullable(),
});

const toBig = (v: bigint | string | number): bigint =>
  typeof v === "bigint"
    ? v
    : BigInt(typeof v === "number" ? Math.trunc(v) : v);

/**
 * **`createBudgetLine`** — atomic. If a non-superseded line already
 * exists for the same (project, category, unit), mark it superseded
 * and increment `budget_version` for the new row.
 */
export async function createBudgetLine(
  input: z.input<typeof createSchema>,
): Promise<{ id: string; budgetVersion: number }> {
  const parsed = createSchema.parse(input);
  const db = requireDb();
  const orgId = await requireOrgId();

  // dev_budget_lines has no organization_id column — org is anchored
  // through the project. Verify the client-supplied projectId belongs to
  // the caller's org BEFORE any insert/supersession, so a tenant cannot
  // write a budget line against (or supersede) another org's project.
  const [ownProject] = await db
    .select({ id: projects.id })
    .from(projects)
    .where(
      and(eq(projects.id, parsed.projectId), eq(projects.organizationId, orgId)),
    )
    .limit(1);
  if (!ownProject) throw new Error("Project not found");

  return await db.transaction(async (tx) => {
    const conditions = [
      eq(devBudgetLines.projectId, parsed.projectId),
      eq(devBudgetLines.categoryId, parsed.categoryId),
      isNull(devBudgetLines.supersededAt),
    ];
    if (parsed.unitId) {
      conditions.push(eq(devBudgetLines.unitId, parsed.unitId));
    } else {
      conditions.push(isNull(devBudgetLines.unitId));
    }

    const existing = await tx
      .select({ id: devBudgetLines.id, version: devBudgetLines.budgetVersion })
      .from(devBudgetLines)
      .where(and(...conditions))
      .orderBy(devBudgetLines.budgetVersion);

    const nextVersion =
      existing.length > 0
        ? Math.max(...existing.map((e) => e.version)) + 1
        : 1;

    const [row] = await tx
      .insert(devBudgetLines)
      .values({
        projectId: parsed.projectId,
        categoryId: parsed.categoryId,
        unitId: parsed.unitId ?? null,
        budgetedAmountUsdMinor: toBig(parsed.budgetedAmountUsdMinor),
        budgetedAtCurrency: parsed.budgetedAtCurrency,
        budgetedAmountOriginalMinor:
          parsed.budgetedAmountOriginalMinor != null
            ? toBig(parsed.budgetedAmountOriginalMinor)
            : null,
        budgetedFxRate: parsed.budgetedFxRate ?? null,
        budgetVersion: nextVersion,
        effectiveFrom: parsed.effectiveFrom,
        notes: parsed.notes ?? null,
      })
      .returning({
        id: devBudgetLines.id,
        budgetVersion: devBudgetLines.budgetVersion,
      });

    if (existing.length > 0) {
      const supersededAt = new Date();
      for (const e of existing) {
        await tx
          .update(devBudgetLines)
          .set({
            supersededAt,
            supersededById: row.id,
            updatedAt: new Date(),
          })
          .where(eq(devBudgetLines.id, e.id));
      }
    }

    return row;
  });
}

const updateSchema = z.object({
  id: z.string().uuid(),
  budgetedAmountUsdMinor: z.union([z.bigint(), z.string(), z.number()]),
  effectiveFrom: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  notes: z.string().optional().nullable(),
});

export async function updateBudgetLine(
  input: z.input<typeof updateSchema>,
): Promise<{ id: string; budgetVersion: number }> {
  const parsed = updateSchema.parse(input);
  const db = requireDb();
  const orgId = await requireOrgId();
  // dev_budget_lines has no organization_id — anchor org via the line's
  // project; reject if the line's project is not in the caller's org.
  const [old] = await db
    .select({
      id: devBudgetLines.id,
      projectId: devBudgetLines.projectId,
      categoryId: devBudgetLines.categoryId,
      unitId: devBudgetLines.unitId,
      budgetedAtCurrency: devBudgetLines.budgetedAtCurrency,
    })
    .from(devBudgetLines)
    .innerJoin(projects, eq(projects.id, devBudgetLines.projectId))
    .where(
      and(
        eq(devBudgetLines.id, parsed.id),
        eq(projects.organizationId, orgId),
      ),
    )
    .limit(1);
  if (!old) throw new Error("Budget line not found");
  // Reuse createBudgetLine semantics — supersedes the old row.
  return await createBudgetLine({
    projectId: old.projectId,
    categoryId: old.categoryId,
    unitId: old.unitId,
    budgetedAmountUsdMinor: parsed.budgetedAmountUsdMinor,
    budgetedAtCurrency: old.budgetedAtCurrency as
      | "USD"
      | "IDR"
      | "RUB"
      | "EUR"
      | "USDT"
      | "CNY",
    effectiveFrom: parsed.effectiveFrom,
    notes: parsed.notes,
  });
}

/**
 * Hard-deletes a budget line ONLY if no transactions or commitments
 * reference its (project_id, category_id) combo. This is conservative —
 * it prevents an operator from accidentally orphaning the variance
 * report. To deactivate without deletion, use the supersession flow.
 */
export async function deleteBudgetLine(id: string): Promise<void> {
  const db = requireDb();
  const orgId = await requireOrgId();
  // dev_budget_lines has no organization_id — anchor org via the line's
  // project so a tenant cannot delete another org's budget line by id.
  const [line] = await db
    .select({
      projectId: devBudgetLines.projectId,
      categoryId: devBudgetLines.categoryId,
    })
    .from(devBudgetLines)
    .innerJoin(projects, eq(projects.id, devBudgetLines.projectId))
    .where(and(eq(devBudgetLines.id, id), eq(projects.organizationId, orgId)))
    .limit(1);
  if (!line) throw new Error("Budget line not found");

  const [refs] = await db.execute(sql`
    SELECT
      (SELECT count(*)::int FROM dev_transactions
        WHERE project_id = ${line.projectId} AND category_id = ${line.categoryId})
        AS tx_count,
      (SELECT count(*)::int FROM dev_commitments_ledger
        WHERE project_id = ${line.projectId} AND category_id = ${line.categoryId})
        AS commit_count
  `);
  const r = (refs ?? {}) as Record<string, unknown>;
  const txCount = Number(r.tx_count ?? 0);
  const commitCount = Number(r.commit_count ?? 0);
  if (txCount > 0 || commitCount > 0) {
    throw new Error(
      `Cannot delete budget line: ${txCount} transactions and ${commitCount} commitments reference this category in this project. Use supersession instead.`,
    );
  }
  await db.delete(devBudgetLines).where(eq(devBudgetLines.id, id));
}
