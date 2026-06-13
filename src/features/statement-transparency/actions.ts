"use server";

import { revalidatePath } from "next/cache";
import { recordAuditEvent } from "@/features/audit/services";
import { getCurrentAppUser } from "@/features/auth/current-user";
import { requirePermission } from "@/features/auth/permissions";
import { requireOrgId } from "@/features/auth/require-org";
import {
  rebuildAllStatementTransparency,
  rebuildStatementTransparency,
  rebuildStatementTransparencyForOwner,
} from "./rebuild";
import {
  acknowledgeStatementWarning,
  dismissStatementWarning,
  resolveStatementWarning,
} from "./warnings";
import {
  statementIdSchema,
  ownerIdSchema,
  warningIdSchema,
} from "./schema";
import type { ActionResult } from "@/features/projects/actions";

// -----------------------------------------------------------------------------
// Rebuild
// -----------------------------------------------------------------------------

export async function rebuildStatementTransparencyAction(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<
  ActionResult & {
    groupsInserted?: number;
    warningsInserted?: number;
  }
> {
  await requirePermission("statement_transparency.manage");
  const parsed = statementIdSchema.safeParse({
    statementId: formData.get("statementId"),
  });
  if (!parsed.success) return { ok: false, error: "Invalid statementId" };
  // TENANCY (write-flow IDOR): pass the caller org so a cross-org statementId
  // resolves to nothing and nothing is wiped/rebuilt.
  const orgId = await requireOrgId();
  const me = await getCurrentAppUser();
  const out = await rebuildStatementTransparency(
    parsed.data.statementId,
    me?.id ?? null,
    orgId,
  );
  revalidatePath(`/owner/statements/${parsed.data.statementId}`);
  revalidatePath(
    `/dashboard/finance/transparency/statements/${parsed.data.statementId}`,
  );
  revalidatePath("/dashboard/finance/transparency");
  return {
    ok: true,
    groupsInserted: out.groupsInserted,
    warningsInserted: out.warningsInserted,
  };
}

export async function rebuildAllStatementTransparencyAction(
  _prev: ActionResult | null,
  _formData: FormData,
): Promise<
  ActionResult & {
    statementsProcessed?: number;
    totalGroupsInserted?: number;
    totalWarningsInserted?: number;
  }
> {
  await requirePermission("statement_transparency.manage");
  const me = await getCurrentAppUser();
  const out = await rebuildAllStatementTransparency({}, me?.id ?? null);
  await recordAuditEvent({
    actorUserId: me?.id ?? null,
    action: "statement_transparency.rebuild_all",
    entityType: "owner_statement",
    entityId: null,
    after: out,
  });
  revalidatePath("/dashboard/finance/transparency");
  revalidatePath("/dashboard/finance/transparency/statements");
  return {
    ok: true,
    statementsProcessed: out.statementsProcessed,
    totalGroupsInserted: out.totalGroupsInserted,
    totalWarningsInserted: out.totalWarningsInserted,
  };
}

export async function rebuildStatementTransparencyForOwnerAction(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult & { statementsProcessed?: number }> {
  await requirePermission("statement_transparency.manage");
  const parsed = ownerIdSchema.safeParse({
    ownerId: formData.get("ownerId"),
  });
  if (!parsed.success) return { ok: false, error: "Invalid ownerId" };
  // TENANCY (write-flow IDOR): scope the per-owner rebuild to the caller org.
  const orgId = await requireOrgId();
  const me = await getCurrentAppUser();
  const out = await rebuildStatementTransparencyForOwner(
    parsed.data.ownerId,
    me?.id ?? null,
    orgId,
  );
  revalidatePath("/dashboard/finance/transparency");
  return { ok: true, statementsProcessed: out.statementsProcessed };
}

// -----------------------------------------------------------------------------
// Warning state changes
// -----------------------------------------------------------------------------

async function applyWarningStatus(
  warningId: string,
  status: "acknowledged" | "resolved" | "dismissed",
): Promise<ActionResult> {
  await requirePermission("statement_reconciliation.manage");
  // TENANCY (write-flow IDOR): scope the warning UPDATE to the caller org so a
  // foreign warningId fails closed (the helper returns ok:false on zero rows).
  const orgId = await requireOrgId();
  const me = await getCurrentAppUser();
  let result: { ok: boolean };
  if (status === "acknowledged")
    result = await acknowledgeStatementWarning(warningId, orgId);
  else if (status === "resolved")
    result = await resolveStatementWarning(warningId, orgId);
  else result = await dismissStatementWarning(warningId, orgId);
  if (!result.ok) return { ok: false, error: "Warning not found." };
  await recordAuditEvent({
    actorUserId: me?.id ?? null,
    action: `statement_warning.${status}`,
    entityType: "statement_reconciliation_warning",
    entityId: warningId,
  });
  revalidatePath("/dashboard/finance/transparency/warnings");
  revalidatePath("/dashboard/finance/transparency");
  return { ok: true };
}

export async function acknowledgeStatementWarningAction(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const parsed = warningIdSchema.safeParse({
    warningId: formData.get("warningId"),
  });
  if (!parsed.success) return { ok: false, error: "Invalid warningId" };
  return applyWarningStatus(parsed.data.warningId, "acknowledged");
}

export async function resolveStatementWarningAction(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const parsed = warningIdSchema.safeParse({
    warningId: formData.get("warningId"),
  });
  if (!parsed.success) return { ok: false, error: "Invalid warningId" };
  return applyWarningStatus(parsed.data.warningId, "resolved");
}

export async function dismissStatementWarningAction(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const parsed = warningIdSchema.safeParse({
    warningId: formData.get("warningId"),
  });
  if (!parsed.success) return { ok: false, error: "Invalid warningId" };
  return applyWarningStatus(parsed.data.warningId, "dismissed");
}
