"use server";

import { revalidatePath } from "next/cache";
import { recordAuditEvent } from "@/features/audit/services";
import { getCurrentAppUser } from "@/features/auth/current-user";
import { requirePermission } from "@/features/auth/permissions";
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
  const me = await getCurrentAppUser();
  const out = await rebuildStatementTransparency(
    parsed.data.statementId,
    me?.id ?? null,
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
  const me = await getCurrentAppUser();
  const out = await rebuildStatementTransparencyForOwner(
    parsed.data.ownerId,
    me?.id ?? null,
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
  const me = await getCurrentAppUser();
  if (status === "acknowledged") await acknowledgeStatementWarning(warningId);
  else if (status === "resolved") await resolveStatementWarning(warningId);
  else await dismissStatementWarning(warningId);
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
