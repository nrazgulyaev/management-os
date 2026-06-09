/**
 * Keystone "who-sees-what" matrix — pure helpers (safe to import from
 * client components + tests). The server read/write side lives in
 * `services.ts` + `actions.ts`.
 *
 * The matrix is a curated cabinet × role grid. Each cabinet maps to a
 * top-level dashboard area; the default "can this role see it" comes from
 * the `"{cabinet}.read"` row of ROLE_CAPABILITIES. Admins can override any
 * cell — overrides persist to `role_access_overrides` (migration 0128).
 */

import {
  ROLE_CAPABILITIES,
  INTERNAL_ROLES,
  type RoleKey,
} from "@/features/auth/permission-matrix";

/** A cabinet shown in the matrix editor, keyed by its read-permission prefix. */
export interface MatrixCabinet {
  /** prefix, e.g. 'finance' — joins to `"{key}.read"` in ROLE_CAPABILITIES. */
  key: string;
  label: string;
}

/**
 * Curated list of the principal cabinets — kept tight so the grid stays
 * legible. Each `key` has a corresponding `"{key}.read"` capability row.
 */
export const MATRIX_CABINETS: MatrixCabinet[] = [
  { key: "projects", label: "Projects" },
  { key: "villas", label: "Villas" },
  { key: "bookings", label: "Bookings" },
  { key: "availability", label: "Availability" },
  { key: "channels", label: "Channels" },
  { key: "guests", label: "Guests" },
  { key: "front_office", label: "Front office" },
  { key: "operations", label: "Operations" },
  { key: "housekeeping", label: "Housekeeping" },
  { key: "maintenance", label: "Maintenance" },
  { key: "inventory", label: "Inventory" },
  { key: "procurement", label: "Procurement" },
  { key: "finance", label: "Finance" },
  { key: "owners", label: "Owners" },
  { key: "owner_statement", label: "Owner statements" },
  { key: "pricing", label: "Pricing" },
  { key: "documents", label: "Documents" },
  { key: "integrations", label: "Integrations" },
  { key: "automation", label: "Automation" },
  { key: "notifications", label: "Notifications" },
  { key: "audit", label: "Audit log" },
  { key: "users", label: "Users & roles" },
];

/**
 * Roles shown as columns. super_admin is always all-access (and the only
 * role that can edit the matrix), so we omit it from the editable columns.
 */
export const MATRIX_ROLES: RoleKey[] = INTERNAL_ROLES.filter(
  (r) => r !== "super_admin",
);

/** Humanise a role key for a column header. */
export function roleLabel(role: RoleKey): string {
  return role
    .split("_")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

/** Code default: does this role have `"{cabinet}.read"` in ROLE_CAPABILITIES? */
export function defaultAccess(cabinetKey: string, role: RoleKey): boolean {
  const allowed = ROLE_CAPABILITIES[`${cabinetKey}.read`];
  return Array.isArray(allowed) && allowed.includes(role);
}

/**
 * Maps a dashboard nav href to the matrix cabinet key that gates it.
 * Only the principal cabinets are gated; rows that don't map to a matrix
 * cabinet return `null` (always visible). Order matters — the FIRST
 * prefix that matches wins, so list deeper prefixes before shallower ones.
 */
const NAV_HREF_CABINET: { prefix: string; cabinet: string }[] = [
  { prefix: "/dashboard/owner-statements", cabinet: "owner_statement" },
  { prefix: "/dashboard/finance/statements", cabinet: "owner_statement" },
  { prefix: "/dashboard/finance/disputes", cabinet: "owner_statement" },
  { prefix: "/dashboard/finance/transparency", cabinet: "owner_statement" },
  { prefix: "/dashboard/finance", cabinet: "finance" },
  { prefix: "/dashboard/payments", cabinet: "finance" },
  { prefix: "/dashboard/owners", cabinet: "owners" },
  { prefix: "/dashboard/shares", cabinet: "owners" },
  { prefix: "/dashboard/owner-intelligence", cabinet: "owners" },
  { prefix: "/dashboard/projects", cabinet: "projects" },
  { prefix: "/dashboard/villas", cabinet: "villas" },
  { prefix: "/dashboard/bookings", cabinet: "bookings" },
  { prefix: "/dashboard/channels", cabinet: "channels" },
  { prefix: "/dashboard/guests", cabinet: "guests" },
  { prefix: "/dashboard/availability", cabinet: "availability" },
  { prefix: "/dashboard/front-office", cabinet: "front_office" },
  { prefix: "/dashboard/operations/housekeeping", cabinet: "housekeeping" },
  { prefix: "/dashboard/operations/maintenance", cabinet: "maintenance" },
  { prefix: "/dashboard/operations", cabinet: "operations" },
  { prefix: "/dashboard/inventory", cabinet: "inventory" },
  { prefix: "/dashboard/procurement", cabinet: "procurement" },
  { prefix: "/dashboard/pricing", cabinet: "pricing" },
  { prefix: "/dashboard/documents", cabinet: "documents" },
  { prefix: "/dashboard/integrations", cabinet: "integrations" },
  { prefix: "/dashboard/audit", cabinet: "audit" },
  { prefix: "/dashboard/settings", cabinet: "users" },
];

/** Cabinet key that gates a nav href, or null when the row is ungated. */
export function cabinetForNavHref(href: string): string | null {
  for (const { prefix, cabinet } of NAV_HREF_CABINET) {
    if (href === prefix || href.startsWith(prefix + "/") || href.startsWith(prefix + "?")) {
      return cabinet;
    }
  }
  return null;
}

export type OverrideMap = Map<string, boolean>;

/** Stable map key for an override cell. */
export function cellKey(cabinetKey: string, role: RoleKey): string {
  return `${cabinetKey}::${role}`;
}

/**
 * Effective access = override if present, else the code default.
 */
export function effectiveAccess(
  cabinetKey: string,
  role: RoleKey,
  overrides: OverrideMap,
): boolean {
  const k = cellKey(cabinetKey, role);
  if (overrides.has(k)) return overrides.get(k)!;
  return defaultAccess(cabinetKey, role);
}
