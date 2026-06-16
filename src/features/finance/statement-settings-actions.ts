"use server";

import { revalidatePath } from "next/cache";
import { and, eq, isNull } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "@/lib/db/client";
import {
  orgStatementSettings,
  orgStatementCustomDeductions,
} from "@/lib/db/schema/finance";
import { recordAuditEvent } from "@/features/audit/services";
import { getCurrentAppUser } from "@/features/auth/current-user";
import { requirePermission } from "@/features/auth/permissions";
import { requireOrgId } from "@/features/auth/require-org";
import type { ActionResult } from "@/features/projects/actions";

const SETTINGS_PATH = "/dashboard/finance/statement-settings";

const modeSchema = z.enum(["off", "ledger", "formula"]);
const pctSchema = z.coerce.number().min(0).max(100);
const checkbox = z
  .union([z.literal("on"), z.literal("true"), z.literal("false"), z.literal("")])
  .optional()
  .transform((v) => v === "on" || v === "true");

// Optional scope ids — empty string ("" from an unset <select>) coerces to null
// so the row lands at the org-default / project scope correctly.
const optionalUuid = z
  .union([z.string().uuid(), z.literal("")])
  .optional()
  .transform((v) => (v ? v : null));

const statementSettingsSchema = z.object({
  // SCOPE (0183): both null → org-default; projectId set → whole project;
  // ownerId set → single owner (most-specific wins at read time).
  projectId: optionalUuid,
  ownerId: optionalUuid,
  includeFees: checkbox,
  includeExpenses: checkbox,
  includeManagementFee: checkbox,
  taxMode: modeSchema,
  taxPct: pctSchema,
  taxLabel: z.string().trim().min(1).max(60),
  reserveMode: modeSchema,
  reservePct: pctSchema,
  reserveLabel: z.string().trim().min(1).max(60),
  mgmtMode: modeSchema,
  mgmtPct: pctSchema,
  mgmtLabel: z.string().trim().min(1).max(60),
  revenueSource: z.enum(["ledger", "bookings"]),
  statementCurrency: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^[A-Z]{3}$/, "Use a 3-letter currency code"),
});

/**
 * STATEMENT-SETTINGS — upsert the per-SCOPE statement configuration. Keyed on
 * (organization_id, project_id, owner_id) — the scope unique index from
 * migration 0183. Both scope ids null = the org-default row (#284's behavior).
 * Gated by finance.write + org-scoped; audited.
 *
 * The unique index COALESCEs the nullable scope cols, so onConflictDoUpdate can't
 * target a partial/expression index directly — we resolve the existing row by an
 * org + (IS NULL | =) scope predicate and update-or-insert explicitly.
 */
export async function updateStatementSettingsAction(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  await requirePermission("finance.write");
  const organizationId = await requireOrgId();

  const parsed = statementSettingsSchema.safeParse(
    Object.fromEntries(formData.entries()),
  );
  if (!parsed.success) {
    return {
      ok: false,
      error: "Please review the form.",
      fieldErrors: parsed.error.flatten().fieldErrors as Record<string, string[]>,
    };
  }

  const db = getDb();
  if (!db) return { ok: false, error: "Database is not configured." };

  const me = await getCurrentAppUser();
  const data = parsed.data;
  const { projectId, ownerId } = data;

  const writableValues = {
    includeFees: data.includeFees,
    includeExpenses: data.includeExpenses,
    includeManagementFee: data.includeManagementFee,
    taxMode: data.taxMode,
    taxPct: data.taxPct.toFixed(3),
    taxLabel: data.taxLabel,
    reserveMode: data.reserveMode,
    reservePct: data.reservePct.toFixed(3),
    reserveLabel: data.reserveLabel,
    mgmtMode: data.mgmtMode,
    mgmtPct: data.mgmtPct.toFixed(3),
    mgmtLabel: data.mgmtLabel,
    revenueSource: data.revenueSource,
    statementCurrency: data.statementCurrency,
    updatedAt: new Date(),
    updatedBy: me?.id ?? null,
  };

  // Resolve the existing row at EXACTLY this scope (org + IS NULL/= on each
  // scope col). The COALESCE-on-NULL unique index means we can't lean on
  // onConflict here.
  const [existing] = await db
    .select({ id: orgStatementSettings.id })
    .from(orgStatementSettings)
    .where(
      and(
        eq(orgStatementSettings.organizationId, organizationId),
        ownerId === null
          ? isNull(orgStatementSettings.ownerId)
          : eq(orgStatementSettings.ownerId, ownerId),
        projectId === null
          ? isNull(orgStatementSettings.projectId)
          : eq(orgStatementSettings.projectId, projectId),
      ),
    )
    .limit(1);

  if (existing) {
    await db
      .update(orgStatementSettings)
      .set(writableValues)
      .where(
        and(
          eq(orgStatementSettings.id, existing.id),
          eq(orgStatementSettings.organizationId, organizationId),
        ),
      );
  } else {
    await db.insert(orgStatementSettings).values({
      organizationId,
      projectId,
      ownerId,
      ...writableValues,
    });
  }

  await recordAuditEvent({
    actorUserId: me?.id ?? null,
    organizationId,
    action: "finance.statement_settings.update",
    entityType: "org_statement_settings",
    entityId: existing?.id ?? null,
    metadata: {
      scope: { projectId, ownerId },
      includeFees: data.includeFees,
      includeExpenses: data.includeExpenses,
      includeManagementFee: data.includeManagementFee,
      taxMode: data.taxMode,
      taxPct: data.taxPct,
      reserveMode: data.reserveMode,
      reservePct: data.reservePct,
      mgmtMode: data.mgmtMode,
      mgmtPct: data.mgmtPct,
      revenueSource: data.revenueSource,
      statementCurrency: data.statementCurrency,
    },
  });

  revalidatePath(SETTINGS_PATH);
  return { ok: true };
}

const deleteOverrideSchema = z.object({ id: z.string().uuid() });

/**
 * STATEMENT-SETTINGS — delete a per-scope OVERRIDE row (project or owner). The
 * org-default row (project_id + owner_id both NULL) is the generator's fallback
 * and CANNOT be deleted here — removing it would silently switch generation back
 * to STATEMENT_SETTINGS_DEFAULTS. Org-scoped + finance.write + audited.
 */
export async function deleteStatementSettingsOverrideAction(
  formData: FormData,
): Promise<ActionResult> {
  await requirePermission("finance.write");
  const organizationId = await requireOrgId();

  const parsed = deleteOverrideSchema.safeParse({ id: formData.get("id") });
  if (!parsed.success) return { ok: false, error: "Invalid override id." };

  const db = getDb();
  if (!db) return { ok: false, error: "Database is not configured." };

  // Org-scope the lookup AND refuse the org-default (both scope cols NULL).
  const [row] = await db
    .select({
      id: orgStatementSettings.id,
      projectId: orgStatementSettings.projectId,
      ownerId: orgStatementSettings.ownerId,
    })
    .from(orgStatementSettings)
    .where(
      and(
        eq(orgStatementSettings.id, parsed.data.id),
        eq(orgStatementSettings.organizationId, organizationId),
      ),
    )
    .limit(1);

  if (!row) return { ok: false, error: "Override not found." };
  if (row.projectId === null && row.ownerId === null) {
    return { ok: false, error: "The org-default settings cannot be deleted." };
  }

  await db
    .delete(orgStatementSettings)
    .where(
      and(
        eq(orgStatementSettings.id, row.id),
        eq(orgStatementSettings.organizationId, organizationId),
      ),
    );

  const me = await getCurrentAppUser();
  await recordAuditEvent({
    actorUserId: me?.id ?? null,
    organizationId,
    action: "finance.statement_settings.delete_override",
    entityType: "org_statement_settings",
    entityId: row.id,
    metadata: { scope: { projectId: row.projectId, ownerId: row.ownerId } },
  });

  revalidatePath(SETTINGS_PATH);
  return { ok: true };
}

// ---------------------------------------------------------------------------
// CUSTOM DEDUCTIONS — operator-defined extra deduction lines (org/project/owner
// scoped). All org-scoped + finance.write + audited.
// ---------------------------------------------------------------------------

// Base object (no .refine yet) so create/update can both .extend() it before
// the cross-field check is re-applied to each.
const deductionBaseSchema = z.object({
  projectId: optionalUuid,
  ownerId: optionalUuid,
  label: z.string().trim().min(1).max(80),
  mode: z.enum(["formula", "fixed"]),
  // formula → pct % of gross; fixed → flat minor-unit amount.
  pct: z
    .union([z.coerce.number().min(0).max(100), z.literal("")])
    .optional()
    .transform((v) => (v === "" || v === undefined ? null : Number(v))),
  fixedAmountMinor: z
    .union([z.coerce.number().int(), z.literal("")])
    .optional()
    .transform((v) =>
      v === "" || v === undefined ? null : BigInt(Math.trunc(Number(v))),
    ),
  sortOrder: z.coerce.number().int().min(0).max(9999).optional().default(0),
  active: checkbox,
});

const requireScopedAmount = (d: {
  mode: "formula" | "fixed";
  pct: number | null;
  fixedAmountMinor: bigint | null;
}) => (d.mode === "formula" ? d.pct !== null : d.fixedAmountMinor !== null);

const scopedAmountIssue = {
  message: "Provide a percentage for formula deductions, or an amount for fixed.",
  path: ["mode"],
};

const deductionCreateSchema = deductionBaseSchema.refine(
  requireScopedAmount,
  scopedAmountIssue,
);

/**
 * Create a custom-deduction row at the given (org/project/owner) scope.
 * finance.write + org-scoped + audited.
 */
export async function createStatementCustomDeductionAction(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  await requirePermission("finance.write");
  const organizationId = await requireOrgId();

  const parsed = deductionCreateSchema.safeParse(
    Object.fromEntries(formData.entries()),
  );
  if (!parsed.success) {
    return {
      ok: false,
      error: "Please review the deduction.",
      fieldErrors: parsed.error.flatten().fieldErrors as Record<string, string[]>,
    };
  }

  const db = getDb();
  if (!db) return { ok: false, error: "Database is not configured." };

  const me = await getCurrentAppUser();
  const d = parsed.data;

  const [inserted] = await db
    .insert(orgStatementCustomDeductions)
    .values({
      organizationId,
      projectId: d.projectId,
      ownerId: d.ownerId,
      label: d.label,
      mode: d.mode,
      pct: d.mode === "formula" && d.pct !== null ? d.pct.toFixed(3) : null,
      fixedAmountMinor: d.mode === "fixed" ? d.fixedAmountMinor : null,
      sortOrder: d.sortOrder,
      active: d.active,
    })
    .returning({ id: orgStatementCustomDeductions.id });

  await recordAuditEvent({
    actorUserId: me?.id ?? null,
    organizationId,
    action: "finance.statement_custom_deduction.create",
    entityType: "org_statement_custom_deductions",
    entityId: inserted?.id ?? null,
    metadata: {
      scope: { projectId: d.projectId, ownerId: d.ownerId },
      label: d.label,
      mode: d.mode,
      pct: d.pct,
      fixedAmountMinor: d.fixedAmountMinor?.toString() ?? null,
      sortOrder: d.sortOrder,
      active: d.active,
    },
  });

  revalidatePath(SETTINGS_PATH);
  return { ok: true };
}

const deductionUpdateSchema = deductionBaseSchema
  .extend({ id: z.string().uuid() })
  .refine(requireScopedAmount, scopedAmountIssue);

/**
 * Update a custom-deduction row. Org-scoped lookup (can't touch another tenant's
 * row); scope is re-settable. finance.write + audited.
 */
export async function updateStatementCustomDeductionAction(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  await requirePermission("finance.write");
  const organizationId = await requireOrgId();

  const parsed = deductionUpdateSchema.safeParse(
    Object.fromEntries(formData.entries()),
  );
  if (!parsed.success) {
    return {
      ok: false,
      error: "Please review the deduction.",
      fieldErrors: parsed.error.flatten().fieldErrors as Record<string, string[]>,
    };
  }

  const db = getDb();
  if (!db) return { ok: false, error: "Database is not configured." };

  const d = parsed.data;

  // Org-scope the lookup so a foreign id silently no-ops (IDOR-safe).
  const [existing] = await db
    .select({ id: orgStatementCustomDeductions.id })
    .from(orgStatementCustomDeductions)
    .where(
      and(
        eq(orgStatementCustomDeductions.id, d.id),
        eq(orgStatementCustomDeductions.organizationId, organizationId),
      ),
    )
    .limit(1);
  if (!existing) return { ok: false, error: "Deduction not found." };

  await db
    .update(orgStatementCustomDeductions)
    .set({
      projectId: d.projectId,
      ownerId: d.ownerId,
      label: d.label,
      mode: d.mode,
      pct: d.mode === "formula" && d.pct !== null ? d.pct.toFixed(3) : null,
      fixedAmountMinor: d.mode === "fixed" ? d.fixedAmountMinor : null,
      sortOrder: d.sortOrder,
      active: d.active,
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(orgStatementCustomDeductions.id, existing.id),
        eq(orgStatementCustomDeductions.organizationId, organizationId),
      ),
    );

  const me = await getCurrentAppUser();
  await recordAuditEvent({
    actorUserId: me?.id ?? null,
    organizationId,
    action: "finance.statement_custom_deduction.update",
    entityType: "org_statement_custom_deductions",
    entityId: existing.id,
    metadata: {
      scope: { projectId: d.projectId, ownerId: d.ownerId },
      label: d.label,
      mode: d.mode,
      pct: d.pct,
      fixedAmountMinor: d.fixedAmountMinor?.toString() ?? null,
      sortOrder: d.sortOrder,
      active: d.active,
    },
  });

  revalidatePath(SETTINGS_PATH);
  return { ok: true };
}

const deductionDeleteSchema = z.object({ id: z.string().uuid() });

/**
 * Delete a custom-deduction row (hard delete). Org-scoped + finance.write +
 * audited. (Soft-disable is also possible via the active flag on update.)
 */
export async function deleteStatementCustomDeductionAction(
  formData: FormData,
): Promise<ActionResult> {
  await requirePermission("finance.write");
  const organizationId = await requireOrgId();

  const parsed = deductionDeleteSchema.safeParse({ id: formData.get("id") });
  if (!parsed.success) return { ok: false, error: "Invalid deduction id." };

  const db = getDb();
  if (!db) return { ok: false, error: "Database is not configured." };

  const [existing] = await db
    .select({
      id: orgStatementCustomDeductions.id,
      projectId: orgStatementCustomDeductions.projectId,
      ownerId: orgStatementCustomDeductions.ownerId,
    })
    .from(orgStatementCustomDeductions)
    .where(
      and(
        eq(orgStatementCustomDeductions.id, parsed.data.id),
        eq(orgStatementCustomDeductions.organizationId, organizationId),
      ),
    )
    .limit(1);
  if (!existing) return { ok: false, error: "Deduction not found." };

  await db
    .delete(orgStatementCustomDeductions)
    .where(
      and(
        eq(orgStatementCustomDeductions.id, existing.id),
        eq(orgStatementCustomDeductions.organizationId, organizationId),
      ),
    );

  const me = await getCurrentAppUser();
  await recordAuditEvent({
    actorUserId: me?.id ?? null,
    organizationId,
    action: "finance.statement_custom_deduction.delete",
    entityType: "org_statement_custom_deductions",
    entityId: existing.id,
    metadata: {
      scope: { projectId: existing.projectId, ownerId: existing.ownerId },
    },
  });

  revalidatePath(SETTINGS_PATH);
  return { ok: true };
}
