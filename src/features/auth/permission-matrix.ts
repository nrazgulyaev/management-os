// Pure permission table — safe to import from tests and client components.
// Server-only behaviour (auth + DB lookups) lives in `permissions.ts`.

export type RoleKey =
  | "super_admin"
  | "director"
  | "operations_manager"
  | "property_manager"
  | "finance_manager"
  | "accountant"
  | "concierge"
  | "housekeeping_supervisor"
  | "housekeeper"
  | "technician"
  | "procurement_manager"
  | "security"
  | "sales_manager"
  | "investor_owner"
  | "investor_viewer"
  | "agent";

export const INTERNAL_ROLES: RoleKey[] = [
  "super_admin",
  "director",
  "operations_manager",
  "property_manager",
  "finance_manager",
  "accountant",
  "concierge",
  "housekeeping_supervisor",
  "procurement_manager",
  "sales_manager",
];

export const ROLE_CAPABILITIES: Record<string, RoleKey[]> = {
  // identity / system
  "users.read": ["super_admin", "director"],
  "users.write": ["super_admin"],
  "roles.assign": ["super_admin"],
  // projects / villas
  "projects.read": INTERNAL_ROLES,
  "projects.write": ["super_admin", "director", "operations_manager", "property_manager"],
  "villas.read": INTERNAL_ROLES,
  "villas.write": ["super_admin", "director", "operations_manager", "property_manager"],
  // owners / shares
  "owners.read": ["super_admin", "director", "finance_manager", "accountant", "operations_manager"],
  "owners.write": ["super_admin", "director", "finance_manager"],
  "shares.read": ["super_admin", "director", "finance_manager", "accountant"],
  "shares.write": ["super_admin", "director", "finance_manager"],
  // bookings / channels / guests
  "bookings.read": INTERNAL_ROLES,
  "bookings.write": [
    "super_admin",
    "director",
    "operations_manager",
    "property_manager",
    "concierge",
  ],
  "channels.read": INTERNAL_ROLES,
  "channels.write": ["super_admin", "director", "operations_manager"],
  "guests.read": INTERNAL_ROLES,
  "guests.write": ["super_admin", "director", "operations_manager", "concierge"],
  // documents / audit
  "documents.read": INTERNAL_ROLES,
  "documents.write": ["super_admin", "director", "operations_manager", "finance_manager"],
  "audit.read": ["super_admin", "director"],
};

export interface CurrentUserContext {
  mode: "live" | "demo";
  appUser: {
    id: string;
    email: string;
    fullName: string;
    status: string;
  } | null;
  roles: RoleKey[];
  isInternal: boolean;
  isSuperAdmin: boolean;
}

export function hasPermission(ctx: CurrentUserContext, permission: string): boolean {
  if (ctx.mode === "demo") return true;
  if (ctx.isSuperAdmin) return true;
  const allowed = ROLE_CAPABILITIES[permission];
  if (!allowed) return false;
  return ctx.roles.some((r) => allowed.includes(r));
}
