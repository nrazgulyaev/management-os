/**
 * Stage 9.E — canonical role-key list (pure constants).
 *
 * Mirrors the CHECK constraint in migration 0066 + the Zod enum in
 * `src/features/team/actions.ts`. Split out so client components,
 * tests, and pure helpers can import without pulling in `server-only`
 * via the action module.
 */

export const VALID_CABINET_ROLES = [
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
] as const;

export type CabinetRoleKey = (typeof VALID_CABINET_ROLES)[number];
