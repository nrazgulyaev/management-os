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
 * PLATFORM-ADMIN-ALLOWLIST (SIGNUP-ESCALATION-FIX) — the `super_admin`
 * role in `user_roles` is GLOBAL-scoped and is minted by BOTH paths that
 * provision an org admin: `public.assign_user_role(user,'super_admin',…)`
 * inside `signup/actions.ts` AND `provision_app_user` (0087). The role
 * therefore conflates "this org's admin" with "the platform operator".
 * Every helper in this file gates genuine CROSS-TENANT platform power
 * (org CRUD, impersonation, subscription-OS, platform agents/flags), so
 * `super_admin` alone is not sufficient — otherwise any tenant admin (and,
 * if public signup is open, any visitor) reaches the cross-tenant
 * Platform OS.
 *
 * The platform operator is identified by an explicit env allowlist —
 * `PLATFORM_ADMIN_EMAILS` (comma-separated, case-insensitive). This is
 * deliberately FAIL-CLOSED: with the var unset/empty NO live user passes
 * these helpers (demo mode still bypasses for local/preview parity). Set
 * it in the deploy env to the operator address(es) before relying on the
 * Platform OS.
 *
 * NOTE: this gates only the platform helpers. The raw `ctx.isSuperAdmin`
 * field is unchanged, so a tenant admin keeps super_admin for their OWN
 * org (cabinet bypass / app-switcher) — they simply can't cross tenants.
 */
function platformAdminEmails(): Set<string> {
  return new Set(
    (process.env.PLATFORM_ADMIN_EMAILS ?? "")
      .split(",")
      .map((e) => e.trim().toLowerCase())
      .filter((e) => e.length > 0),
  );
}

export function isPlatformAdminEmail(email: string | null | undefined): boolean {
  if (!email) return false;
  return platformAdminEmails().has(email.trim().toLowerCase());
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
  if (
    !ctx.appUser ||
    !ctx.isSuperAdmin ||
    !isPlatformAdminEmail(ctx.appUser.email)
  ) {
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
  return {
    ok: ctx.isSuperAdmin && isPlatformAdminEmail(ctx.appUser.email),
    ctx,
  };
}
