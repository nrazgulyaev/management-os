-- 0151 · TENANCY-FINANCE-DOCS — give the FINANCE / DOCS / INFRA tables a
-- nullable `organization_id` anchor + backfill + index.
--
-- SCHEMA + BACKFILL ONLY. This migration does NOT thread org into any query
-- and (deliberately) does NOT set NOT NULL — the column stays NULLABLE so the
-- app layer can adopt it incrementally without a hard cutover (mirrors the
-- TENANCY convention from 0134, minus the SET NOT NULL step).
--
-- Backfill path, per table, follows the natural parent toward an org:
--   statement_*            -> owner_statements.organization_id (set by 0104)
--   document_versions /
--     document_signature_requests -> documents.organization_id
--   documents              -> polymorphic entity (project/villa/booking ->
--                             project -> org); other entity kinds -> DEFAULT
--   revenue_streams /
--     unit_cost_allocations -> projects.organization_id (project_id NOT NULL)
--   cashflow_forecasts     -> projects.organization_id; company-wide -> DEFAULT
--   notification_deliveries / in_app_notifications
--                          -> notification_queue.organization_id
--   job_run_events         -> job_runs.organization_id
--   direct_booking_deposit_events -> direct_booking_deposits.organization_id
--   everything else (payments stub, queue, prefs, templates, job catalog/runs)
--                          -> the single ARCONIQUE_DEFAULT seed org
--
-- Idempotent: ADD COLUMN IF NOT EXISTS + CREATE INDEX IF NOT EXISTS, and every
-- UPDATE is guarded by `WHERE organization_id IS NULL`. Safe to re-run.

-- A single reusable handle to the default org (organization_code is UNIQUE).
-- NULL when an env has no seed org — there the backfills below simply no-op and
-- the columns stay nullable rather than failing the migration.

-- ===========================================================================
-- payments.ts  (manual stub provider + direct-booking deposit workflow)
-- ===========================================================================
ALTER TABLE payment_provider_accounts
  ADD COLUMN IF NOT EXISTS organization_id uuid REFERENCES organizations(id) ON DELETE RESTRICT;
ALTER TABLE direct_booking_deposits
  ADD COLUMN IF NOT EXISTS organization_id uuid REFERENCES organizations(id) ON DELETE RESTRICT;
ALTER TABLE direct_booking_deposit_events
  ADD COLUMN IF NOT EXISTS organization_id uuid REFERENCES organizations(id) ON DELETE RESTRICT;
ALTER TABLE payment_webhook_events
  ADD COLUMN IF NOT EXISTS organization_id uuid REFERENCES organizations(id) ON DELETE RESTRICT;

UPDATE payment_provider_accounts
   SET organization_id = (SELECT id FROM organizations WHERE organization_code = 'ARCONIQUE_DEFAULT' LIMIT 1)
 WHERE organization_id IS NULL;
UPDATE direct_booking_deposits
   SET organization_id = (SELECT id FROM organizations WHERE organization_code = 'ARCONIQUE_DEFAULT' LIMIT 1)
 WHERE organization_id IS NULL;
-- deposit_events inherit from their parent deposit when set, else DEFAULT.
UPDATE direct_booking_deposit_events e
   SET organization_id = d.organization_id
  FROM direct_booking_deposits d
 WHERE e.deposit_id = d.id
   AND e.organization_id IS NULL
   AND d.organization_id IS NOT NULL;
UPDATE direct_booking_deposit_events
   SET organization_id = (SELECT id FROM organizations WHERE organization_code = 'ARCONIQUE_DEFAULT' LIMIT 1)
 WHERE organization_id IS NULL;
UPDATE payment_webhook_events
   SET organization_id = (SELECT id FROM organizations WHERE organization_code = 'ARCONIQUE_DEFAULT' LIMIT 1)
 WHERE organization_id IS NULL;

CREATE INDEX IF NOT EXISTS payment_provider_accounts_org_idx ON payment_provider_accounts(organization_id);
CREATE INDEX IF NOT EXISTS direct_booking_deposits_org_idx ON direct_booking_deposits(organization_id);
CREATE INDEX IF NOT EXISTS direct_booking_deposit_events_org_idx ON direct_booking_deposit_events(organization_id);
CREATE INDEX IF NOT EXISTS payment_webhook_events_org_idx ON payment_webhook_events(organization_id);

-- ===========================================================================
-- statement-anomalies.ts  + statement-transparency.ts
--   parent: owner_statements.organization_id (set by migration 0104)
-- ===========================================================================
ALTER TABLE statement_anomalies
  ADD COLUMN IF NOT EXISTS organization_id uuid REFERENCES organizations(id) ON DELETE RESTRICT;
ALTER TABLE statement_source_groups
  ADD COLUMN IF NOT EXISTS organization_id uuid REFERENCES organizations(id) ON DELETE RESTRICT;
ALTER TABLE statement_source_group_lines
  ADD COLUMN IF NOT EXISTS organization_id uuid REFERENCES organizations(id) ON DELETE RESTRICT;
ALTER TABLE statement_reconciliation_warnings
  ADD COLUMN IF NOT EXISTS organization_id uuid REFERENCES organizations(id) ON DELETE RESTRICT;
ALTER TABLE statement_explanation_snapshots
  ADD COLUMN IF NOT EXISTS organization_id uuid REFERENCES organizations(id) ON DELETE RESTRICT;

UPDATE statement_anomalies a
   SET organization_id = s.organization_id
  FROM owner_statements s
 WHERE a.statement_id = s.id
   AND a.organization_id IS NULL
   AND s.organization_id IS NOT NULL;

UPDATE statement_source_groups g
   SET organization_id = s.organization_id
  FROM owner_statements s
 WHERE g.owner_statement_id = s.id
   AND g.organization_id IS NULL
   AND s.organization_id IS NOT NULL;

UPDATE statement_source_group_lines l
   SET organization_id = s.organization_id
  FROM owner_statements s
 WHERE l.owner_statement_id = s.id
   AND l.organization_id IS NULL
   AND s.organization_id IS NOT NULL;

UPDATE statement_reconciliation_warnings w
   SET organization_id = s.organization_id
  FROM owner_statements s
 WHERE w.owner_statement_id = s.id
   AND w.organization_id IS NULL
   AND s.organization_id IS NOT NULL;
-- system-wide warnings carry no statement link -> DEFAULT
UPDATE statement_reconciliation_warnings
   SET organization_id = (SELECT id FROM organizations WHERE organization_code = 'ARCONIQUE_DEFAULT' LIMIT 1)
 WHERE organization_id IS NULL;

UPDATE statement_explanation_snapshots x
   SET organization_id = s.organization_id
  FROM owner_statements s
 WHERE x.owner_statement_id = s.id
   AND x.organization_id IS NULL
   AND s.organization_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS statement_anomalies_org_idx ON statement_anomalies(organization_id);
CREATE INDEX IF NOT EXISTS statement_source_groups_org_idx ON statement_source_groups(organization_id);
CREATE INDEX IF NOT EXISTS statement_source_group_lines_org_idx ON statement_source_group_lines(organization_id);
CREATE INDEX IF NOT EXISTS statement_reconciliation_warnings_org_idx ON statement_reconciliation_warnings(organization_id);
CREATE INDEX IF NOT EXISTS statement_explanation_snapshots_org_idx ON statement_explanation_snapshots(organization_id);

-- ===========================================================================
-- documents.ts  (polymorphic entity_type / entity_id)
-- ===========================================================================
ALTER TABLE documents
  ADD COLUMN IF NOT EXISTS organization_id uuid REFERENCES organizations(id) ON DELETE RESTRICT;

-- entity = project  -> projects.organization_id
UPDATE documents d
   SET organization_id = p.organization_id
  FROM projects p
 WHERE d.entity_type = 'project'
   AND d.entity_id = p.id
   AND d.organization_id IS NULL
   AND p.organization_id IS NOT NULL;

-- entity = villa    -> villas.project_id -> projects.organization_id
UPDATE documents d
   SET organization_id = p.organization_id
  FROM villas v
  JOIN projects p ON p.id = v.project_id
 WHERE d.entity_type = 'villa'
   AND d.entity_id = v.id
   AND d.organization_id IS NULL
   AND p.organization_id IS NOT NULL;

-- entity = booking  -> bookings.villa_id -> villas.project_id -> projects.org
UPDATE documents d
   SET organization_id = p.organization_id
  FROM bookings b
  JOIN villas v ON v.id = b.villa_id
  JOIN projects p ON p.id = v.project_id
 WHERE d.entity_type = 'booking'
   AND d.entity_id = b.id
   AND d.organization_id IS NULL
   AND p.organization_id IS NOT NULL;

-- everything else (owner / supplier / task / maintenance / unresolved) -> DEFAULT
UPDATE documents
   SET organization_id = (SELECT id FROM organizations WHERE organization_code = 'ARCONIQUE_DEFAULT' LIMIT 1)
 WHERE organization_id IS NULL;

CREATE INDEX IF NOT EXISTS documents_org_idx ON documents(organization_id);

-- ===========================================================================
-- documents-app.ts
--   templates -> DEFAULT (org-global today)
--   versions / signature_requests -> documents.organization_id
-- ===========================================================================
ALTER TABLE document_templates
  ADD COLUMN IF NOT EXISTS organization_id uuid REFERENCES organizations(id) ON DELETE RESTRICT;
ALTER TABLE document_versions
  ADD COLUMN IF NOT EXISTS organization_id uuid REFERENCES organizations(id) ON DELETE RESTRICT;
ALTER TABLE document_signature_requests
  ADD COLUMN IF NOT EXISTS organization_id uuid REFERENCES organizations(id) ON DELETE RESTRICT;

UPDATE document_templates
   SET organization_id = (SELECT id FROM organizations WHERE organization_code = 'ARCONIQUE_DEFAULT' LIMIT 1)
 WHERE organization_id IS NULL;

UPDATE document_versions dv
   SET organization_id = d.organization_id
  FROM documents d
 WHERE dv.document_id = d.id
   AND dv.organization_id IS NULL
   AND d.organization_id IS NOT NULL;

UPDATE document_signature_requests sr
   SET organization_id = d.organization_id
  FROM documents d
 WHERE sr.document_id = d.id
   AND sr.organization_id IS NULL
   AND d.organization_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS document_templates_org_idx ON document_templates(organization_id);
CREATE INDEX IF NOT EXISTS document_versions_org_idx ON document_versions(organization_id);
CREATE INDEX IF NOT EXISTS document_signature_requests_org_idx ON document_signature_requests(organization_id);

-- ===========================================================================
-- notifications.ts
--   queue / preferences / templates -> DEFAULT
--   deliveries / in_app -> notification_queue.organization_id
-- ===========================================================================
ALTER TABLE notification_queue
  ADD COLUMN IF NOT EXISTS organization_id uuid REFERENCES organizations(id) ON DELETE RESTRICT;
ALTER TABLE notification_deliveries
  ADD COLUMN IF NOT EXISTS organization_id uuid REFERENCES organizations(id) ON DELETE RESTRICT;
ALTER TABLE in_app_notifications
  ADD COLUMN IF NOT EXISTS organization_id uuid REFERENCES organizations(id) ON DELETE RESTRICT;
ALTER TABLE notification_preferences
  ADD COLUMN IF NOT EXISTS organization_id uuid REFERENCES organizations(id) ON DELETE RESTRICT;
ALTER TABLE notification_templates
  ADD COLUMN IF NOT EXISTS organization_id uuid REFERENCES organizations(id) ON DELETE RESTRICT;

UPDATE notification_queue
   SET organization_id = (SELECT id FROM organizations WHERE organization_code = 'ARCONIQUE_DEFAULT' LIMIT 1)
 WHERE organization_id IS NULL;

UPDATE notification_deliveries nd
   SET organization_id = nq.organization_id
  FROM notification_queue nq
 WHERE nd.notification_id = nq.id
   AND nd.organization_id IS NULL
   AND nq.organization_id IS NOT NULL;

UPDATE in_app_notifications ian
   SET organization_id = nq.organization_id
  FROM notification_queue nq
 WHERE ian.notification_id = nq.id
   AND ian.organization_id IS NULL
   AND nq.organization_id IS NOT NULL;
-- in_app rows without a queue link -> DEFAULT
UPDATE in_app_notifications
   SET organization_id = (SELECT id FROM organizations WHERE organization_code = 'ARCONIQUE_DEFAULT' LIMIT 1)
 WHERE organization_id IS NULL;

UPDATE notification_preferences
   SET organization_id = (SELECT id FROM organizations WHERE organization_code = 'ARCONIQUE_DEFAULT' LIMIT 1)
 WHERE organization_id IS NULL;
UPDATE notification_templates
   SET organization_id = (SELECT id FROM organizations WHERE organization_code = 'ARCONIQUE_DEFAULT' LIMIT 1)
 WHERE organization_id IS NULL;

CREATE INDEX IF NOT EXISTS nq_org_idx ON notification_queue(organization_id);
CREATE INDEX IF NOT EXISTS nd_org_idx ON notification_deliveries(organization_id);
CREATE INDEX IF NOT EXISTS ian_org_idx ON in_app_notifications(organization_id);
CREATE INDEX IF NOT EXISTS np_org_idx ON notification_preferences(organization_id);
CREATE INDEX IF NOT EXISTS notification_templates_org_idx ON notification_templates(organization_id);

-- ===========================================================================
-- jobs.ts
--   definitions / runs -> DEFAULT (platform-global today)
--   run_events -> job_runs.organization_id
-- ===========================================================================
ALTER TABLE job_definitions
  ADD COLUMN IF NOT EXISTS organization_id uuid REFERENCES organizations(id) ON DELETE RESTRICT;
ALTER TABLE job_runs
  ADD COLUMN IF NOT EXISTS organization_id uuid REFERENCES organizations(id) ON DELETE RESTRICT;
ALTER TABLE job_run_events
  ADD COLUMN IF NOT EXISTS organization_id uuid REFERENCES organizations(id) ON DELETE RESTRICT;

UPDATE job_definitions
   SET organization_id = (SELECT id FROM organizations WHERE organization_code = 'ARCONIQUE_DEFAULT' LIMIT 1)
 WHERE organization_id IS NULL;
UPDATE job_runs
   SET organization_id = (SELECT id FROM organizations WHERE organization_code = 'ARCONIQUE_DEFAULT' LIMIT 1)
 WHERE organization_id IS NULL;

UPDATE job_run_events e
   SET organization_id = r.organization_id
  FROM job_runs r
 WHERE e.job_run_id = r.id
   AND e.organization_id IS NULL
   AND r.organization_id IS NOT NULL;
UPDATE job_run_events
   SET organization_id = (SELECT id FROM organizations WHERE organization_code = 'ARCONIQUE_DEFAULT' LIMIT 1)
 WHERE organization_id IS NULL;

CREATE INDEX IF NOT EXISTS job_def_org_idx ON job_definitions(organization_id);
CREATE INDEX IF NOT EXISTS job_runs_org_idx ON job_runs(organization_id);
CREATE INDEX IF NOT EXISTS job_run_events_org_idx ON job_run_events(organization_id);

-- ===========================================================================
-- revenue-streams.ts  + profitability-cashflow.ts
--   parent: projects.organization_id (project_id NOT NULL on the first two;
--   cashflow_forecasts.project_id is nullable -> company-wide rows -> DEFAULT)
-- ===========================================================================
ALTER TABLE revenue_streams
  ADD COLUMN IF NOT EXISTS organization_id uuid REFERENCES organizations(id) ON DELETE RESTRICT;
ALTER TABLE unit_cost_allocations
  ADD COLUMN IF NOT EXISTS organization_id uuid REFERENCES organizations(id) ON DELETE RESTRICT;
ALTER TABLE cashflow_forecasts
  ADD COLUMN IF NOT EXISTS organization_id uuid REFERENCES organizations(id) ON DELETE RESTRICT;

UPDATE revenue_streams rs
   SET organization_id = p.organization_id
  FROM projects p
 WHERE rs.project_id = p.id
   AND rs.organization_id IS NULL
   AND p.organization_id IS NOT NULL;

UPDATE unit_cost_allocations uca
   SET organization_id = p.organization_id
  FROM projects p
 WHERE uca.project_id = p.id
   AND uca.organization_id IS NULL
   AND p.organization_id IS NOT NULL;

UPDATE cashflow_forecasts cf
   SET organization_id = p.organization_id
  FROM projects p
 WHERE cf.project_id = p.id
   AND cf.organization_id IS NULL
   AND p.organization_id IS NOT NULL;
-- company-wide forecasts (null project) -> DEFAULT
UPDATE cashflow_forecasts
   SET organization_id = (SELECT id FROM organizations WHERE organization_code = 'ARCONIQUE_DEFAULT' LIMIT 1)
 WHERE organization_id IS NULL;

CREATE INDEX IF NOT EXISTS revenue_streams_org_idx ON revenue_streams(organization_id);
CREATE INDEX IF NOT EXISTS unit_cost_allocations_org_idx ON unit_cost_allocations(organization_id);
CREATE INDEX IF NOT EXISTS cashflow_forecasts_org_idx ON cashflow_forecasts(organization_id);
