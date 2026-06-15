"use server";

import { revalidatePath } from "next/cache";
import { getCurrentAppUser } from "@/features/auth/current-user";
import { requireOrgId } from "@/features/auth/require-org";
import { requirePermission } from "@/features/auth/permissions";
import {
  cleanupStalePendingAttachments,
  type CleanupOutcome,
} from "./attachment-cleanup";

export type CleanupActionResult =
  | { ok: true; outcome: CleanupOutcome }
  | { ok: false; error: string };

export async function runAttachmentCleanupAction(): Promise<CleanupActionResult> {
  await requirePermission("guest_ai.handoff.attachments.write");
  const me = await getCurrentAppUser();
  // TENANCY: derive org server-side and scope the sweep to it, so a tenant
  // operator can only clean up their OWN org's stale attachments (never another
  // tenant's). The global path stays cron-only.
  const organizationId = await requireOrgId();
  try {
    const outcome = await cleanupStalePendingAttachments({
      actorUserId: me?.id ?? null,
      organizationId,
    });
    revalidatePath("/dashboard/guest-ai/storage");
    return { ok: true, outcome };
  } catch (err) {
    const error = err instanceof Error ? err.message : "Cleanup failed.";
    return { ok: false, error };
  }
}
