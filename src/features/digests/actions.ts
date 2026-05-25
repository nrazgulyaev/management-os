"use server";

/**
 * DAILY-DIGEST-SPRINT-1 P4.3 — server actions for the digest surface.
 *
 * Two flavors of mark-as-read:
 *   · markDigestAsRead(id) — programmatic, called from server
 *     components (e.g. detail page on mount) and from form actions.
 *     Returns nothing on success; ownership-scoped UPDATE.
 *   · markDigestAsReadAction(formData) — `<form action>` binding for
 *     a "Mark as read" button.
 *
 * Ownership: WHERE user_id = current_app_user.id is appended in SQL
 * directly, so an attacker cannot mark another user's digest read by
 * crafting a request. Belt-and-suspenders alongside RLS.
 */

import { sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { requireDb } from "@/lib/db/client";
import { getCurrentAppUser } from "@/features/auth/current-user";

export async function markDigestAsRead(id: string): Promise<void> {
  if (!id) return;
  const me = await getCurrentAppUser();
  if (!me) return;
  const db = requireDb();
  await db.execute(sql`
    UPDATE notifications
       SET read_at = COALESCE(read_at, now())
     WHERE id = ${id}::uuid
       AND user_id = ${me.id}::uuid
  `);
  // Revalidate both OS list paths + dashboard tiles so the bell
  // badge + tile state update.
  revalidatePath("/dashboard/digests");
  revalidatePath("/development-os/digests");
  revalidatePath("/dashboard");
  revalidatePath("/development-os");
}

export async function markDigestAsReadAction(formData: FormData): Promise<void> {
  const id = String(formData.get("id") ?? "");
  await markDigestAsRead(id);
}
