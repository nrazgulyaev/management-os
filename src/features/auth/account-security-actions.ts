"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { getSupabaseServer } from "@/lib/supabase/server";
import { getCurrentAppUser } from "@/features/auth/current-user";
import { recordSecurityEvent } from "@/features/security-baseline/security-events";

/**
 * Stage 10.M.2 — Per-user (self-serve) account security mutations.
 *
 * - changePasswordAction: updates the Supabase Auth password for the
 *   current session. Records a `password_changed` security event.
 * - signOutOtherSessionsAction: terminates every other active Supabase
 *   session for the current user (the current device stays signed in).
 *   Records a `sessions_revoked_others` security event.
 *
 * Both actions enforce that there's a signed-in user and bail otherwise
 * — no admin-impersonation surface.
 */

export type AccountSecurityResult =
  | { ok: true; message?: string }
  | { ok: false; error: string };

const passwordSchema = z.object({
  newPassword: z
    .string()
    .min(12, "Password must be at least 12 characters."),
  confirmPassword: z.string(),
});

export async function changePasswordAction(
  _prev: AccountSecurityResult | null,
  formData: FormData,
): Promise<AccountSecurityResult> {
  const parsed = passwordSchema.safeParse(
    Object.fromEntries(formData.entries()),
  );
  if (!parsed.success) {
    return {
      ok: false,
      error:
        parsed.error.issues[0]?.message ??
        "Password must be at least 12 characters.",
    };
  }
  if (parsed.data.newPassword !== parsed.data.confirmPassword) {
    return { ok: false, error: "Passwords do not match." };
  }

  const me = await getCurrentAppUser();
  if (!me) return { ok: false, error: "Sign in to change your password." };

  const supabase = await getSupabaseServer();
  if (!supabase) {
    return {
      ok: false,
      error: "Supabase auth is not configured in this environment.",
    };
  }

  const { error } = await supabase.auth.updateUser({
    password: parsed.data.newPassword,
  });
  if (error) return { ok: false, error: error.message };

  await recordSecurityEvent({
    appUserId: me.id,
    eventType: "password_changed",
    severity: "info",
  });

  revalidatePath("/dashboard/settings/account-security");
  return { ok: true, message: "Password updated." };
}

export async function signOutOtherSessionsAction(): Promise<AccountSecurityResult> {
  const me = await getCurrentAppUser();
  if (!me) return { ok: false, error: "Sign in first." };

  const supabase = await getSupabaseServer();
  if (!supabase) {
    return {
      ok: false,
      error: "Supabase auth is not configured in this environment.",
    };
  }

  const { error } = await supabase.auth.signOut({ scope: "others" });
  if (error) return { ok: false, error: error.message };

  await recordSecurityEvent({
    appUserId: me.id,
    eventType: "sessions_revoked_others",
    severity: "warning",
  });

  revalidatePath("/dashboard/settings/account-security");
  return {
    ok: true,
    message: "All other sessions have been signed out.",
  };
}
