"use server";

import { revalidatePath } from "next/cache";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "@/lib/db/client";
import { orgStatementSettings } from "@/lib/db/schema/finance";
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

const statementSettingsSchema = z.object({
  includeFees: checkbox,
  includeExpenses: checkbox,
  includeManagementFee: checkbox,
  taxMode: modeSchema,
  taxPct: pctSchema,
  taxLabel: z.string().trim().min(1).max(60),
  reserveMode: modeSchema,
  reservePct: pctSchema,
  reserveLabel: z.string().trim().min(1).max(60),
  mgmtLabel: z.string().trim().min(1).max(60),
  statementCurrency: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^[A-Z]{3}$/, "Use a 3-letter currency code"),
});

/**
 * STATEMENT-SETTINGS — upsert the per-org statement configuration. Keyed on
 * organization_id (one row per org, unique index from migration 0182). Gated by
 * finance.write + org-scoped; audited.
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
  const values = {
    organizationId,
    includeFees: data.includeFees,
    includeExpenses: data.includeExpenses,
    includeManagementFee: data.includeManagementFee,
    taxMode: data.taxMode,
    taxPct: data.taxPct.toFixed(3),
    taxLabel: data.taxLabel,
    reserveMode: data.reserveMode,
    reservePct: data.reservePct.toFixed(3),
    reserveLabel: data.reserveLabel,
    mgmtLabel: data.mgmtLabel,
    statementCurrency: data.statementCurrency,
    updatedAt: new Date(),
    updatedBy: me?.id ?? null,
  };

  // UPSERT keyed on organization_id (the unique index). Insert or, on conflict,
  // update the existing row — there is at most one row per org.
  await db
    .insert(orgStatementSettings)
    .values(values)
    .onConflictDoUpdate({
      target: orgStatementSettings.organizationId,
      set: {
        includeFees: values.includeFees,
        includeExpenses: values.includeExpenses,
        includeManagementFee: values.includeManagementFee,
        taxMode: values.taxMode,
        taxPct: values.taxPct,
        taxLabel: values.taxLabel,
        reserveMode: values.reserveMode,
        reservePct: values.reservePct,
        reserveLabel: values.reserveLabel,
        mgmtLabel: values.mgmtLabel,
        statementCurrency: values.statementCurrency,
        updatedAt: values.updatedAt,
        updatedBy: values.updatedBy,
      },
    });

  await recordAuditEvent({
    actorUserId: me?.id ?? null,
    organizationId,
    action: "finance.statement_settings.update",
    entityType: "org_statement_settings",
    entityId: null,
    metadata: {
      includeFees: data.includeFees,
      includeExpenses: data.includeExpenses,
      includeManagementFee: data.includeManagementFee,
      taxMode: data.taxMode,
      taxPct: data.taxPct,
      reserveMode: data.reserveMode,
      reservePct: data.reservePct,
      statementCurrency: data.statementCurrency,
    },
  });

  revalidatePath(SETTINGS_PATH);
  return { ok: true };
}
