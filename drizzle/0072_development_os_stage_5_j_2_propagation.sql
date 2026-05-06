-- =============================================================================
-- 0072 — Development OS · Stage 5.J.2 — organization_id Propagation
--
-- Adds `organization_id UUID NOT NULL` to a curated allow-list of Dev OS
-- tables. Uses single-statement ADD COLUMN with DEFAULT (backfilled in
-- the same statement, atomically) then DROPs the default so future
-- inserts must specify the column. This avoids the "table in use"
-- error that occurs when ADD + UPDATE + ALTER NOT NULL run in the same
-- transaction with triggers pending.
--
-- DESIGN DECISIONS (per architecture doc):
--   * Spec said "ALL 117+ tables" but ALSO said "Do NOT modify Management OS."
--     We resolve the conflict in favour of the harder constraint (Management
--     OS untouched) and propagate only to Dev OS subset.
--   * Reference tables (asset_types, marketing_lead_sources, …) keep the
--     column NULLABLE — `is_in_user_organization()` permits NULL so a
--     single shared row serves all orgs.
--   * Auth/security tables and Management-OS legacy tables are excluded.
--
-- Idempotent.
-- =============================================================================

BEGIN;

DO $$
DECLARE
  default_org_id UUID;
  t TEXT;
  has_col BOOLEAN;
  tagged_tables TEXT[] := ARRAY[
    -- Stage 4.A
    'dev_bank_accounts', 'dev_budget_lines', 'dev_commitments_ledger',
    'dev_corporate_events', 'dev_cost_categories', 'dev_fx_snapshots',
    'dev_invoice_lines', 'dev_invoices', 'dev_notification_delivery_log',
    'dev_notification_rules', 'dev_notification_templates', 'dev_transactions',
    'tax_period_reports', 'shared_cost_allocations', 'shared_cost_allocation_lines',
    'procurement_quotations', 'procurement_quotation_lines',
    -- Stage 4.B
    'capital_commitments', 'capital_drawdowns', 'distributions',
    'distribution_allocations', 'wallet_movements', 'wallet_transactions',
    'waterfall_rules', 'investor_wallets', 'investors',
    'investor_portal_requests', 'buyers', 'buyer_progress_reports',
    'buyer_unit_assignments', 'residual_inventory_units',
    'residual_unit_ownership_shares', 'company_structure_shareholders',
    'project_company_structures',
    -- Stage 4.C
    'work_packages', 'project_tasks', 'task_dependencies',
    'project_phases', 'project_risks', 'project_decisions',
    'qa_qc_inspections', 'qa_qc_issues', 'qa_qc_issue_photos',
    'change_orders', 'safety_incidents',
    'dev_os_inventory_items', 'dev_os_inventory_locations',
    'dev_os_inventory_movements', 'dev_os_inventory_stock_balances',
    'dev_os_purchase_requests',
    'site_reports', 'site_report_photos', 'site_report_zones',
    'site_workforce_logs', 'site_zones', 'vendors', 'vendor_engagements',
    'material_purchase_orders', 'material_po_lines', 'material_deliveries',
    'material_delivery_lines', 'material_consumption_logs',
    -- Stage 5.A
    'drawings', 'drawing_revisions', 'drawing_distribution_log',
    'boq_documents', 'boq_sections', 'boq_items', 'specifications',
    'method_statements', 'quality_standards',
    -- Stage 5.B
    'revenue_streams', 'payroll_periods', 'team_capacity_tracking',
    'project_cycle_recommendations', 'unit_cost_allocations',
    'cashflow_forecasts',
    -- Stage 5.C
    'executive_metrics_snapshots', 'risk_radar_alerts', 'executive_digests',
    -- Stage 5.D
    'agent_invocation_log', 'agent_outputs', 'project_ai_memory',
    -- Stage 5.E
    'campaigns', 'campaign_costs', 'leads', 'content_pieces',
    'content_variants', 'sales_conversation_threads',
    'manager_performance_metrics',
    -- Stage 5.F
    'cabinet_preferences',
    -- Stage 5.H
    'schedule_baselines', 'schedule_variances', 'resource_pools',
    'task_resource_assignments', 'productivity_logs',
    -- Stage 5.I
    'push_subscriptions', 'notification_dispatch_log', 'offline_action_queue'
  ];
BEGIN
  SELECT id INTO default_org_id
    FROM organizations
   WHERE organization_code = 'ARCONIQUE_DEFAULT';
  IF default_org_id IS NULL THEN
    RAISE EXCEPTION 'ARCONIQUE_DEFAULT organization not found — apply migration 0071 first';
  END IF;

  FOREACH t IN ARRAY tagged_tables LOOP
    -- Skip if table doesn't exist
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.tables
       WHERE table_schema = 'public' AND table_name = t
    ) THEN
      CONTINUE;
    END IF;

    -- Skip if column already exists (idempotency)
    SELECT EXISTS (
      SELECT 1 FROM information_schema.columns
       WHERE table_schema = 'public'
         AND table_name = t
         AND column_name = 'organization_id'
    ) INTO has_col;

    IF NOT has_col THEN
      -- Single statement: add column NOT NULL with DEFAULT — Postgres
      -- backfills atomically, no trigger interleaving.
      EXECUTE format(
        'ALTER TABLE %I ADD COLUMN organization_id UUID NOT NULL DEFAULT %L REFERENCES organizations(id);',
        t, default_org_id
      );
      -- Drop default so future inserts must specify the org explicitly
      EXECUTE format(
        'ALTER TABLE %I ALTER COLUMN organization_id DROP DEFAULT;',
        t
      );
    END IF;

    -- Index for per-org queries (idempotent)
    EXECUTE format(
      'CREATE INDEX IF NOT EXISTS %I ON %I(organization_id);',
      t || '_organization_idx', t
    );
  END LOOP;
END $$;


-- =============================================================================
-- Reference / shared tables — NULLABLE organization_id
-- =============================================================================

DO $$
DECLARE
  ref_tables TEXT[] := ARRAY[
    'asset_types', 'marketing_lead_sources', 'lead_sources', 'tax_types',
    'qa_qc_categories', 'working_calendars', 'holiday_calendar',
    'late_fee_rules', 'unit_types'
  ];
  t TEXT;
  has_col BOOLEAN;
BEGIN
  FOREACH t IN ARRAY ref_tables LOOP
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.tables
       WHERE table_schema = 'public' AND table_name = t
    ) THEN
      CONTINUE;
    END IF;
    SELECT EXISTS (
      SELECT 1 FROM information_schema.columns
       WHERE table_schema = 'public'
         AND table_name = t
         AND column_name = 'organization_id'
    ) INTO has_col;
    IF NOT has_col THEN
      EXECUTE format(
        'ALTER TABLE %I ADD COLUMN organization_id UUID REFERENCES organizations(id);',
        t
      );
    END IF;
    EXECUTE format(
      'CREATE INDEX IF NOT EXISTS %I ON %I(organization_id);',
      t || '_organization_idx', t
    );
  END LOOP;
END $$;

COMMIT;
