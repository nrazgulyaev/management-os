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
  "housekeeper",
  "technician",
  "procurement_manager",
  "security",
  "sales_manager",
];

// Roles that operate primarily through the field workflow. Listed separately
// so the permission rows below stay declarative.
const FIELD_OPS_ROLES: RoleKey[] = [
  "operations_manager",
  "property_manager",
  "housekeeping_supervisor",
  "housekeeper",
  "technician",
  "concierge",
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
  // finance
  "finance.read": ["super_admin", "director", "finance_manager", "accountant", "operations_manager"],
  "finance.write": ["super_admin", "director", "finance_manager", "accountant"],
  "finance.close_period": ["super_admin", "director", "finance_manager"],
  "finance.issue_statement": ["super_admin", "director", "finance_manager"],
  "finance.approve_payout": ["super_admin", "director", "finance_manager"],
  "owner_statement.read": ["super_admin", "director", "finance_manager", "accountant"],
  "owner_statement.manage": ["super_admin", "director", "finance_manager"],
  // owner-portal access grants
  "owner_access.read": ["super_admin", "director", "finance_manager", "property_manager"],
  "owner_access.manage": ["super_admin", "director", "finance_manager"],
  // operations runtime
  "operations.read": [
    "super_admin",
    "director",
    "operations_manager",
    "property_manager",
    "housekeeping_supervisor",
    "housekeeper",
    "technician",
    "concierge",
    "finance_manager",
    "accountant",
  ],
  "operations.write": FIELD_OPS_ROLES.concat(["super_admin", "director"]),
  "operations.assign": [
    "super_admin",
    "director",
    "operations_manager",
    "property_manager",
    "housekeeping_supervisor",
  ],
  "operations.approve": [
    "super_admin",
    "director",
    "operations_manager",
    "property_manager",
    "housekeeping_supervisor",
  ],
  // housekeeping
  "housekeeping.read": [
    "super_admin",
    "director",
    "operations_manager",
    "property_manager",
    "housekeeping_supervisor",
    "housekeeper",
  ],
  "housekeeping.write": [
    "super_admin",
    "director",
    "operations_manager",
    "property_manager",
    "housekeeping_supervisor",
    "housekeeper",
  ],
  // maintenance
  "maintenance.read": [
    "super_admin",
    "director",
    "operations_manager",
    "property_manager",
    "technician",
  ],
  "maintenance.write": [
    "super_admin",
    "director",
    "operations_manager",
    "property_manager",
    "technician",
  ],
  // service requests (internal — guest origination is handled separately)
  "service_request.read": [
    "super_admin",
    "director",
    "operations_manager",
    "property_manager",
    "concierge",
    "housekeeping_supervisor",
  ],
  "service_request.write": [
    "super_admin",
    "director",
    "operations_manager",
    "property_manager",
    "concierge",
  ],
  // inventory + materials control (v5)
  "inventory.read": [
    "super_admin",
    "director",
    "operations_manager",
    "property_manager",
    "procurement_manager",
    "finance_manager",
    "accountant",
    "housekeeping_supervisor",
    "housekeeper",
    "technician",
  ],
  "inventory.write": [
    "super_admin",
    "director",
    "operations_manager",
    "property_manager",
    "housekeeping_supervisor",
    "housekeeper",
    "technician",
  ],
  "inventory.adjust": [
    "super_admin",
    "director",
    "operations_manager",
    "property_manager",
    "procurement_manager",
  ],
  // procurement (v5)
  "procurement.read": [
    "super_admin",
    "director",
    "operations_manager",
    "property_manager",
    "procurement_manager",
    "finance_manager",
  ],
  "procurement.write": [
    "super_admin",
    "director",
    "operations_manager",
    "property_manager",
    "procurement_manager",
  ],
  "procurement.approve": [
    "super_admin",
    "director",
    "operations_manager",
    "procurement_manager",
    "finance_manager",
  ],
  // attachments (v5)
  "attachments.read": [
    "super_admin",
    "director",
    "operations_manager",
    "property_manager",
    "procurement_manager",
    "finance_manager",
    "accountant",
    "concierge",
    "housekeeping_supervisor",
    "housekeeper",
    "technician",
  ],
  "attachments.write": [
    "super_admin",
    "director",
    "operations_manager",
    "property_manager",
    "concierge",
    "housekeeping_supervisor",
    "housekeeper",
    "technician",
  ],
  // v6 — booking-channels integrations
  "integrations.read": [
    "super_admin",
    "director",
    "operations_manager",
    "property_manager",
    "finance_manager",
  ],
  "integrations.write": [
    "super_admin",
    "director",
    "operations_manager",
  ],
  "bookings.sync": [
    "super_admin",
    "director",
    "operations_manager",
    "property_manager",
  ],
  "bookings.conflict.manage": [
    "super_admin",
    "director",
    "operations_manager",
    "property_manager",
  ],
  // v6 — booking automation
  "automation.read": [
    "super_admin",
    "director",
    "operations_manager",
    "property_manager",
    "housekeeping_supervisor",
  ],
  "automation.write": [
    "super_admin",
    "director",
    "operations_manager",
    "property_manager",
  ],
  // v6 — inventory counts (granular keys; existing inventory.* still applies)
  "inventory.count.read": [
    "super_admin",
    "director",
    "operations_manager",
    "property_manager",
    "procurement_manager",
    "housekeeping_supervisor",
    "finance_manager",
    "accountant",
  ],
  "inventory.count.write": [
    "super_admin",
    "director",
    "operations_manager",
    "property_manager",
    "procurement_manager",
    "housekeeping_supervisor",
  ],
  "inventory.count.approve": [
    "super_admin",
    "director",
    "operations_manager",
    "procurement_manager",
  ],
  // v6 — finance material-usage bridge
  "finance.bridge_material_usage": [
    "super_admin",
    "director",
    "finance_manager",
    "accountant",
  ],
  // v7 — background jobs / monitoring
  "jobs.read": [
    "super_admin",
    "director",
    "operations_manager",
    "property_manager",
    "finance_manager",
    "accountant",
    "procurement_manager",
  ],
  "jobs.run": [
    "super_admin",
    "director",
    "operations_manager",
    "property_manager",
    "finance_manager",
    "procurement_manager",
  ],
  "jobs.manage": [
    "super_admin",
    "director",
    "operations_manager",
  ],
  // v7 — notifications (no external delivery yet)
  "notifications.read": [
    "super_admin",
    "director",
    "operations_manager",
    "property_manager",
    "finance_manager",
    "accountant",
    "procurement_manager",
    "housekeeping_supervisor",
    "concierge",
  ],
  "notifications.write": [
    "super_admin",
    "director",
    "operations_manager",
    "property_manager",
    "concierge",
  ],
  "notifications.manage": [
    "super_admin",
    "director",
    "operations_manager",
  ],
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
