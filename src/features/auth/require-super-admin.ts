import "server-only";

/**
 * SUPER-ADMIN-GATE-FIX — single canonical super_admin gate.
 *
 * Why this file exists
 * --------------------
 * Pre-fix, four separate `requireSuperAdmin()` helpers lived inline in
 * `lib/agents/actions.ts`, `lib/subscription-os/actions.ts`,
 * `features/owner-portal/impersonation-actions.ts`, and
 * `features/investor-portal/impersonation-actions.ts`. Each one called
 * `getCurrentUserContext()` then checked `ctx.isSuperAdmin`. The
 * `(platform-app)/layout.tsx` gate did the same check inline. Five
 * identical patterns; one source-of-truth refactor.
 *
 * Two parallel role systems coexist; this is the one we use here
 * ----------------------------------------------------------------
 *   · `user_roles`     — canonical identity/RBAC table. super_admin
 *                        grants live here (global scope = scope_type
 *                        NULL, scope_id NULL). Written by
 *                        `public.assign_user_role()` (SECURITY DEFINER,
 *                        from migration 0004). This is the table the
 *                        `getCurrentUserContext()` chain reads.
 *   · `app_user_roles` — cabinet-scoped grants only (CFO accountant,
 *                        QS analyst, site supervisor, …). Migration
 *                        0066's CHECK constraint doesn't even allow
 *                        `super_admin` as a role_key. This table drives
 *                        the workspace switcher + cabinet landing only;
 *                        never platform-admin elevation.
 *
 * So: `requireSuperAdmin()` reads `user_roles`. Always. Anything that
 * reaches for `app_user_roles` to check super_admin is wrong.
 */

import { getCurrentUserContext, type CurrentUserContext } from "./permissions";

export class SuperAdminRequiredError extends Error {
  readonly code = "SUPER_ADMIN_REQUIRED";
  constructor(message = "Super admin access required.") {
    super(message);
  }
}

/**
 * Throws `SuperAdminRequiredError` unless the current session is either:
 *   - demo mode (no DB) — bypassed for local/preview parity
 *   - a real signed-in user with the `super_admin` role in `user_roles`
 *
 * Returns the resolved context so callers can grab `appUser.id` for
 * audit logging without a second `getCurrentUserContext()` roundtrip
 * (the React `cache()` on that function would dedupe anyway, but
 * returning the value keeps the call sites tidy).
 */
export async function requireSuperAdmin(): Promise<CurrentUserContext> {
  const ctx = await getCurrentUserContext();
  if (ctx.mode === "demo") return ctx;
  if (!ctx.appUser || !ctx.isSuperAdmin) {
    throw new SuperAdminRequiredError();
  }
  return ctx;
}

/**
 * Non-throwing variant for layouts that need to branch on access.
 * The platform layout uses this to `redirect()` with a specific reason
 * code rather than letting an exception bubble to the framework's
 * error boundary.
 */
export async function isSuperAdminContext(): Promise<{
  ok: boolean;
  ctx: CurrentUserContext;
}> {
  const ctx = await getCurrentUserContext();
  if (ctx.mode === "demo") return { ok: true, ctx };
  if (!ctx.appUser) return { ok: false, ctx };
  return { ok: ctx.isSuperAdmin, ctx };
}
