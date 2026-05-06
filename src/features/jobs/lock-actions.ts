"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { recordAuditEvent } from "@/features/audit/services";
import { getCurrentAppUser } from "@/features/auth/current-user";
import { requirePermission } from "@/features/auth/permissions";
import { expireStaleJobLocks, forceReleaseJobLock } from "./locks";
import type { ActionResult } from "@/features/projects/actions";

const jobKeySchema = z.object({ jobKey: z.string().min(2).max(80) });

export async function expireStaleJobLocksAction(
  _prev: ActionResult | null,
  _formData: FormData,
): Promise<ActionResult & { expired?: number }> {
  await requirePermission("job_lock.manage");
  const me = await getCurrentAppUser();
  const out = await expireStaleJobLocks();
  await recordAuditEvent({
    actorUserId: me?.id ?? null,
    action: "job_lock.expire_stale",
    entityType: "job_lock",
    entityId: null,
    after: out,
  });
  revalidatePath("/dashboard/jobs/locks");
  return { ok: true, expired: out.expired };
}

export async function forceReleaseJobLockAction(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  await requirePermission("job_lock.manage");
  const me = await getCurrentAppUser();
  const parsed = jobKeySchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) return { ok: false, error: "Invalid jobKey." };
  await forceReleaseJobLock(parsed.data.jobKey);
  await recordAuditEvent({
    actorUserId: me?.id ?? null,
    action: "job_lock.force_release",
    entityType: "job_lock",
    entityId: null,
    after: { jobKey: parsed.data.jobKey },
  });
  revalidatePath("/dashboard/jobs/locks");
  return { ok: true };
}
