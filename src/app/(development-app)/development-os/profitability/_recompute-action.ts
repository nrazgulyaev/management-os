"use server";

import { requireInternalUser } from "@/features/auth/permissions";
import { recordAuditEvent } from "@/features/audit/services";
import { recomputeAllProfitability } from "@/lib/development/server/profitability/profitability-aggregation";

/**
 * Manual "Recompute" trigger for /development-os/profitability.
 *
 * Same engine the Sunday cron runs — rolls the dev budget + transaction
 * ledger into per-project cost pools and rewrites `unit_cost_allocations`.
 * Internal-only; the money/state write is audit-logged.
 */
export async function recomputeProfitabilityAction(): Promise<{
  projectsScanned: number;
  projectsRecomputed: number;
  allocationsWritten: number;
}> {
  const ctx = await requireInternalUser();

  const run = await recomputeAllProfitability(undefined, ctx.appUser?.id ?? null);

  await recordAuditEvent({
    action: "profitability.recompute",
    entityType: "unit_cost_allocation",
    entityId: null,
    actorUserId: ctx.appUser?.id ?? null,
    metadata: {
      trigger: "manual",
      projectsScanned: run.projectsScanned,
      projectsRecomputed: run.projectsRecomputed,
      allocationsWritten: run.allocationsWritten,
    },
  });

  return {
    projectsScanned: run.projectsScanned,
    projectsRecomputed: run.projectsRecomputed,
    allocationsWritten: run.allocationsWritten,
  };
}
