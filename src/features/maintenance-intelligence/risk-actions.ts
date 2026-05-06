"use server";

import { revalidatePath } from "next/cache";
import { recordAuditEvent } from "@/features/audit/services";
import { getCurrentAppUser } from "@/features/auth/current-user";
import { requirePermission } from "@/features/auth/permissions";
import { scanMaintenanceRisks } from "./risk";
import type { ActionResult } from "@/features/projects/actions";

export async function scanMaintenanceRisksServerAction(
  _prev: ActionResult | null,
  _formData: FormData,
): Promise<
  ActionResult & {
    overdueMaintenance?: number;
    utilityLowBalance?: number;
    utilityCriticalBalance?: number;
    noRecentReading?: number;
    repeatedTicket?: number;
    upcomingGuestConflict?: number;
    arrivalNotReady?: number;
  }
> {
  void _formData;
  await requirePermission("maintenance_risk.manage");
  const me = await getCurrentAppUser();
  const out = await scanMaintenanceRisks();
  await recordAuditEvent({
    actorUserId: me?.id ?? null,
    action: "maintenance_risk.scan",
    entityType: "maintenance_risk_event",
    entityId: null,
    after: out,
  });
  revalidatePath("/dashboard/maintenance-intelligence/risks");
  revalidatePath("/dashboard/operations");
  return { ok: true, ...out };
}
