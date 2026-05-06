"use server";

import { revalidatePath } from "next/cache";
import { getCurrentAppUser } from "@/features/auth/current-user";
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
  try {
    const outcome = await cleanupStalePendingAttachments({
      actorUserId: me?.id ?? null,
    });
    revalidatePath("/dashboard/guest-ai/storage");
    return { ok: true, outcome };
  } catch (err) {
    const error = err instanceof Error ? err.message : "Cleanup failed.";
    return { ok: false, error };
  }
}
