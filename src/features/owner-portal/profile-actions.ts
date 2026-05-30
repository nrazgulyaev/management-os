"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import { owners } from "@/lib/db/schema/ownership";
import { requireOwnerWrite } from "@/features/owner-portal/require-owner-write";
import { recordAuditEvent } from "@/features/audit/services";
import type { OwnerActionState } from "@/features/owner-portal/notification-prefs-types";

/**
 * Owner self-service profile edit — display name / email / phone only.
 * Deliberately NOT payout/banking (that is 2FA-gated and out of scope —
 * flagged for a separate decision). Owner-scoped; impersonating
 * super-admins are read-only via requireOwnerWrite().
 */

const profileSchema = z.object({
  displayName: z.string().trim().min(2, "Name must be at least 2 characters.").max(160),
  email: z
    .string()
    .trim()
    .email("Enter a valid email.")
    .max(200)
    .optional()
    .or(z.literal("")),
  phone: z.string().trim().max(40).optional().or(z.literal("")),
});

export async function updateOwnerProfileAction(
  _prev: OwnerActionState | null,
  formData: FormData,
): Promise<OwnerActionState> {
  const auth = await requireOwnerWrite();
  if (!auth.ok) return { ok: false, error: auth.error };

  const db = getDb();
  if (!db) return { ok: false, error: "Database is not configured." };

  const parsed = profileSchema.safeParse({
    displayName: formData.get("displayName") ?? "",
    email: formData.get("email") ?? "",
    phone: formData.get("phone") ?? "",
  });
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input." };
  }
  const { displayName, email, phone } = parsed.data;

  await db
    .update(owners)
    .set({
      displayName,
      email: email && email !== "" ? email : null,
      phone: phone && phone !== "" ? phone : null,
      updatedAt: new Date(),
    })
    .where(eq(owners.id, auth.ownerId));

  await recordAuditEvent({
    actorUserId: auth.appUserId,
    action: "owner.profile.update",
    entityType: "owner",
    entityId: auth.ownerId,
    after: { displayName, email: email || null, phone: phone || null },
  });

  revalidatePath("/owner/preferences");
  return { ok: true };
}
