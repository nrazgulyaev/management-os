/**
 * DOMAIN 2 — assignable INTERNAL roles (the /dashboard cabinets).
 *
 * These are the `user_roles` keys that drive `is_internal_user()` (RLS) and
 * the dashboard cabinet routing. Until now they could ONLY be set by scripts
 * (bootstrap / provision_app_user). The team-settings "Assign internal role"
 * UI + `assignInternalRoleAction` let a super_admin / director grant or revoke
 * them from the app.
 *
 * The list is ENUMERATED from `INTERNAL_ROLES` in `permission-matrix.ts`
 * (the single source of truth) MINUS `super_admin` — internal-bypass / system
 * custodian is reserved for the bootstrap + founder accounts and must never be
 * grantable from a self-serve UI.
 *
 * Pure constants — safe to import from client components and tests.
 *
 * NOTE: `assign_user_role()` (the SQL helper this writes through) looks roles
 * up by key in the `roles` table and RAISES on an unknown key. Some keys here
 * (e.g. `revenue_manager`) may not have a `roles` row in every database. The
 * server action filters this list against the live `roles` table before
 * rendering / before writing, so the UI never offers a role that would fail.
 */

import { INTERNAL_ROLES, type RoleKey } from "@/features/auth/permission-matrix";

/** Internal roles a privileged admin may assign from the UI (excludes super_admin). */
export const ASSIGNABLE_INTERNAL_ROLES: RoleKey[] = INTERNAL_ROLES.filter(
  (r) => r !== "super_admin",
);

export type AssignableInternalRoleKey = (typeof ASSIGNABLE_INTERNAL_ROLES)[number];

/** Human label for an internal role key (Title Case from the snake_case key). */
export function internalRoleLabel(key: string): string {
  return key
    .split("_")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

export function isAssignableInternalRole(key: string): key is AssignableInternalRoleKey {
  return (ASSIGNABLE_INTERNAL_ROLES as string[]).includes(key);
}
