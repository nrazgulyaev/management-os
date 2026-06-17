"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getCurrentAppUser } from "@/features/auth/current-user";
import { saveCabinetPreferences } from "@/lib/development/server/roles/role-actions";

/**
 * Co-located adapter for the My Cabinet settings form.
 *
 * SECURITY: `saveCabinetPreferences` accepts a userId, so calling it
 * directly from the client would let a user overwrite ANOTHER user's
 * cabinet preferences (IDOR). This adapter derives the userId from the
 * authenticated session instead — the client never supplies it. The
 * underlying action still enforces requireOrgId + the cabinet_preferences
 * org column.
 */

const inputSchema = z.object({
  defaultCabinetKey: z.string().max(200).nullable(),
  cabinetWidgetPreferences: z.record(z.boolean()),
});

export async function saveMyCabinetPreferences(
  input: z.input<typeof inputSchema>,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const me = await getCurrentAppUser();
  if (!me) return { ok: false, error: "Not signed in" };
  const parsed = inputSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }
  const result = await saveCabinetPreferences({
    userId: me.id,
    defaultCabinetKey: parsed.data.defaultCabinetKey,
    cabinetWidgetPreferences: parsed.data.cabinetWidgetPreferences,
  });
  if (!result.ok) {
    return { ok: false, error: result.error ?? "Save failed" };
  }
  revalidatePath("/development-os/settings/my-cabinet");
  return { ok: true };
}
