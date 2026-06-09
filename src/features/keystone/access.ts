import "server-only";

/**
 * Keystone RBAC — the EFFECTIVE cabinet-access resolver (Block 08 depth).
 *
 * #162 shipped the "who-sees-what" matrix EDITOR (persists per-(org,
 * cabinet, role) overrides to `role_access_overrides`, migration 0128).
 * But nothing READ those overrides at gating time — the editor's writes
 * had no effect on the nav or on any route. This module closes that loop:
 *
 *   - `resolveCabinetAccess(ctx)` loads the org's persisted overrides ONCE
 *     and returns a cheap synchronous `canSee(cabinetKey)` closure that
 *     layers the matrix `effectiveAccess()` (override-or-default) on top of
 *     the role checks. The sidebar + topbar nav and every route gate call
 *     this, so an admin's matrix edits actually change who-sees-what.
 *   - `requireCabinetAccess(cabinetKey)` is the per-page gate: a single
 *     `await` that returns `{ allowed, ctx }`. Pages render block 01's
 *     `<CabinetGate>` (→ EmptyState variant="restricted") when `!allowed`,
 *     instead of leaking the cabinet or crashing.
 *
 * Demo mode (no DATABASE_URL) and super_admin both short-circuit to full
 * access — matching `hasPermission()` semantics — so local/dev smoke runs
 * and the owner of the org are never locked out.
 */

import {
  getCurrentUserContext,
  type CurrentUserContext,
} from "@/features/auth/permissions";
import {
  MATRIX_CABINETS,
  effectiveAccess,
  type OverrideMap,
} from "./matrix";
import { getRoleAccessOverrides } from "./services";
import type { RoleKey } from "@/features/auth/permission-matrix";

const CABINET_KEYS = new Set(MATRIX_CABINETS.map((c) => c.key));

export interface CabinetAccessResolver {
  /** Demo / super-admin short-circuit — all cabinets visible. */
  allAccess: boolean;
  /**
   * Does the current user see this cabinet? Combines the persisted
   * (org, cabinet, role) overrides with the built-in `{key}.read`
   * defaults. Unknown / non-matrix cabinet keys default to visible so a
   * new cabinet isn't silently hidden before it's added to the grid.
   */
  canSee: (cabinetKey: string) => boolean;
}

/**
 * Build a cabinet-access resolver for the given user context. Loads the
 * org's overrides at most once. Safe in demo mode (returns all-access).
 */
export async function resolveCabinetAccess(
  ctx: CurrentUserContext,
): Promise<CabinetAccessResolver> {
  // Demo mode and super-admin always see everything (mirrors hasPermission).
  if (ctx.mode === "demo" || ctx.isSuperAdmin) {
    return { allAccess: true, canSee: () => true };
  }

  const orgId = ctx.appUser?.organizationId ?? "";
  let overrides: OverrideMap = new Map();
  if (orgId) {
    try {
      overrides = await getRoleAccessOverrides(orgId);
    } catch {
      // A read failure must not lock the user out of their whole app —
      // fall back to the code-default matrix (overrides empty).
      overrides = new Map();
    }
  }

  const roles = ctx.roles as RoleKey[];

  const canSee = (cabinetKey: string): boolean => {
    // Cabinets not modelled in the matrix are always visible (the matrix
    // is a curated subset; gate only what the grid actually covers).
    if (!CABINET_KEYS.has(cabinetKey)) return true;
    // A cabinet is visible if ANY of the user's roles has effective access.
    return roles.some((r) => effectiveAccess(cabinetKey, r, overrides));
  };

  return { allAccess: false, canSee };
}

/** Convenience: resolve access for the current request's user. */
export async function getCabinetAccess(): Promise<CabinetAccessResolver> {
  const ctx = await getCurrentUserContext();
  return resolveCabinetAccess(ctx);
}

export interface CabinetGateResult {
  allowed: boolean;
  ctx: CurrentUserContext;
}

/**
 * Per-route gate. Call at the top of a cabinet page:
 *
 *   const { allowed } = await requireCabinetAccess("finance");
 *   if (!allowed) return <CabinetGate cabinet="Finance" />;
 *
 * Never throws — denial is a clean render, not a 500.
 */
export async function requireCabinetAccess(
  cabinetKey: string,
): Promise<CabinetGateResult> {
  const ctx = await getCurrentUserContext();
  const resolver = await resolveCabinetAccess(ctx);
  return { allowed: resolver.canSee(cabinetKey), ctx };
}
