import "server-only";

import { getCurrentOwnerContext } from "@/features/owner-portal/owner-context";
import { getCurrentAppUser } from "@/features/auth/current-user";

export type OwnerWriteAuth =
  | { ok: true; ownerId: string; appUserId: string | null }
  | { ok: false; error: string };

/**
 * Authorize an owner-portal WRITE.
 *
 * Resolves the owner context and — unlike a read — refuses when the
 * session is a super-admin *impersonating* an owner. Impersonation is
 * read-only (see owner-context.ts paths), so an operator viewing-as an
 * owner can never mutate that owner's profile, notification prefs, or
 * raise a dispute in their name. Returns the ownerId plus the acting
 * app_user id for the audit trail.
 *
 * Owner write actions should start with `const auth = await
 * requireOwnerWrite(); if (!auth.ok) return { ok:false, error:auth.error }`.
 */
export async function requireOwnerWrite(): Promise<OwnerWriteAuth> {
  const owner = await getCurrentOwnerContext();
  if (!owner) return { ok: false, error: "Not authorised." };
  if (owner.isImpersonating) {
    return {
      ok: false,
      error:
        "Changes are disabled while viewing as this owner (read-only impersonation).",
    };
  }
  const user = await getCurrentAppUser();
  return { ok: true, ownerId: owner.ownerId, appUserId: user?.id ?? null };
}
