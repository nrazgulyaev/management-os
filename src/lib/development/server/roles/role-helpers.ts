/**
 * Stage 5.F — Role-specific cabinet pure helpers.
 *
 * No I/O, no `import "server-only"`. Runtime testable.
 *
 * UX-only role resolution. RLS still owns access control — these
 * helpers only decide which cabinet to land on after login and which
 * UI affordances to show vs hide.
 */

export type RoleKey =
  | "marketing_staff"
  | "qs_analyst"
  | "procurement_manager"
  | "warehouse_manager"
  | "site_supervisor"
  | "sales_manager"
  | "project_manager"
  | "cfo_accountant"
  | "executive_ceo"
  | "admin";

export const ALL_ROLE_KEYS: RoleKey[] = [
  "marketing_staff",
  "qs_analyst",
  "procurement_manager",
  "warehouse_manager",
  "site_supervisor",
  "sales_manager",
  "project_manager",
  "cfo_accountant",
  "executive_ceo",
  "admin",
];

const ROLE_TO_CABINET: Record<RoleKey, string> = {
  marketing_staff: "/development-os/cabinets/marketing-staff",
  qs_analyst: "/development-os/cabinets/qs",
  procurement_manager: "/development-os/cabinets/procurement-manager",
  warehouse_manager: "/development-os/cabinets/warehouse-manager",
  site_supervisor: "/development-os/cabinets/site-supervisor",
  sales_manager: "/development-os/cabinets/sales-manager",
  project_manager: "/development-os/cabinets/project-manager",
  cfo_accountant: "/development-os/cabinets/cfo-accountant",
  // Executive uses Stage 5.C dashboard.
  executive_ceo: "/development-os/dashboard",
  // Admin lands on the command center.
  admin: "/development-os",
};

export function getDefaultCabinetForRole(role: RoleKey): string {
  return ROLE_TO_CABINET[role] ?? "/development-os";
}

export interface RolePermissions {
  canViewFinancials: boolean;
  canViewInvestorData: boolean;
  canApproveTransactions: boolean;
  canManageInventory: boolean;
  canPublishContent: boolean;
  canViewAllProjects: boolean;
  canViewAllCabinets: boolean;
}

/**
 * Permission flags. These are **UI affordances** — the actual
 * authorisation boundary lives in RLS policies and server-action
 * guards. Used by cabinet rendering to hide buttons/sections that
 * the role typically wouldn't use.
 */
export function getRolePermissions(role: RoleKey): RolePermissions {
  switch (role) {
    case "executive_ceo":
    case "admin":
      return {
        canViewFinancials: true,
        canViewInvestorData: true,
        canApproveTransactions: true,
        canManageInventory: true,
        canPublishContent: true,
        canViewAllProjects: true,
        canViewAllCabinets: true,
      };
    case "cfo_accountant":
      return {
        canViewFinancials: true,
        canViewInvestorData: true,
        canApproveTransactions: true,
        canManageInventory: false,
        canPublishContent: false,
        canViewAllProjects: true,
        canViewAllCabinets: false,
      };
    case "project_manager":
      return {
        canViewFinancials: true,
        canViewInvestorData: false,
        canApproveTransactions: true,
        canManageInventory: false,
        canPublishContent: false,
        canViewAllProjects: true,
        canViewAllCabinets: false,
      };
    case "qs_analyst":
      return {
        canViewFinancials: true,
        canViewInvestorData: false,
        canApproveTransactions: false,
        canManageInventory: false,
        canPublishContent: false,
        canViewAllProjects: true,
        canViewAllCabinets: false,
      };
    case "procurement_manager":
      return {
        canViewFinancials: true,
        canViewInvestorData: false,
        canApproveTransactions: true,
        canManageInventory: true,
        canPublishContent: false,
        canViewAllProjects: true,
        canViewAllCabinets: false,
      };
    case "warehouse_manager":
      return {
        canViewFinancials: false,
        canViewInvestorData: false,
        canApproveTransactions: false,
        canManageInventory: true,
        canPublishContent: false,
        canViewAllProjects: false,
        canViewAllCabinets: false,
      };
    case "site_supervisor":
      return {
        canViewFinancials: false,
        canViewInvestorData: false,
        canApproveTransactions: false,
        canManageInventory: false,
        canPublishContent: false,
        canViewAllProjects: false,
        canViewAllCabinets: false,
      };
    case "sales_manager":
      return {
        canViewFinancials: false,
        canViewInvestorData: false,
        canApproveTransactions: false,
        canManageInventory: false,
        canPublishContent: false,
        canViewAllProjects: false,
        canViewAllCabinets: false,
      };
    case "marketing_staff":
      return {
        canViewFinancials: false,
        canViewInvestorData: false,
        canApproveTransactions: false,
        canManageInventory: false,
        canPublishContent: true,
        canViewAllProjects: false,
        canViewAllCabinets: false,
      };
  }
}

/**
 * Resolve the landing page for a user after login. Custom default
 * always wins; then role default; then fallback.
 */
export function resolveLandingPageForUser(input: {
  primaryRole: RoleKey | null;
  customDefaultCabinet: string | null;
  fallback?: string;
}): string {
  if (
    input.customDefaultCabinet &&
    input.customDefaultCabinet.startsWith("/development-os/")
  ) {
    return input.customDefaultCabinet;
  }
  if (input.primaryRole) {
    return getDefaultCabinetForRole(input.primaryRole);
  }
  return input.fallback ?? "/development-os/dashboard";
}

/**
 * Validate a single-primary-role-per-user constraint at the helper
 * level so server actions can pre-flight before the DB partial-unique
 * index throws.
 */
export function isValidRoleAssignment(input: {
  existingActiveRoles: Array<{ roleKey: RoleKey; isPrimary: boolean }>;
  newRoleKey: RoleKey;
  newIsPrimary: boolean;
}): { ok: true } | { ok: false; reason: string } {
  if (input.newIsPrimary) {
    const otherPrimary = input.existingActiveRoles.find(
      (r) => r.isPrimary && r.roleKey !== input.newRoleKey,
    );
    if (otherPrimary) {
      return {
        ok: false,
        reason: `User already has primary role "${otherPrimary.roleKey}". Demote it first.`,
      };
    }
  }
  const dup = input.existingActiveRoles.find(
    (r) => r.roleKey === input.newRoleKey,
  );
  if (dup) {
    return {
      ok: false,
      reason: `User already has role "${input.newRoleKey}".`,
    };
  }
  return { ok: true };
}
