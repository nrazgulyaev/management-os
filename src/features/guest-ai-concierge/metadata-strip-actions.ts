"use server";

import { revalidatePath } from "next/cache";
import { recordAuditEvent } from "@/features/audit/services";
import { getCurrentAppUser } from "@/features/auth/current-user";
import { requirePermission } from "@/features/auth/permissions";
import { requireOrgId } from "@/features/auth/require-org";
import { processPendingAttachments } from "./metadata-strip";

export type StripActionResult =
  | {
      ok: true;
      scanned: number;
      succeeded: number;
      failed: number;
      warnings: number;
    }
  | { ok: false; error: string };

export async function runMetadataStripPendingAction(): Promise<StripActionResult> {
  await requirePermission("guest_ai.handoff.attachments.write");
  const organizationId = await requireOrgId();
  const me = await getCurrentAppUser();
  try {
    const result = await processPendingAttachments({
      organizationId,
      limit: 200,
    });
    await recordAuditEvent({
      actorUserId: me?.id ?? null,
      action: "guest_ai.handoff.attachment.metadata_sweep",
      entityType: "guest_ai_handoff_reply_attachment",
      entityId: null,
      after: result as unknown as Record<string, unknown>,
    });
    revalidatePath("/dashboard/guest-ai/storage");
    return { ok: true, ...result };
  } catch (err) {
    const error = err instanceof Error ? err.message : "Sweep failed.";
    return { ok: false, error };
  }
}
