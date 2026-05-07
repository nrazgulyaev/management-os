/**
 * Stage 7.F.D.3 — Cabinet → feature flag mapping (pure constants).
 *
 * Split out from cabinet-gating.ts so tests can import the map without
 * pulling in `server-only` (which transitively imports the gating
 * pipeline).
 *
 * Slugs match the directory names under
 * `src/app/(development-app)/development-os/cabinets/`. Flag codes
 * match the rows seeded in migration 0085's `plan_features` block.
 */

export const CABINET_TO_FLAG: Record<string, string> = {
  "cfo-accountant": "cabinet.cfo_accountant",
  "project-manager": "cabinet.project_manager",
  "site-supervisor": "cabinet.site_supervisor",
  qs: "cabinet.qs",
  "procurement-manager": "cabinet.procurement_manager",
  "warehouse-manager": "cabinet.warehouse_manager",
  "marketing-staff": "cabinet.marketing_staff",
  "sales-manager": "cabinet.sales_manager",
};
