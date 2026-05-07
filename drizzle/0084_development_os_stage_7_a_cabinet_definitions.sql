-- =============================================================================
-- 0084 — Development OS · Stage 7.A — Cabinet definitions metadata
--
-- 1 new table — `cabinet_definitions` for the 9 hardcoded role cabinets.
-- This makes role → cabinet routing data-driven rather than reliant on the
-- TS Record at `src/lib/development/server/roles/role-helpers.ts`. The TS
-- map remains as a fast in-memory fallback; the DB row is the source of
-- truth that admin-side UI can edit.
--
-- Stage 7.B (subscription feature flags) will JOIN against this table to
-- compute "is this cabinet allowed under the org's plan?" without hitting
-- the role-helpers fallback.
-- =============================================================================

BEGIN;

CREATE TABLE IF NOT EXISTS "cabinet_definitions" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "slug" TEXT NOT NULL UNIQUE,
  "display_name" TEXT NOT NULL,
  "description" TEXT,
  "default_route" TEXT NOT NULL,
  "icon_key" TEXT,
  -- Role -> cabinet mapping. Each row lists the role keys that default
  -- to this cabinet at landing. UI affordance only; RLS still enforces.
  "allowed_role_keys" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  -- Widget allowlist for UI gating (Stage 7.B feature flags read this).
  "allowed_widgets" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  -- Plan-tier minimum for the cabinet to be visible. Stage 7.B fills this
  -- when subscription plans land. NULL = available on every plan.
  "min_plan_code" TEXT,
  "is_active" BOOLEAN NOT NULL DEFAULT true,
  "is_system" BOOLEAN NOT NULL DEFAULT true,
  "sort_order" INTEGER NOT NULL DEFAULT 100,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "cabinet_definitions_active_idx"
  ON "cabinet_definitions"("is_active");
CREATE INDEX IF NOT EXISTS "cabinet_definitions_sort_idx"
  ON "cabinet_definitions"("sort_order");

-- Cabinet_definitions is platform-wide metadata. No org_id — every
-- organization sees the same cabinet catalog (filtered by plan, not by
-- ownership). Therefore RLS is NOT applied. Authorization for editing
-- happens at the server-action layer (super_admin only).

CREATE OR REPLACE FUNCTION cabinet_definitions_set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS cabinet_definitions_set_updated_at ON cabinet_definitions;
CREATE TRIGGER cabinet_definitions_set_updated_at
  BEFORE UPDATE ON cabinet_definitions
  FOR EACH ROW EXECUTE FUNCTION cabinet_definitions_set_updated_at();

-- -----------------------------------------------------------------------------
-- Seed the 9 hardcoded cabinets from `role-helpers.ts`.
-- Idempotent via ON CONFLICT — safe to re-run.
-- -----------------------------------------------------------------------------
INSERT INTO "cabinet_definitions"
  ("slug", "display_name", "description", "default_route", "icon_key",
   "allowed_role_keys", "sort_order")
VALUES
  ('cfo-accountant', 'CFO / Accountant',
   'Cash position, bookkeeper inbox, period close, profitability.',
   '/development-os/cabinets/cfo-accountant', 'CircleDollarSign',
   ARRAY['cfo_accountant', 'finance_manager', 'accountant'], 10),
  ('project-manager', 'Project Manager',
   'Schedule, budget, risks, vendors per project.',
   '/development-os/cabinets/project-manager', 'Briefcase',
   ARRAY['project_manager', 'director'], 20),
  ('site-supervisor', 'Site Supervisor',
   'Daily site reports, team allocation, field workflow.',
   '/development-os/cabinets/site-supervisor', 'HardHat',
   ARRAY['site_supervisor'], 30),
  ('qs', 'QS / Cost Analyst',
   'Bill of Quantities, cost tracking, profitability.',
   '/development-os/cabinets/qs', 'Calculator',
   ARRAY['qs_analyst'], 40),
  ('procurement-manager', 'Procurement Manager',
   'RFQs, vendor scoring, purchase orders, deliveries.',
   '/development-os/cabinets/procurement-manager', 'ShoppingCart',
   ARRAY['procurement_manager'], 50),
  ('warehouse-manager', 'Warehouse Manager',
   'Site stock, material draws, leftover reconciliation.',
   '/development-os/cabinets/warehouse-manager', 'Package',
   ARRAY['warehouse_manager'], 60),
  ('marketing-staff', 'Marketing Staff',
   'Campaigns, leads, content, analytics.',
   '/development-os/cabinets/marketing-staff', 'Megaphone',
   ARRAY['marketing_staff'], 70),
  ('sales-manager', 'Sales Manager',
   'Buyers, contracts, reservations.',
   '/development-os/cabinets/sales-manager', 'Handshake',
   ARRAY['sales_manager'], 80),
  ('my-cabinet', 'My Cabinet',
   'Per-user landing redirect that resolves to the right cabinet by role.',
   '/development-os/cabinets/my-cabinet', 'User',
   ARRAY['admin', 'executive_ceo']::TEXT[], 90)
ON CONFLICT ("slug") DO NOTHING;

COMMIT;
