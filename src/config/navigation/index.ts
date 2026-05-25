/**
 * Arconique navigation configs — barrel re-exports.
 *
 * Phase 2.0 (Stage 3 step 6) relocated the three navigation files into
 * this directory:
 *
 *   legacy.ts      — marketingNav, dashboardNav (legacy mgmt sidebar),
 *                    ownerNav, fieldNav, guestNav, aiAssistantMeta
 *                    plus NavItem / NavGroup types.
 *   management.ts  — MGMT_DASHBOARD_NAV (handoff Task 5 sidebar)
 *                    plus DashboardNavItem / DashboardNavGroup types.
 *   development.ts — DEV_DASHBOARD_NAV (handoff dev sidebar).
 *
 * Both `dashboardNav` (legacy, lucide icons, grouped by individual
 * concerns) and `MGMT_DASHBOARD_NAV` (handoff, string-key icons,
 * consolidated groups) coexist. They drive different sidebars
 * (legacy `dashboard-sidebar.tsx` vs handoff `sidebar.tsx`) and a
 * Phase 2.1 task will pick one to retire.
 *
 * Importers can write either `@/config/navigation` (barrel, this file)
 * or `@/config/navigation/<scope>` for tighter cohesion. Legacy paths
 * `@/config/dashboard-nav` and `@/config/development-nav` continue
 * working through deprecated shim files at the old locations.
 */
export * from "./legacy";
export * from "./management";
export * from "./development";
