-- Arconique Management OS — Demo seed data
-- Idempotent. Apply after 0000_initial.sql.
-- psql "$DIRECT_URL" -f drizzle/seed.sql
-- Everything labelled "demo" — never use in production.
--
-- Defensive guard convention (see tests/seed-defensive-guards.test.ts):
-- Every DO block that INSERTs into a table with FK columns referencing
-- other rows seeded in this file MUST start its BEGIN with one or more
-- existence checks of the form:
--
--   IF NOT EXISTS (SELECT 1 FROM <fk_table> WHERE id = <fk_value>) THEN
--     RAISE NOTICE 'Skipping <section> seed — prerequisite ... missing';
--     RETURN;
--   END IF;
--
-- This converts silent partial-seed failures into a single audible
-- NOTICE instead of a loud FK violation downstream. The test suite
-- enforces the convention so future edits don't regress it.
--
-- ============================================================================
-- ON CONFLICT and partial unique indexes (see tests/seed-defensive-guards.test.ts)
-- ============================================================================
-- When the inferred arbiter is a *partial* unique index, the ON CONFLICT
-- clause MUST repeat the partial predicate verbatim — otherwise PG raises
-- error 42P10 "there is no unique or exclusion constraint matching the
-- ON CONFLICT specification" (plancat.c, infer_arbiter_indexes).
--
-- Partial unique index in schema:
--   CREATE UNIQUE INDEX foo_unique ON foo (a, b) WHERE b IS NOT NULL;
--
-- Required ON CONFLICT clause in this file:
--   ON CONFLICT (a, b) WHERE b IS NOT NULL DO NOTHING
--
-- The regression test parses every CREATE UNIQUE INDEX in drizzle/*.sql and
-- every uniqueIndex(...).where(...) in src/lib/db/schema/*.ts, then walks
-- every ON CONFLICT clause in this file and asserts that any clause whose
-- columns match a partial index also carries the partial predicate.

-- =============================================================================
-- Roles + permissions (system-level)
-- =============================================================================
INSERT INTO roles (key, name, description, is_system) VALUES
  ('super_admin', 'Super Admin', 'System custodian, access, integrations', true),
  ('director', 'Director', 'Portfolio P&L, strategy, investor trust', true),
  ('operations_manager', 'Operations Manager', 'Runs daily operations across projects', true),
  ('property_manager', 'Property Manager', 'Owns a specific project or cluster', true),
  ('finance_manager', 'Finance Manager', 'Monthly close, statements, taxes', true),
  ('accountant', 'Accountant', 'Junior finance, mostly read', true),
  ('concierge', 'Concierge / Guest Relations', 'Pre-arrival, in-stay, upsell', true),
  ('housekeeping_supervisor', 'Housekeeping Supervisor', 'Turnover quality, photo approval', true),
  ('housekeeper', 'Housekeeper', 'Cleaning tasks, linen counts', true),
  ('technician', 'Technician', 'Repairs, preventive ops', true),
  ('procurement_manager', 'Procurement Manager', 'Suppliers, PO, receipts', true),
  ('security', 'Security', 'Gate, access, cameras', true),
  ('sales_manager', 'Sales Manager', 'CRM, leads', true),
  ('investor_owner', 'Investor / Owner', 'External, owner-scoped', true),
  ('investor_viewer', 'Investor delegate viewer', 'Read-only for investors', true),
  ('agent', 'External Agent', 'Broker / referral', true)
ON CONFLICT (key) DO UPDATE SET name = EXCLUDED.name;

INSERT INTO permissions (key, name) VALUES
  ('projects.read', 'Read projects'),
  ('projects.write', 'Write projects'),
  ('villas.read', 'Read villas'),
  ('villas.write', 'Write villas'),
  ('villas.status.change', 'Change villa status'),
  ('owners.read', 'Read owners'),
  ('owners.write', 'Write owners'),
  ('shares.read', 'Read ownership shares'),
  ('shares.write', 'Write ownership shares'),
  ('bookings.read', 'Read bookings'),
  ('bookings.write', 'Write bookings'),
  ('documents.read', 'Read documents'),
  ('documents.upload', 'Upload documents'),
  ('audit.read', 'Read audit events')
ON CONFLICT (key) DO NOTHING;

-- =============================================================================
-- Booking channels
-- =============================================================================
INSERT INTO booking_channels (key, name, type, commission_model, default_commission_pct) VALUES
  ('airbnb', 'Airbnb', 'ota', 'percent', 3.000),
  ('booking', 'Booking.com', 'ota', 'percent', 15.000),
  ('agoda', 'Agoda', 'ota', 'percent', 17.000),
  ('expedia', 'Expedia', 'ota', 'percent', 18.000),
  ('direct', 'Direct', 'direct', 'none', 0.000),
  ('instagram_whatsapp', 'Instagram / WhatsApp', 'social', 'none', 0.000),
  ('agent', 'Agent', 'agent', 'percent', 10.000)
ON CONFLICT (key) DO UPDATE SET
  name = EXCLUDED.name,
  type = EXCLUDED.type,
  commission_model = EXCLUDED.commission_model,
  default_commission_pct = EXCLUDED.default_commission_pct;

-- =============================================================================
-- Projects (deterministic UUIDs for repeatable seeding)
-- =============================================================================
INSERT INTO projects (id, slug, name, concept, location, area, description, status, management_status, total_villas, target_handover_date, leasehold_until)
VALUES
  ('1eda0001-0000-0000-0000-000000000001', 'eternal-villas', 'Eternal Villas',
   'Six residences above the Ayung valley',
   'Bali · Ubud', 'Ubud',
   'A private enclave of six architect-designed villas. Hybrid ownership with shared operating reserves.',
   'managed', 'managed', 6, '2024-09-01', '2052-12-31'),
  ('1eda0001-0000-0000-0000-000000000002', 'enso-villas', 'Enso Villas',
   'Circle-inspired retreats in Berawa',
   'Bali · Berawa, Canggu', 'Berawa',
   'Eight fully-pooled villas operated as one hospitality asset. Pool members receive weighted distribution.',
   'managed', 'managed', 8, '2025-03-15', '2055-06-30'),
  ('1eda0001-0000-0000-0000-000000000003', 'ahau-gardens', 'Ahau Gardens',
   'Garden residences in Pererenan',
   'Bali · Pererenan', 'Pererenan',
   'Individually-owned garden villas with shared landscape and security. Each owner receives a dedicated monthly P&L.',
   'active', 'onboarding', 5, '2026-01-15', '2056-04-30')
ON CONFLICT (slug) DO UPDATE SET
  name = EXCLUDED.name, concept = EXCLUDED.concept, location = EXCLUDED.location,
  area = EXCLUDED.area, description = EXCLUDED.description,
  status = EXCLUDED.status, management_status = EXCLUDED.management_status,
  total_villas = EXCLUDED.total_villas;

-- =============================================================================
-- Villas
-- =============================================================================
-- Stage 5.B.1 made `asset_type_id` NOT NULL on villas. Sub-select the
-- 'villa' type from the asset_types registry seeded in migration 0057
-- so this seed remains idempotent post-5.B.
INSERT INTO villas (id, project_id, slug, unit_code, name, status, bedrooms, bathrooms, built_area_sqm, view_type, management_model, current_nightly_rate_usd, asset_type_id)
VALUES
  -- Eternal (hybrid)
  ('1eda0002-0000-0000-0000-000000000001', '1eda0001-0000-0000-0000-000000000001', 'eternal-s1', 'EV-S1', 'Eternal S1', 'occupied', 3, 3.5, 220, 'jungle', 'hybrid', 520, (SELECT id FROM asset_types WHERE type_key = 'villa')),
  ('1eda0002-0000-0000-0000-000000000002', '1eda0001-0000-0000-0000-000000000001', 'eternal-s2', 'EV-S2', 'Eternal S2', 'cleaning', 3, 3.5, 220, 'jungle', 'hybrid', 520, (SELECT id FROM asset_types WHERE type_key = 'villa')),
  ('1eda0002-0000-0000-0000-000000000003', '1eda0001-0000-0000-0000-000000000001', 'eternal-s5', 'EV-S5', 'Eternal S5', 'ready', 4, 4.5, 280, 'rice_field', 'hybrid', 720, (SELECT id FROM asset_types WHERE type_key = 'villa')),
  ('1eda0002-0000-0000-0000-000000000004', '1eda0001-0000-0000-0000-000000000001', 'eternal-s6', 'EV-S6', 'Eternal S6', 'inspection', 4, 4.5, 280, 'rice_field', 'hybrid', 720, (SELECT id FROM asset_types WHERE type_key = 'villa')),

  -- Enso (pooled)
  ('1eda0002-0000-0000-0000-000000000010', '1eda0001-0000-0000-0000-000000000002', 'enso-s1', 'ES-S1', 'Enso S1', 'occupied', 3, 3.5, 200, 'garden', 'pooled', 610, (SELECT id FROM asset_types WHERE type_key = 'villa')),
  ('1eda0002-0000-0000-0000-000000000011', '1eda0001-0000-0000-0000-000000000002', 'enso-s2', 'ES-S2', 'Enso S2', 'cleaning', 3, 3.5, 200, 'garden', 'pooled', 610, (SELECT id FROM asset_types WHERE type_key = 'villa')),
  ('1eda0002-0000-0000-0000-000000000012', '1eda0001-0000-0000-0000-000000000002', 'enso-s5', 'ES-S5', 'Enso S5', 'ready', 4, 4.5, 260, 'ocean', 'pooled', 820, (SELECT id FROM asset_types WHERE type_key = 'villa')),
  ('1eda0002-0000-0000-0000-000000000013', '1eda0001-0000-0000-0000-000000000002', 'enso-s6', 'ES-S6', 'Enso S6', 'maintenance_blocked', 4, 4.5, 260, 'ocean', 'pooled', 820, (SELECT id FROM asset_types WHERE type_key = 'villa')),

  -- Ahau (individual)
  ('1eda0002-0000-0000-0000-000000000020', '1eda0001-0000-0000-0000-000000000003', 'ahau-01', 'AH-01', 'Ahau 01', 'ready', 3, 3.0, 210, 'garden', 'individual', 690, (SELECT id FROM asset_types WHERE type_key = 'villa')),
  ('1eda0002-0000-0000-0000-000000000021', '1eda0001-0000-0000-0000-000000000003', 'ahau-02', 'AH-02', 'Ahau 02', 'checkout_pending', 4, 4.0, 250, 'garden', 'individual', 760, (SELECT id FROM asset_types WHERE type_key = 'villa'))
ON CONFLICT (project_id, unit_code) DO UPDATE SET
  status = EXCLUDED.status, name = EXCLUDED.name, bedrooms = EXCLUDED.bedrooms,
  bathrooms = EXCLUDED.bathrooms, built_area_sqm = EXCLUDED.built_area_sqm,
  view_type = EXCLUDED.view_type, management_model = EXCLUDED.management_model,
  current_nightly_rate_usd = EXCLUDED.current_nightly_rate_usd;

-- =============================================================================
-- Owners
-- =============================================================================
INSERT INTO owners (id, type, display_name, legal_name, email, phone, nationality, tax_residency, status)
VALUES
  ('1eda0003-0000-0000-0000-000000000001', 'individual', 'Demo Owner — Emma Whitmore', 'Emma Whitmore',
   'emma.demo@arconique.com', '+44 20 7000 0000', 'British', 'United Kingdom', 'active'),
  ('1eda0003-0000-0000-0000-000000000002', 'family_office', 'Demo Investor — Takeda Family Office', 'Takeda FO Pte. Ltd.',
   'takeda.demo@arconique.com', '+81 3 0000 0000', 'Japanese', 'Singapore', 'active'),
  ('1eda0003-0000-0000-0000-000000000003', 'company', 'Demo Pool Investor — Sonoma Capital', 'Sonoma Capital Holdings',
   'sonoma.demo@arconique.com', '+1 415 000 0000', 'American', 'United States', 'active')
ON CONFLICT (id) DO UPDATE SET
  display_name = EXCLUDED.display_name, email = EXCLUDED.email, status = EXCLUDED.status;

-- =============================================================================
-- Ownership shares
-- =============================================================================
INSERT INTO ownership_shares (id, owner_id, villa_id, project_id, share_percent, model, starts_on, status) VALUES
  -- Individual: Emma owns Ahau 02 100%
  ('1eda0004-0000-0000-0000-000000000001',
   '1eda0003-0000-0000-0000-000000000001', '1eda0002-0000-0000-0000-000000000021', NULL,
   100.000000, 'individual', '2024-01-01', 'active'),
  -- Hybrid: Emma owns Eternal S5 100%
  ('1eda0004-0000-0000-0000-000000000002',
   '1eda0003-0000-0000-0000-000000000001', '1eda0002-0000-0000-0000-000000000003', NULL,
   100.000000, 'hybrid', '2024-09-01', 'active'),
  -- Pooled: Takeda 12% Enso pool
  ('1eda0004-0000-0000-0000-000000000003',
   '1eda0003-0000-0000-0000-000000000002', NULL, '1eda0001-0000-0000-0000-000000000002',
   12.000000, 'pooled', '2025-03-15', 'active'),
  -- Pooled: Sonoma 24% Enso pool
  ('1eda0004-0000-0000-0000-000000000004',
   '1eda0003-0000-0000-0000-000000000003', NULL, '1eda0001-0000-0000-0000-000000000002',
   24.000000, 'pooled', '2025-03-15', 'active'),
  -- Pooled: Emma 3% Enso pool
  ('1eda0004-0000-0000-0000-000000000005',
   '1eda0003-0000-0000-0000-000000000001', NULL, '1eda0001-0000-0000-0000-000000000002',
   3.000000, 'pooled', '2025-03-15', 'active')
ON CONFLICT (id) DO UPDATE SET share_percent = EXCLUDED.share_percent, status = EXCLUDED.status;

INSERT INTO payout_methods (id, owner_id, method_type, currency, account_label, bank_name, account_last4, is_default) VALUES
  ('1eda0005-0000-0000-0000-000000000001',
   '1eda0003-0000-0000-0000-000000000001', 'wise', 'USD', 'Wise · USD demo', NULL, NULL, true),
  ('1eda0005-0000-0000-0000-000000000002',
   '1eda0003-0000-0000-0000-000000000002', 'bank_intl', 'USD', 'Tokyo Mitsubishi · demo', 'MUFG Bank', '0124', true),
  ('1eda0005-0000-0000-0000-000000000003',
   '1eda0003-0000-0000-0000-000000000003', 'bank_intl', 'USD', 'JPMorgan San Francisco · demo', 'JPMorgan Chase', '5577', true)
ON CONFLICT (id) DO UPDATE SET account_label = EXCLUDED.account_label;

-- =============================================================================
-- Guests + manual bookings
-- =============================================================================
INSERT INTO guests (id, full_name, email, phone, nationality, preferred_language, whatsapp) VALUES
  ('1eda0006-0000-0000-0000-000000000001', 'A. Martin', 'a.martin@example.com', '+33 1 00 00 00 00', 'French', 'en', '+33100000000'),
  ('1eda0006-0000-0000-0000-000000000002', 'H. Williams', 'h.williams@example.com', '+44 20 7100 0000', 'British', 'en', '+44207100000'),
  ('1eda0006-0000-0000-0000-000000000003', 'L. Okonkwo', 'l.okonkwo@example.com', '+234 80 0000 0000', 'Nigerian', 'en', '+2348000000000'),
  ('1eda0006-0000-0000-0000-000000000004', 'Family Nielsen', 'nielsen@example.com', '+45 30 00 00 00', 'Danish', 'en', '+4530000000'),
  ('1eda0006-0000-0000-0000-000000000005', 'Mr. Tanaka', 'tanaka@example.com', '+81 90 0000 0000', 'Japanese', 'ja', '+8190000000')
ON CONFLICT (id) DO UPDATE SET full_name = EXCLUDED.full_name;

INSERT INTO bookings (id, villa_id, guest_id, channel_id, booking_code, status, check_in, check_out, nights, adults, children, currency, gross_amount, cleaning_fee_amount, channel_fee_amount, payment_fee_amount)
SELECT
  '1eda0007-0000-0000-0000-000000000001'::uuid,
  '1eda0002-0000-0000-0000-000000000012',
  '1eda0006-0000-0000-0000-000000000001',
  bc.id,
  'ARC-A-00241',
  'confirmed', '2026-04-26', '2026-04-30', 4, 4, 0, 'USD',
  3280.00, 180.00, 98.40, 95.13
FROM booking_channels bc WHERE bc.key = 'airbnb'
ON CONFLICT (booking_code) DO NOTHING;

INSERT INTO bookings (id, villa_id, guest_id, channel_id, booking_code, status, check_in, check_out, nights, adults, children, currency, gross_amount, cleaning_fee_amount, channel_fee_amount, payment_fee_amount)
SELECT
  '1eda0007-0000-0000-0000-000000000002'::uuid,
  '1eda0002-0000-0000-0000-000000000003',
  '1eda0006-0000-0000-0000-000000000002',
  bc.id,
  'ARC-A-00239',
  'confirmed', '2026-04-25', '2026-04-30', 5, 6, 0, 'USD',
  3600.00, 180.00, 540.00, 104.40
FROM booking_channels bc WHERE bc.key = 'booking'
ON CONFLICT (booking_code) DO NOTHING;

INSERT INTO bookings (id, villa_id, guest_id, channel_id, booking_code, status, check_in, check_out, nights, adults, children, currency, gross_amount, cleaning_fee_amount, channel_fee_amount, payment_fee_amount)
SELECT
  '1eda0007-0000-0000-0000-000000000003'::uuid,
  '1eda0002-0000-0000-0000-000000000011',
  '1eda0006-0000-0000-0000-000000000004',
  bc.id,
  'ARC-A-00238',
  'confirmed', '2026-04-25', '2026-05-01', 6, 7, 0, 'USD',
  3660.00, 180.00, 0.00, 106.14
FROM booking_channels bc WHERE bc.key = 'direct'
ON CONFLICT (booking_code) DO NOTHING;

INSERT INTO bookings (id, villa_id, guest_id, channel_id, booking_code, status, check_in, check_out, nights, adults, children, currency, gross_amount, cleaning_fee_amount, channel_fee_amount, payment_fee_amount)
SELECT
  '1eda0007-0000-0000-0000-000000000004'::uuid,
  '1eda0002-0000-0000-0000-000000000020',
  '1eda0006-0000-0000-0000-000000000003',
  bc.id,
  'ARC-A-00237',
  'confirmed', '2026-04-27', '2026-05-04', 7, 4, 2, 'USD',
  4830.00, 180.00, 483.00, 140.07
FROM booking_channels bc WHERE bc.key = 'agent'
ON CONFLICT (booking_code) DO NOTHING;

INSERT INTO bookings (id, villa_id, guest_id, channel_id, booking_code, status, check_in, check_out, nights, adults, children, currency, gross_amount, cleaning_fee_amount, channel_fee_amount, payment_fee_amount)
SELECT
  '1eda0007-0000-0000-0000-000000000005'::uuid,
  '1eda0002-0000-0000-0000-000000000021',
  '1eda0006-0000-0000-0000-000000000005',
  bc.id,
  'ARC-A-00235',
  'checked_in', '2026-04-22', '2026-04-26', 4, 2, 0, 'USD',
  3040.00, 180.00, 91.20, 88.16
FROM booking_channels bc WHERE bc.key = 'booking'
ON CONFLICT (booking_code) DO NOTHING;

-- =============================================================================
-- Sample document metadata (no real files in storage yet)
-- =============================================================================
INSERT INTO documents (id, title, document_type, entity_type, entity_id, visibility) VALUES
  ('1eda0008-0000-0000-0000-000000000001', 'Eternal Villas — Management agreement (sample)', 'contract', 'project', '1eda0001-0000-0000-0000-000000000001', 'internal'),
  ('1eda0008-0000-0000-0000-000000000002', 'Enso Villas — Pool participation deed (sample)', 'contract', 'project', '1eda0001-0000-0000-0000-000000000002', 'internal'),
  ('1eda0008-0000-0000-0000-000000000003', 'Ahau Gardens — Owner welcome packet (sample)', 'guide', 'project', '1eda0001-0000-0000-0000-000000000003', 'owner')
ON CONFLICT (id) DO NOTHING;

-- =============================================================================
-- v3 — Finance demo data (skipped if migration 0002 has not been applied)
-- =============================================================================
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'statement_periods') THEN
    RAISE NOTICE 'Finance tables not present — skipping v3 seed.';
    RETURN;
  END IF;

  -- Statement periods (current + previous month, anchored to 2026-04 for the demo).
  -- Both periods start as `open` so the seed can post historical data; operators
  -- can close them via /dashboard/finance/periods to demo the lock trigger.
  INSERT INTO statement_periods (id, period_start, period_end, label, status) VALUES
    ('1eda0900-0000-0000-0000-000000000301', '2026-03-01', '2026-03-31', 'March 2026', 'open'),
    ('1eda0900-0000-0000-0000-000000000302', '2026-04-01', '2026-04-30', 'April 2026', 'open')
  ON CONFLICT (period_start, period_end) DO UPDATE
    SET label = EXCLUDED.label,
        status = 'open',
        closed_at = NULL,
        locked_at = NULL;

  -- Management fee rule: 18% of gross, applies portfolio-wide
  INSERT INTO management_fee_rules (id, project_id, villa_id, rule_name, fee_model, fee_percent, currency, starts_on, status)
  VALUES (
    '1eda0901-0000-0000-0000-000000000001', NULL, NULL,
    'Standard 18% of gross', 'percent_of_gross', 18.000, 'USD', '2024-01-01', 'active'
  )
  ON CONFLICT (id) DO NOTHING;

  -- Revenue lines (March 2026, sample)
  INSERT INTO revenue_lines (id, booking_id, villa_id, project_id, revenue_type, description, amount_minor, currency, service_date, source, status, visibility)
  VALUES
    ('1eda0902-0000-0000-0000-000000000001',
     '1eda0007-0000-0000-0000-000000000005',
     '1eda0002-0000-0000-0000-000000000021',
     '1eda0001-0000-0000-0000-000000000003',
     'nightly', 'AH-02 · 4 nights · Mr Tanaka',
     304000, 'USD', '2026-03-22', 'booking', 'posted', 'owner'),
    ('1eda0902-0000-0000-0000-000000000002',
     NULL,
     '1eda0002-0000-0000-0000-000000000003',
     '1eda0001-0000-0000-0000-000000000001',
     'nightly', 'EV-S5 · 12 nights · sample direct',
     1248000, 'USD', '2026-03-15', 'manual', 'posted', 'owner'),
    ('1eda0902-0000-0000-0000-000000000003',
     NULL,
     '1eda0002-0000-0000-0000-000000000012',
     '1eda0001-0000-0000-0000-000000000002',
     'nightly', 'ES-S5 · 16 nights · pooled sample',
     1820000, 'USD', '2026-03-08', 'manual', 'posted', 'owner'),
    ('1eda0902-0000-0000-0000-000000000004',
     NULL,
     '1eda0002-0000-0000-0000-000000000003',
     '1eda0001-0000-0000-0000-000000000001',
     'cleaning_fee', 'EV-S5 · cleaning fee charged to guest',
     18000, 'USD', '2026-03-15', 'manual', 'posted', 'owner')
  ON CONFLICT (id) DO NOTHING;

  -- Fee lines
  INSERT INTO fee_lines (id, villa_id, project_id, fee_type, description, amount_minor, currency, fee_date, source, status)
  VALUES
    ('1eda0903-0000-0000-0000-000000000001',
     '1eda0002-0000-0000-0000-000000000003', '1eda0001-0000-0000-0000-000000000001',
     'ota_commission', 'Booking.com 15% on EV-S5 March bookings',
     -187200, 'USD', '2026-03-31', 'manual', 'posted'),
    ('1eda0903-0000-0000-0000-000000000002',
     '1eda0002-0000-0000-0000-000000000012', '1eda0001-0000-0000-0000-000000000002',
     'payment_processing', 'Xendit 2.9% on ES-S5',
     -52780, 'USD', '2026-03-31', 'manual', 'posted'),
    ('1eda0903-0000-0000-0000-000000000003',
     '1eda0002-0000-0000-0000-000000000021', '1eda0001-0000-0000-0000-000000000003',
     'ota_commission', 'Booking.com 3% on AH-02',
     -9120, 'USD', '2026-03-31', 'manual', 'posted')
  ON CONFLICT (id) DO NOTHING;

  -- Expense lines
  INSERT INTO expense_lines (id, villa_id, project_id, expense_type, description, amount_minor, currency, expense_date, allocation_scope, owner_chargeable, status)
  VALUES
    ('1eda0904-0000-0000-0000-000000000001',
     '1eda0002-0000-0000-0000-000000000003', '1eda0001-0000-0000-0000-000000000001',
     'utilities', 'EV-S5 utilities · March', 64500, 'USD', '2026-03-31', 'villa', true, 'posted'),
    ('1eda0904-0000-0000-0000-000000000002',
     '1eda0002-0000-0000-0000-000000000003', '1eda0001-0000-0000-0000-000000000001',
     'cleaning', 'EV-S5 turnover cleaning · 6 turnovers', 41000, 'USD', '2026-03-31', 'villa', true, 'posted'),
    ('1eda0904-0000-0000-0000-000000000003',
     NULL, '1eda0001-0000-0000-0000-000000000002',
     'security', 'Enso pool · 24/7 security · March', 96000, 'USD', '2026-03-31', 'project_pool', true, 'posted'),
    ('1eda0904-0000-0000-0000-000000000004',
     NULL, '1eda0001-0000-0000-0000-000000000002',
     'garden', 'Enso pool · landscaping · March', 32000, 'USD', '2026-03-31', 'project_pool', true, 'posted'),
    ('1eda0904-0000-0000-0000-000000000005',
     '1eda0002-0000-0000-0000-000000000021', '1eda0001-0000-0000-0000-000000000003',
     'maintenance', 'AH-02 · pool pump replacement', 28000, 'USD', '2026-03-20', 'villa', true, 'posted')
  ON CONFLICT (id) DO NOTHING;

  -- Tax lines
  INSERT INTO tax_lines (id, villa_id, project_id, tax_type, description, amount_minor, currency, tax_date, owner_visible, status)
  VALUES
    ('1eda0905-0000-0000-0000-000000000001',
     '1eda0002-0000-0000-0000-000000000003', '1eda0001-0000-0000-0000-000000000001',
     'local_hospitality_tax', 'PHR 10% on EV-S5 March',
     -124800, 'USD', '2026-03-31', true, 'posted'),
    ('1eda0905-0000-0000-0000-000000000002',
     '1eda0002-0000-0000-0000-000000000012', '1eda0001-0000-0000-0000-000000000002',
     'local_hospitality_tax', 'PHR 10% on ES-S5 March',
     -182000, 'USD', '2026-03-31', true, 'posted')
  ON CONFLICT (id) DO NOTHING;

  -- Reserves
  INSERT INTO reserve_movements (id, villa_id, project_id, reserve_type, movement_type, description, amount_minor, currency, movement_date, status)
  VALUES
    ('1eda0906-0000-0000-0000-000000000001',
     '1eda0002-0000-0000-0000-000000000003', '1eda0001-0000-0000-0000-000000000001',
     'renovation', 'contribution', 'Renovation reserve · 3% of EV-S5 March net',
     37440, 'USD', '2026-03-31', 'posted'),
    ('1eda0906-0000-0000-0000-000000000002',
     '1eda0002-0000-0000-0000-000000000003', '1eda0001-0000-0000-0000-000000000001',
     'ffe', 'contribution', 'FF&E reserve · 5% of EV-S5 March net',
     62400, 'USD', '2026-03-31', 'posted'),
    ('1eda0906-0000-0000-0000-000000000003',
     '1eda0002-0000-0000-0000-000000000012', '1eda0001-0000-0000-0000-000000000002',
     'renovation', 'contribution', 'Renovation reserve · 3% of ES-S5 March net',
     54600, 'USD', '2026-03-31', 'posted')
  ON CONFLICT (id) DO NOTHING;

  -- Payout batch placeholder for March
  INSERT INTO payout_batches (id, batch_code, period_start, period_end, currency, status)
  VALUES (
    '1eda0907-0000-0000-0000-000000000001',
    'PAYOUT-2026-03', '2026-03-01', '2026-03-31', 'USD', 'draft'
  )
  ON CONFLICT (id) DO NOTHING;
END $$;

-- =============================================================================
-- v3.5 — Owner-portal access grants (skipped if app_users_owners not present)
-- =============================================================================
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'app_users_owners') THEN
    RAISE NOTICE 'app_users_owners not present — skipping v3.5 grant seed.';
    RETURN;
  END IF;

  -- If a Supabase auth user has been linked via /setup/admin-bootstrap,
  -- we'll have at least one app_users row. We don't seed an explicit grant
  -- because matching is environment-specific. The block below is a documented
  -- example operators can adapt:
  --
  --   INSERT INTO app_users_owners (app_user_id, owner_id, grant_type)
  --   VALUES (
  --     (SELECT id FROM app_users WHERE email = 'emma.demo@arconique.com' LIMIT 1),
  --     '1eda0003-0000-0000-0000-000000000001'::uuid,
  --     'owner_portal'
  --   )
  --   ON CONFLICT DO NOTHING;
END $$;

-- =============================================================================
-- v4 — Operations Runtime seed
-- Skipped if migration 0005 hasn't been applied yet.
-- =============================================================================
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'operation_tasks') THEN
    RAISE NOTICE 'operation_tasks not present — skipping v4 operations seed.';
    RETURN;
  END IF;

  -- Operation task types
  INSERT INTO operation_task_types (id, key, name, category, description, default_priority, default_sla_minutes, is_system) VALUES
    ('1eda0a00-0000-0000-0000-000000000001', 'turnover_clean', 'Turnover cleaning', 'housekeeping', 'Standard checkout cleaning between guests.', 'high', 180, true),
    ('1eda0a00-0000-0000-0000-000000000002', 'deep_clean', 'Deep cleaning', 'housekeeping', 'Quarterly deep clean — appliances, grout, soft furnishings.', 'normal', 360, true),
    ('1eda0a00-0000-0000-0000-000000000003', 'arrival_inspection', 'Arrival inspection', 'inspection', 'Pre-check-in walkthrough.', 'high', 30, true),
    ('1eda0a00-0000-0000-0000-000000000004', 'common_area_inspection', 'Common-area inspection', 'inspection', 'Weekly check on shared facilities.', 'normal', 60, true),
    ('1eda0a00-0000-0000-0000-000000000005', 'pool_check', 'Pool service', 'maintenance', 'Daily pool chemistry + skim.', 'normal', 30, true),
    ('1eda0a00-0000-0000-0000-000000000006', 'ac_inspection', 'AC inspection', 'maintenance', 'Bi-annual filter + coil clean.', 'normal', 90, true),
    ('1eda0a00-0000-0000-0000-000000000007', 'guest_request', 'Guest request', 'guest_request', 'Concierge-routed guest request.', 'normal', 60, true)
  ON CONFLICT (key) DO NOTHING;

  -- Checklist templates
  INSERT INTO checklist_templates (id, key, name, category, description, is_system) VALUES
    ('1eda0a01-0000-0000-0000-000000000001', 'tpl_checkout_clean', 'Checkout cleaning', 'checkout_cleaning',
     'Standard turnover cleaning checklist used between guest stays.', true),
    ('1eda0a01-0000-0000-0000-000000000002', 'tpl_arrival_inspection', 'Arrival inspection', 'arrival_inspection',
     'Pre-check-in supervisor walkthrough.', true),
    ('1eda0a01-0000-0000-0000-000000000003', 'tpl_weekly_common', 'Weekly common-area inspection', 'weekly_common_area',
     'Pool, lobby, paths, signage.', true),
    ('1eda0a01-0000-0000-0000-000000000004', 'tpl_pool_check', 'Pool check', 'pool_check',
     'Daily pool chemistry + skim.', true),
    ('1eda0a01-0000-0000-0000-000000000005', 'tpl_ac_inspection', 'AC maintenance inspection', 'maintenance_inspection',
     'Quarterly AC unit inspection.', true)
  ON CONFLICT (key) DO NOTHING;

  -- Checkout cleaning items
  INSERT INTO checklist_template_items (id, template_id, section, label, item_type, is_required, sort_order) VALUES
    ('1eda0a02-0000-0000-0000-000000000001', '1eda0a01-0000-0000-0000-000000000001', 'Bedrooms', 'Strip and remake all beds with fresh linens', 'checkbox', true, 10),
    ('1eda0a02-0000-0000-0000-000000000002', '1eda0a01-0000-0000-0000-000000000001', 'Bedrooms', 'Vacuum floors and rugs',                          'checkbox', true, 20),
    ('1eda0a02-0000-0000-0000-000000000003', '1eda0a01-0000-0000-0000-000000000001', 'Bedrooms', 'Photo of made bed',                               'photo_required', true, 30),
    ('1eda0a02-0000-0000-0000-000000000010', '1eda0a01-0000-0000-0000-000000000001', 'Bathrooms', 'Sanitise all bathroom surfaces',                 'checkbox', true, 40),
    ('1eda0a02-0000-0000-0000-000000000011', '1eda0a01-0000-0000-0000-000000000001', 'Bathrooms', 'Replace towels with fresh set',                 'checkbox', true, 50),
    ('1eda0a02-0000-0000-0000-000000000012', '1eda0a01-0000-0000-0000-000000000001', 'Bathrooms', 'Restock toiletries (shampoo, soap, paper)',     'checkbox', true, 60),
    ('1eda0a02-0000-0000-0000-000000000020', '1eda0a01-0000-0000-0000-000000000001', 'Kitchen',  'Clean stovetop, oven, microwave',                'checkbox', true, 70),
    ('1eda0a02-0000-0000-0000-000000000021', '1eda0a01-0000-0000-0000-000000000001', 'Kitchen',  'Empty fridge, wipe interior',                    'checkbox', true, 80),
    ('1eda0a02-0000-0000-0000-000000000022', '1eda0a01-0000-0000-0000-000000000001', 'Kitchen',  'Restock welcome amenities',                      'checkbox', false, 90),
    ('1eda0a02-0000-0000-0000-000000000030', '1eda0a01-0000-0000-0000-000000000001', 'Pool',     'Skim debris and check water clarity',            'pass_fail', true, 100),
    ('1eda0a02-0000-0000-0000-000000000031', '1eda0a01-0000-0000-0000-000000000001', 'Pool',     'Photo of pool deck',                             'photo_required', true, 110),
    ('1eda0a02-0000-0000-0000-000000000040', '1eda0a01-0000-0000-0000-000000000001', 'Closing', 'Reset thermostat to 24°C',                        'checkbox', true, 120),
    ('1eda0a02-0000-0000-0000-000000000041', '1eda0a01-0000-0000-0000-000000000001', 'Closing', 'Lock all doors and arm alarm',                    'checkbox', true, 130)
  ON CONFLICT (id) DO NOTHING;

  -- Arrival inspection items
  INSERT INTO checklist_template_items (id, template_id, section, label, item_type, is_required, sort_order) VALUES
    ('1eda0a02-0000-0000-0000-000000000201', '1eda0a01-0000-0000-0000-000000000002', 'Walkthrough', 'All lights operational',          'pass_fail', true, 10),
    ('1eda0a02-0000-0000-0000-000000000202', '1eda0a01-0000-0000-0000-000000000002', 'Walkthrough', 'AC reaching set temp',            'pass_fail', true, 20),
    ('1eda0a02-0000-0000-0000-000000000203', '1eda0a01-0000-0000-0000-000000000002', 'Walkthrough', 'Wi-Fi connected and reachable',   'pass_fail', true, 30),
    ('1eda0a02-0000-0000-0000-000000000204', '1eda0a01-0000-0000-0000-000000000002', 'Amenities',   'Welcome basket placed',           'photo_required', true, 40),
    ('1eda0a02-0000-0000-0000-000000000205', '1eda0a01-0000-0000-0000-000000000002', 'Amenities',   'Fresh flowers at entrance',       'checkbox', false, 50)
  ON CONFLICT (id) DO NOTHING;

  -- Pool check items
  INSERT INTO checklist_template_items (id, template_id, section, label, item_type, is_required, sort_order) VALUES
    ('1eda0a02-0000-0000-0000-000000000301', '1eda0a01-0000-0000-0000-000000000004', 'Chemistry', 'pH within 7.2–7.6', 'number', true, 10),
    ('1eda0a02-0000-0000-0000-000000000302', '1eda0a01-0000-0000-0000-000000000004', 'Chemistry', 'Free chlorine ppm', 'number', true, 20),
    ('1eda0a02-0000-0000-0000-000000000303', '1eda0a01-0000-0000-0000-000000000004', 'Cleaning', 'Skim leaves & debris', 'checkbox', true, 30),
    ('1eda0a02-0000-0000-0000-000000000304', '1eda0a01-0000-0000-0000-000000000004', 'Cleaning', 'Brush walls & vacuum', 'checkbox', false, 40)
  ON CONFLICT (id) DO NOTHING;

  -- Weekly common area
  INSERT INTO checklist_template_items (id, template_id, section, label, item_type, is_required, sort_order) VALUES
    ('1eda0a02-0000-0000-0000-000000000401', '1eda0a01-0000-0000-0000-000000000003', 'Lobby & paths', 'Sweep and mop lobby',    'checkbox', true, 10),
    ('1eda0a02-0000-0000-0000-000000000402', '1eda0a01-0000-0000-0000-000000000003', 'Lobby & paths', 'Inspect signage condition', 'pass_fail', true, 20),
    ('1eda0a02-0000-0000-0000-000000000403', '1eda0a01-0000-0000-0000-000000000003', 'Pool deck',     'Pool deck swept',         'checkbox', true, 30),
    ('1eda0a02-0000-0000-0000-000000000404', '1eda0a01-0000-0000-0000-000000000003', 'Garden',        'Garden free of debris',   'checkbox', true, 40)
  ON CONFLICT (id) DO NOTHING;

  -- AC inspection
  INSERT INTO checklist_template_items (id, template_id, section, label, item_type, is_required, sort_order) VALUES
    ('1eda0a02-0000-0000-0000-000000000501', '1eda0a01-0000-0000-0000-000000000005', 'Filters', 'Filters cleaned or replaced', 'checkbox', true, 10),
    ('1eda0a02-0000-0000-0000-000000000502', '1eda0a01-0000-0000-0000-000000000005', 'Coils',   'Coils cleaned',                'checkbox', true, 20),
    ('1eda0a02-0000-0000-0000-000000000503', '1eda0a01-0000-0000-0000-000000000005', 'Test',    'Cooling output measured',      'number',   true, 30)
  ON CONFLICT (id) DO NOTHING;

  -- Operation tasks (mix of categories, status, priorities)
  INSERT INTO operation_tasks (id, task_code, task_type_id, villa_id, project_id, title, description, category, priority, status, source, scheduled_for, due_at, owner_visible, guest_visible) VALUES
    ('1eda0b00-0000-0000-0000-000000000001', 'OPS-20260425-0001', '1eda0a00-0000-0000-0000-000000000001',
     '1eda0002-0000-0000-0000-000000000002', '1eda0001-0000-0000-0000-000000000001',
     'Turnover · Eternal S2', 'Standard checkout cleaning before next arrival.',
     'housekeeping', 'high', 'in_progress', 'manual', CURRENT_DATE, CURRENT_DATE + INTERVAL '4 hours', false, false),
    ('1eda0b00-0000-0000-0000-000000000002', 'OPS-20260425-0002', '1eda0a00-0000-0000-0000-000000000003',
     '1eda0002-0000-0000-0000-000000000003', '1eda0001-0000-0000-0000-000000000001',
     'Arrival inspection · Eternal S5', 'Walkthrough before guest check-in tomorrow.',
     'inspection', 'normal', 'scheduled', 'manual', CURRENT_DATE, NULL, false, false),
    ('1eda0b00-0000-0000-0000-000000000003', 'OPS-20260425-0003', '1eda0a00-0000-0000-0000-000000000001',
     '1eda0002-0000-0000-0000-000000000021', '1eda0001-0000-0000-0000-000000000003',
     'Turnover · Ahau 02', 'Checkout cleaning queued for afternoon.',
     'housekeeping', 'normal', 'open', 'manual', CURRENT_DATE, NULL, false, false),
    ('1eda0b00-0000-0000-0000-000000000004', 'OPS-20260425-0004', '1eda0a00-0000-0000-0000-000000000005',
     '1eda0002-0000-0000-0000-000000000011', '1eda0001-0000-0000-0000-000000000002',
     'Pool service · Enso S2', 'Daily pool service.',
     'maintenance', 'normal', 'open', 'preventive', CURRENT_DATE, NULL, false, false),
    ('1eda0b00-0000-0000-0000-000000000005', 'OPS-20260425-0005', '1eda0a00-0000-0000-0000-000000000007',
     '1eda0002-0000-0000-0000-000000000012', '1eda0001-0000-0000-0000-000000000002',
     'Guest request · Late checkout cleaning', 'Guest stayed until 14:00 — re-prep prior to next arrival.',
     'guest_request', 'urgent', 'needs_review', 'guest', CURRENT_DATE, CURRENT_DATE + INTERVAL '2 hours', false, false)
  ON CONFLICT (task_code) DO NOTHING;

  -- Checklists for the in-progress turnover (item-level state varied)
  INSERT INTO task_checklists (id, task_id, template_id, status) VALUES
    ('1eda0b01-0000-0000-0000-000000000001', '1eda0b00-0000-0000-0000-000000000001', '1eda0a01-0000-0000-0000-000000000001', 'in_progress'),
    ('1eda0b01-0000-0000-0000-000000000002', '1eda0b00-0000-0000-0000-000000000005', '1eda0a01-0000-0000-0000-000000000001', 'completed')
  ON CONFLICT (id) DO NOTHING;

  -- Materialise template items into the checklist instances. Use INSERT … SELECT
  -- so the seed reflects whatever items the templates above defined.
  INSERT INTO task_checklist_items (
    id, checklist_id, template_item_id, section, label, item_type, is_required, sort_order, status, photo_required
  )
  SELECT
    md5(c.id::text || ti.id::text)::uuid,
    c.id,
    ti.id,
    ti.section, ti.label, ti.item_type, ti.is_required, ti.sort_order,
    CASE
      WHEN c.status = 'in_progress' AND ti.sort_order <= 30 THEN 'done'
      WHEN c.status = 'completed' THEN 'done'
      ELSE 'pending'
    END,
    (ti.item_type = 'photo_required')
  FROM task_checklists c
  JOIN checklist_template_items ti ON ti.template_id = c.template_id
  WHERE c.id IN (
    '1eda0b01-0000-0000-0000-000000000001'::uuid,
    '1eda0b01-0000-0000-0000-000000000002'::uuid
  )
  ON CONFLICT (id) DO NOTHING;

  -- Maintenance tickets
  INSERT INTO maintenance_tickets (id, ticket_code, villa_id, project_id, title, description, issue_category, severity, status, owner_chargeable, currency, estimated_cost_minor) VALUES
    ('1eda0b02-0000-0000-0000-000000000001', 'MNT-20260425-0001',
     '1eda0002-0000-0000-0000-000000000013', '1eda0001-0000-0000-0000-000000000002',
     'Bedroom 2 AC not cooling', 'Reported by guest yesterday; technician scheduled for tomorrow.',
     'ac', 'p1', 'scheduled', true, 'USD', 18000),
    ('1eda0b02-0000-0000-0000-000000000002', 'MNT-20260425-0002',
     '1eda0002-0000-0000-0000-000000000004', '1eda0001-0000-0000-0000-000000000001',
     'Pool pump intermittent', 'Pump cycling off mid-day — likely thermal cutout. Awaiting parts.',
     'pool', 'p2', 'waiting_parts', true, 'USD', 35000),
    ('1eda0b02-0000-0000-0000-000000000003', 'MNT-20260425-0003',
     '1eda0002-0000-0000-0000-000000000020', '1eda0001-0000-0000-0000-000000000003',
     'Wi-Fi access point offline', 'Lobby AP unresponsive. Power-cycle scheduled.',
     'internet', 'p1', 'open', false, 'USD', NULL)
  ON CONFLICT (ticket_code) DO NOTHING;

  -- Preventive schedules
  INSERT INTO preventive_schedules (id, villa_id, project_id, task_type_id, checklist_template_id, name, category, frequency, next_due_on, priority) VALUES
    ('1eda0b03-0000-0000-0000-000000000001',
     '1eda0002-0000-0000-0000-000000000003', '1eda0001-0000-0000-0000-000000000001',
     '1eda0a00-0000-0000-0000-000000000005', '1eda0a01-0000-0000-0000-000000000004',
     'Pool service · Eternal S5', 'maintenance', 'daily', CURRENT_DATE, 'normal'),
    ('1eda0b03-0000-0000-0000-000000000002',
     '1eda0002-0000-0000-0000-000000000012', '1eda0001-0000-0000-0000-000000000002',
     '1eda0a00-0000-0000-0000-000000000006', '1eda0a01-0000-0000-0000-000000000005',
     'AC inspection · Enso S5', 'maintenance', 'quarterly', CURRENT_DATE + INTERVAL '14 days', 'normal'),
    ('1eda0b03-0000-0000-0000-000000000003',
     NULL, '1eda0001-0000-0000-0000-000000000002',
     '1eda0a00-0000-0000-0000-000000000004', '1eda0a01-0000-0000-0000-000000000003',
     'Common-area inspection · Enso', 'inspection', 'weekly', CURRENT_DATE + INTERVAL '3 days', 'normal'),
    ('1eda0b03-0000-0000-0000-000000000004',
     '1eda0002-0000-0000-0000-000000000021', '1eda0001-0000-0000-0000-000000000003',
     '1eda0a00-0000-0000-0000-000000000002', '1eda0a01-0000-0000-0000-000000000001',
     'Deep clean · Ahau 02', 'housekeeping', 'monthly', CURRENT_DATE + INTERVAL '7 days', 'high')
  ON CONFLICT (id) DO NOTHING;

  -- Service requests
  INSERT INTO service_requests (id, request_code, villa_id, request_type, title, message, status, priority) VALUES
    ('1eda0b04-0000-0000-0000-000000000001', 'SR-20260425-0001',
     '1eda0002-0000-0000-0000-000000000010', 'breakfast',
     'Late breakfast for 4', 'Two adults, two kids — tomorrow at 09:30.', 'new', 'normal'),
    ('1eda0b04-0000-0000-0000-000000000002', 'SR-20260425-0002',
     '1eda0002-0000-0000-0000-000000000003', 'transfer',
     'Airport transfer Sunday 11:00', 'Departure to DPS, party of 5.', 'accepted', 'high'),
    ('1eda0b04-0000-0000-0000-000000000003', 'SR-20260425-0003',
     '1eda0002-0000-0000-0000-000000000020', 'cleaning',
     'Mid-stay tidy-up', 'Quick freshen-up while we are at lunch.', 'new', 'normal')
  ON CONFLICT (request_code) DO NOTHING;

  -- Damage reports
  INSERT INTO damage_reports (id, villa_id, title, description, severity, status, owner_chargeable, guest_chargeable, currency, estimated_cost_minor) VALUES
    ('1eda0b05-0000-0000-0000-000000000001',
     '1eda0002-0000-0000-0000-000000000002',
     'Bedside lamp shade torn', 'Discovered during turnover. Likely accidental.',
     'p3', 'under_review', true, false, 'USD', 4500),
    ('1eda0b05-0000-0000-0000-000000000002',
     '1eda0002-0000-0000-0000-000000000021',
     'Wine stain on living-room rug', 'Spot-treated; deep cleaning quoted.',
     'p2', 'approved', false, true, 'USD', 12500)
  ON CONFLICT (id) DO NOTHING;
END $$;

-- =============================================================================
-- v5 — Inventory, Procurement, Attachments seed
-- Skipped if migration 0006 hasn't been applied yet.
-- =============================================================================
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'inventory_items') THEN
    RAISE NOTICE 'inventory_items not present — skipping v5 inventory seed.';
    RETURN;
  END IF;

  -- Suppliers
  INSERT INTO suppliers (id, name, supplier_type, contact_name, email, country, currency, payment_terms) VALUES
    ('1eda0c00-0000-0000-0000-000000000001', 'Bali Linen Co.',         'linens',     'Made W.',  'orders@balilinen.id',     'Indonesia', 'USD', 'Net 30'),
    ('1eda0c00-0000-0000-0000-000000000002', 'EcoClean Chemicals',      'chemicals',  'Anita P.', 'sales@ecoclean.id',       'Indonesia', 'USD', 'Net 14'),
    ('1eda0c00-0000-0000-0000-000000000003', 'Tropic Electrical Supply','electrical', 'Putu A.',  'support@tropicelec.id',   'Indonesia', 'USD', 'Net 30'),
    ('1eda0c00-0000-0000-0000-000000000004', 'CrystalPool Bali',        'chemicals',  'Wayan B.', 'orders@crystalpool.id',   'Indonesia', 'USD', 'Net 30'),
    ('1eda0c00-0000-0000-0000-000000000005', 'Ubud Maintenance Group',  'maintenance','Komang R.','jobs@ubudmaint.id',       'Indonesia', 'USD', 'Net 14')
  ON CONFLICT (id) DO NOTHING;

  -- Categories
  INSERT INTO inventory_categories (id, key, name, default_unit, is_consumable) VALUES
    ('1eda0c01-0000-0000-0000-000000000001', 'linens',           'Linens',            'pcs', true),
    ('1eda0c01-0000-0000-0000-000000000002', 'towels',           'Towels',            'pcs', true),
    ('1eda0c01-0000-0000-0000-000000000003', 'toiletries',       'Toiletries',        'pcs', true),
    ('1eda0c01-0000-0000-0000-000000000004', 'cleaning_chems',   'Cleaning chemicals','L',   true),
    ('1eda0c01-0000-0000-0000-000000000005', 'pool_chems',       'Pool chemicals',    'kg',  true),
    ('1eda0c01-0000-0000-0000-000000000006', 'spare_parts',      'Spare parts',       'pcs', false),
    ('1eda0c01-0000-0000-0000-000000000007', 'electrical',       'Electrical',        'pcs', false),
    ('1eda0c01-0000-0000-0000-000000000008', 'kitchen_supplies', 'Kitchen supplies',  'pcs', true),
    ('1eda0c01-0000-0000-0000-000000000009', 'ffe',              'Furniture / FF&E',  'pcs', false)
  ON CONFLICT (key) DO NOTHING;

  -- Items
  INSERT INTO inventory_items (id, sku, name, category_id, default_supplier_id, unit, item_type, brand, reorder_point, reorder_quantity, unit_cost_minor, currency, owner_chargeable) VALUES
    ('1eda0c02-0000-0000-0000-000000000001', 'TWL-BATH-WH-L',  'Bath towel · white · large',     '1eda0c01-0000-0000-0000-000000000002', '1eda0c00-0000-0000-0000-000000000001', 'pcs', 'towel',     'Premium Cotton', 24, 48,   850, 'USD', true),
    ('1eda0c02-0000-0000-0000-000000000002', 'TWL-HAND-WH',    'Hand towel · white',              '1eda0c01-0000-0000-0000-000000000002', '1eda0c00-0000-0000-0000-000000000001', 'pcs', 'towel',     'Premium Cotton', 36, 60,   320, 'USD', true),
    ('1eda0c02-0000-0000-0000-000000000003', 'LIN-BED-K',      'Bed sheet · king',                '1eda0c01-0000-0000-0000-000000000001', '1eda0c00-0000-0000-0000-000000000001', 'pcs', 'linen',     'Sateen 400TC',   12, 24,  1850, 'USD', true),
    ('1eda0c02-0000-0000-0000-000000000004', 'LIN-PILL',       'Pillowcase',                       '1eda0c01-0000-0000-0000-000000000001', '1eda0c00-0000-0000-0000-000000000001', 'pcs', 'linen',     'Sateen 400TC',   24, 48,   450, 'USD', true),
    ('1eda0c02-0000-0000-0000-000000000005', 'AMN-SHAMPOO',    'Shampoo bottle · 30ml',           '1eda0c01-0000-0000-0000-000000000003', '1eda0c00-0000-0000-0000-000000000001', 'pcs', 'amenity',   'Arconique',      48, 96,   180, 'USD', true),
    ('1eda0c02-0000-0000-0000-000000000006', 'AMN-BODYWASH',   'Body wash bottle · 30ml',         '1eda0c01-0000-0000-0000-000000000003', '1eda0c00-0000-0000-0000-000000000001', 'pcs', 'amenity',   'Arconique',      48, 96,   180, 'USD', true),
    ('1eda0c02-0000-0000-0000-000000000007', 'AMN-TP',         'Toilet paper roll',               '1eda0c01-0000-0000-0000-000000000003', '1eda0c00-0000-0000-0000-000000000002', 'pcs', 'amenity',   NULL,             24, 48,   120, 'USD', true),
    ('1eda0c02-0000-0000-0000-000000000008', 'CHEM-POOL-CL',   'Pool chlorine granules (5kg)',    '1eda0c01-0000-0000-0000-000000000005', '1eda0c00-0000-0000-0000-000000000004', 'kg',  'chemical',  'CrystalPool',     5, 10,  3500, 'USD', true),
    ('1eda0c02-0000-0000-0000-000000000009', 'SP-AC-FILTER',   'AC filter · standard',            '1eda0c01-0000-0000-0000-000000000006', '1eda0c00-0000-0000-0000-000000000005', 'pcs', 'spare_part','OEM',             4,  8,  1500, 'USD', false),
    ('1eda0c02-0000-0000-0000-00000000000a', 'EL-LED-DRV',     'LED driver · 24V/60W',            '1eda0c01-0000-0000-0000-000000000007', '1eda0c00-0000-0000-0000-000000000003', 'pcs', 'spare_part','Tropic',          2,  6,  2400, 'USD', false),
    ('1eda0c02-0000-0000-0000-00000000000b', 'EL-SW-SPARE',    'Smart switch · spare',            '1eda0c01-0000-0000-0000-000000000007', '1eda0c00-0000-0000-0000-000000000003', 'pcs', 'spare_part','Sonoff',          3,  6,  1850, 'USD', false),
    ('1eda0c02-0000-0000-0000-00000000000c', 'SP-LOCK-BAT',    'Door lock battery · CR123',       '1eda0c01-0000-0000-0000-000000000006', '1eda0c00-0000-0000-0000-000000000005', 'pcs', 'spare_part','Generic',         8, 16,    220, 'USD', false),
    ('1eda0c02-0000-0000-0000-00000000000d', 'SP-MICRO-KIT',   'Microcement repair kit',          '1eda0c01-0000-0000-0000-000000000006', '1eda0c00-0000-0000-0000-000000000005', 'pcs', 'spare_part','OEM',             2,  4,  4500, 'USD', false),
    ('1eda0c02-0000-0000-0000-00000000000e', 'TOOL-BASIC',     'Basic tool kit (case)',           '1eda0c01-0000-0000-0000-000000000006', '1eda0c00-0000-0000-0000-000000000005', 'pcs', 'tool',      'OEM',             1,  2, 12500, 'USD', false)
  ON CONFLICT (id) DO NOTHING;

  -- Locations (linked to existing villas / project)
  INSERT INTO inventory_locations (id, project_id, villa_id, name, location_type, description) VALUES
    ('1eda0c03-0000-0000-0000-000000000001', '1eda0001-0000-0000-0000-000000000001', NULL,
     'Eternal Main Storage', 'warehouse',     'Central warehouse for Eternal villas.'),
    ('1eda0c03-0000-0000-0000-000000000002', NULL, '1eda0002-0000-0000-0000-000000000001',
     'Eternal S1 Storage', 'villa_storage',   'In-villa pantry / linen closet.'),
    ('1eda0c03-0000-0000-0000-000000000003', NULL, '1eda0002-0000-0000-0000-000000000003',
     'Eternal S5 Storage', 'villa_storage',   'In-villa pantry / linen closet.'),
    ('1eda0c03-0000-0000-0000-000000000004', '1eda0001-0000-0000-0000-000000000002', NULL,
     'Housekeeping Cart 1', 'housekeeping_cart', 'Mobile cart for daily turnovers.'),
    ('1eda0c03-0000-0000-0000-000000000005', '1eda0001-0000-0000-0000-000000000001', NULL,
     'Maintenance Room', 'maintenance_room',   'Spare parts + tools for technicians.')
  ON CONFLICT (id) DO NOTHING;

  -- Stock levels — realistic mix; some near or under reorder point.
  INSERT INTO inventory_stock_levels (id, item_id, location_id, quantity) VALUES
    -- Eternal Main Storage
    ('1eda0c04-0000-0000-0000-000000000001', '1eda0c02-0000-0000-0000-000000000001', '1eda0c03-0000-0000-0000-000000000001',  60),
    ('1eda0c04-0000-0000-0000-000000000002', '1eda0c02-0000-0000-0000-000000000002', '1eda0c03-0000-0000-0000-000000000001',  90),
    ('1eda0c04-0000-0000-0000-000000000003', '1eda0c02-0000-0000-0000-000000000003', '1eda0c03-0000-0000-0000-000000000001',  30),
    ('1eda0c04-0000-0000-0000-000000000004', '1eda0c02-0000-0000-0000-000000000004', '1eda0c03-0000-0000-0000-000000000001',  60),
    ('1eda0c04-0000-0000-0000-000000000005', '1eda0c02-0000-0000-0000-000000000005', '1eda0c03-0000-0000-0000-000000000001', 120),
    ('1eda0c04-0000-0000-0000-000000000006', '1eda0c02-0000-0000-0000-000000000006', '1eda0c03-0000-0000-0000-000000000001', 110),
    ('1eda0c04-0000-0000-0000-000000000007', '1eda0c02-0000-0000-0000-000000000007', '1eda0c03-0000-0000-0000-000000000001',  50),
    ('1eda0c04-0000-0000-0000-000000000008', '1eda0c02-0000-0000-0000-000000000008', '1eda0c03-0000-0000-0000-000000000001',   3),  -- LOW
    ('1eda0c04-0000-0000-0000-000000000009', '1eda0c02-0000-0000-0000-000000000009', '1eda0c03-0000-0000-0000-000000000005',   2),  -- LOW (in maint room)
    ('1eda0c04-0000-0000-0000-00000000000a', '1eda0c02-0000-0000-0000-00000000000a', '1eda0c03-0000-0000-0000-000000000005',   1),  -- LOW
    ('1eda0c04-0000-0000-0000-00000000000b', '1eda0c02-0000-0000-0000-00000000000b', '1eda0c03-0000-0000-0000-000000000005',   4),
    ('1eda0c04-0000-0000-0000-00000000000c', '1eda0c02-0000-0000-0000-00000000000c', '1eda0c03-0000-0000-0000-000000000005',  16),
    ('1eda0c04-0000-0000-0000-00000000000d', '1eda0c02-0000-0000-0000-00000000000d', '1eda0c03-0000-0000-0000-000000000005',   2),
    ('1eda0c04-0000-0000-0000-00000000000e', '1eda0c02-0000-0000-0000-00000000000e', '1eda0c03-0000-0000-0000-000000000005',   2),
    -- Eternal S1 Storage (in-villa)
    ('1eda0c04-0000-0000-0000-000000000101', '1eda0c02-0000-0000-0000-000000000001', '1eda0c03-0000-0000-0000-000000000002',  12),
    ('1eda0c04-0000-0000-0000-000000000102', '1eda0c02-0000-0000-0000-000000000005', '1eda0c03-0000-0000-0000-000000000002',  16),
    ('1eda0c04-0000-0000-0000-000000000103', '1eda0c02-0000-0000-0000-000000000007', '1eda0c03-0000-0000-0000-000000000002',  10),
    -- Housekeeping Cart 1
    ('1eda0c04-0000-0000-0000-000000000201', '1eda0c02-0000-0000-0000-000000000005', '1eda0c03-0000-0000-0000-000000000004',  20),
    ('1eda0c04-0000-0000-0000-000000000202', '1eda0c02-0000-0000-0000-000000000007', '1eda0c03-0000-0000-0000-000000000004',  18)
  ON CONFLICT (id) DO NOTHING;

  -- A receive movement + a write-off + a consume tied to an existing seeded task.
  INSERT INTO inventory_movements (id, movement_code, item_id, from_location_id, to_location_id, quantity, movement_type, reason, created_at) VALUES
    ('1eda0c05-0000-0000-0000-000000000001', 'MV-20260420-0001',
     '1eda0c02-0000-0000-0000-000000000001', NULL, '1eda0c03-0000-0000-0000-000000000001', 60, 'receive',
     'Initial stock for towels', now() - interval '5 days'),
    ('1eda0c05-0000-0000-0000-000000000002', 'MV-20260423-0001',
     '1eda0c02-0000-0000-0000-000000000001', '1eda0c03-0000-0000-0000-000000000001', NULL, 2, 'write_off',
     'Towels stained beyond cleaning — write-off after turnover', now() - interval '2 days')
  ON CONFLICT (movement_code) DO NOTHING;

  -- Material usage tied to seeded operations task (turnover · Eternal S2).
  INSERT INTO inventory_movements (id, movement_code, item_id, from_location_id, to_location_id, quantity, movement_type, task_id, reason, created_at) VALUES
    ('1eda0c05-0000-0000-0000-000000000003', 'MV-20260425-0001',
     '1eda0c02-0000-0000-0000-000000000005', '1eda0c03-0000-0000-0000-000000000004', NULL, 4, 'consume',
     '1eda0b00-0000-0000-0000-000000000001',
     'Bath amenities placed in EV-S2 turnover', now())
  ON CONFLICT (movement_code) DO NOTHING;

  INSERT INTO task_material_usage (id, task_id, item_id, location_id, quantity, movement_id, notes) VALUES
    ('1eda0c06-0000-0000-0000-000000000001',
     '1eda0b00-0000-0000-0000-000000000001',
     '1eda0c02-0000-0000-0000-000000000005',
     '1eda0c03-0000-0000-0000-000000000004',
     4,
     '1eda0c05-0000-0000-0000-000000000003',
     'Bath amenities placed in EV-S2 turnover')
  ON CONFLICT (id) DO NOTHING;

  -- Procurement: draft + submitted + approved request, plus partially-received PO.
  INSERT INTO purchase_requests (id, request_code, project_id, requested_by, supplier_id, title, description, priority, status, required_by, currency, total_estimated_minor) VALUES
    ('1eda0c07-0000-0000-0000-000000000001', 'PR-20260425-0001',
     '1eda0001-0000-0000-0000-000000000001', NULL, '1eda0c00-0000-0000-0000-000000000001',
     'Linen replenishment · Eternal', 'Restocking towels and bed sheets ahead of high-season turnovers.',
     'normal', 'draft',     CURRENT_DATE + INTERVAL '14 days', 'USD', 220000),
    ('1eda0c07-0000-0000-0000-000000000002', 'PR-20260425-0002',
     '1eda0001-0000-0000-0000-000000000002', NULL, '1eda0c00-0000-0000-0000-000000000004',
     'Pool chemicals · Q2',          'Chlorine + pH stabiliser for Q2 — Enso pool service runs daily.',
     'high',   'submitted', CURRENT_DATE + INTERVAL '7 days',  'USD', 145000),
    ('1eda0c07-0000-0000-0000-000000000003', 'PR-20260425-0003',
     '1eda0001-0000-0000-0000-000000000001', NULL, '1eda0c00-0000-0000-0000-000000000005',
     'AC filters + door batteries',  'Routine spares before low-season slowdown.',
     'normal', 'approved',  CURRENT_DATE + INTERVAL '10 days', 'USD',  85000)
  ON CONFLICT (request_code) DO NOTHING;

  INSERT INTO purchase_request_lines (id, request_id, item_id, description, quantity, unit, estimated_unit_cost_minor, currency) VALUES
    ('1eda0c08-0000-0000-0000-000000000101', '1eda0c07-0000-0000-0000-000000000001',
     '1eda0c02-0000-0000-0000-000000000001', 'Bath towel · white · large', 48, 'pcs',  850, 'USD'),
    ('1eda0c08-0000-0000-0000-000000000102', '1eda0c07-0000-0000-0000-000000000001',
     '1eda0c02-0000-0000-0000-000000000003', 'Bed sheet · king',           24, 'pcs', 1850, 'USD'),
    ('1eda0c08-0000-0000-0000-000000000201', '1eda0c07-0000-0000-0000-000000000002',
     '1eda0c02-0000-0000-0000-000000000008', 'Pool chlorine granules (5kg)', 10, 'kg', 3500, 'USD'),
    ('1eda0c08-0000-0000-0000-000000000301', '1eda0c07-0000-0000-0000-000000000003',
     '1eda0c02-0000-0000-0000-000000000009', 'AC filter · standard',         8, 'pcs', 1500, 'USD'),
    ('1eda0c08-0000-0000-0000-000000000302', '1eda0c07-0000-0000-0000-000000000003',
     '1eda0c02-0000-0000-0000-00000000000c', 'Door lock battery · CR123',   16, 'pcs',  220, 'USD')
  ON CONFLICT (id) DO NOTHING;

  -- A purchase order that's already partially received (one line received, one still outstanding).
  INSERT INTO purchase_orders (id, po_code, request_id, supplier_id, project_id, status, ordered_at, expected_delivery, currency, total_minor, notes) VALUES
    ('1eda0c09-0000-0000-0000-000000000001', 'PO-20260420-0001',
     NULL, '1eda0c00-0000-0000-0000-000000000001', '1eda0001-0000-0000-0000-000000000001',
     'partially_received', now() - interval '4 days', CURRENT_DATE + INTERVAL '3 days', 'USD', 95000,
     'Partial: bath towels arrived, hand towels backordered.')
  ON CONFLICT (po_code) DO NOTHING;

  INSERT INTO purchase_order_lines (id, purchase_order_id, item_id, description, quantity_ordered, quantity_received, unit, unit_cost_minor, currency) VALUES
    ('1eda0c0a-0000-0000-0000-000000000001', '1eda0c09-0000-0000-0000-000000000001',
     '1eda0c02-0000-0000-0000-000000000001', 'Bath towel · white · large', 60, 60, 'pcs',  850, 'USD'),
    ('1eda0c0a-0000-0000-0000-000000000002', '1eda0c09-0000-0000-0000-000000000001',
     '1eda0c02-0000-0000-0000-000000000002', 'Hand towel · white',        80,  0, 'pcs',  320, 'USD')
  ON CONFLICT (id) DO NOTHING;
END $$;

-- =============================================================================
-- v6 — Booking channels calendar sync, automation rules, conflict sample
-- Skipped if migration 0007 hasn't been applied yet.
-- =============================================================================
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'channel_calendar_feeds') THEN
    RAISE NOTICE 'channel_calendar_feeds not present — skipping v6 seed.';
    RETURN;
  END IF;

  -- Sample calendar feeds (URLs are illustrative — never actually fetched at seed time).
  INSERT INTO channel_calendar_feeds (id, villa_id, project_id, booking_channel_id, feed_name, feed_url, feed_type, status) VALUES
    ('1eda0d00-0000-0000-0000-000000000001',
     '1eda0002-0000-0000-0000-000000000003', '1eda0001-0000-0000-0000-000000000001',
     (SELECT id FROM booking_channels WHERE key = 'airbnb' LIMIT 1),
     'Airbnb · EV-S5',
     'https://example.com/airbnb-ical/EV-S5.ics?token=demo-only',
     'airbnb_ical', 'active'),
    ('1eda0d00-0000-0000-0000-000000000002',
     '1eda0002-0000-0000-0000-000000000012', '1eda0001-0000-0000-0000-000000000002',
     (SELECT id FROM booking_channels WHERE key = 'booking' LIMIT 1),
     'Booking.com · ES-S5',
     'https://example.com/booking-ical/ES-S5.ics?token=demo-only',
     'booking_ical', 'paused'),
    ('1eda0d00-0000-0000-0000-000000000003',
     '1eda0002-0000-0000-0000-000000000021', '1eda0001-0000-0000-0000-000000000003',
     (SELECT id FROM booking_channels WHERE key = 'airbnb' LIMIT 1),
     'Airbnb · AH-02',
     'https://example.com/airbnb-ical/AH-02.ics?token=demo-only',
     'airbnb_ical', 'active')
  ON CONFLICT (id) DO NOTHING;

  -- A pending unmaterialised event so the integrations UI has data to show.
  INSERT INTO channel_calendar_events (id, feed_id, external_uid, external_summary, check_in, check_out, status, conflict_status) VALUES
    ('1eda0d01-0000-0000-0000-000000000001',
     '1eda0d00-0000-0000-0000-000000000001',
     'airbnb-demo-uid-001@airbnb.com',
     'Reserved (Airbnb)',
     CURRENT_DATE + INTERVAL '12 days',
     CURRENT_DATE + INTERVAL '17 days',
     'active', 'none'),
    ('1eda0d01-0000-0000-0000-000000000002',
     '1eda0d00-0000-0000-0000-000000000003',
     'airbnb-demo-uid-002@airbnb.com',
     'Reserved (Airbnb)',
     CURRENT_DATE + INTERVAL '4 days',
     CURRENT_DATE + INTERVAL '7 days',
     'active', 'overlap')
  ON CONFLICT (feed_id, external_uid) DO NOTHING;

  -- One open conflict on a villa that already has a manual booking.
  INSERT INTO booking_conflicts (id, villa_id, calendar_event_id, conflict_type, severity, description, status) VALUES
    ('1eda0d02-0000-0000-0000-000000000001',
     '1eda0002-0000-0000-0000-000000000021',
     '1eda0d01-0000-0000-0000-000000000002',
     'overlap', 'warning',
     'Calendar event overlaps existing manual booking on AH-02. Operations should reconcile the channel calendar before check-in.',
     'open')
  ON CONFLICT (id) DO NOTHING;

  -- Default booking automation rules (also seeded by the
  -- `createDefaultBookingAutomationRulesIfMissing` helper, but we add them
  -- here too so the dashboard has data on first load).
  INSERT INTO booking_automation_rules
    (id, rule_name, trigger_event, task_category, task_type_key, checklist_template_key, title_template, due_offset_minutes, priority, status)
  VALUES
    ('1eda0d03-0000-0000-0000-000000000001',
     'Checkout cleaning', 'booking_created', 'housekeeping',
     'turnover_clean', 'tpl_checkout_clean',
     'Checkout cleaning · {villa} · {checkout_date}', 60, 'normal', 'active'),
    ('1eda0d03-0000-0000-0000-000000000002',
     'Arrival inspection', 'booking_created', 'inspection',
     'arrival_inspection', 'tpl_arrival_inspection',
     'Arrival inspection · {villa} · {checkin_date}', -180, 'high', 'active')
  ON CONFLICT (id) DO NOTHING;
END $$;

-- =============================================================================
-- v7 — Background jobs + notification queue
-- Skipped if migration 0008 hasn't been applied yet.
-- =============================================================================
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'job_definitions') THEN
    RAISE NOTICE 'job_definitions not present — skipping v7 seed.';
    RETURN;
  END IF;

  -- Default job catalog. Mirrors features/jobs/definitions.ts so the
  -- dashboard has data on first boot even before the operator clicks
  -- "Seed default jobs".
  INSERT INTO job_definitions (id, key, name, description, job_type, schedule_cron, enabled, timeout_seconds, max_retries, config) VALUES
    ('1eda0e00-0000-0000-0000-000000000001',
     'calendar_sync_active_feeds',
     'Calendar sync — active feeds',
     'Walks every active channel_calendar_feeds row and re-fetches the iCal source. Honours sync_interval_minutes per feed.',
     'calendar_sync', '*/30 * * * *', true, 300, 1,
     '{"respectFeedInterval": true}'::jsonb),
    ('1eda0e00-0000-0000-0000-000000000002',
     'generate_preventive_tasks',
     'Generate preventive tasks',
     'Materialises tasks for every preventive_schedule whose next_due_on is today or earlier.',
     'preventive_tasks', '0 5 * * *', true, 120, 1, NULL),
    ('1eda0e00-0000-0000-0000-000000000003',
     'bridge_pending_material_usage',
     'Bridge pending material usage to finance',
     'Walks pending task_material_usage rows and creates expense_lines where chargeable. Respects locked statement periods.',
     'finance_bridge', '0 */3 * * *', true, 180, 1, NULL),
    ('1eda0e00-0000-0000-0000-000000000004',
     'scan_low_stock',
     'Scan for low-stock items',
     'Lists items below their reorder_point and queues a daily low_stock_alert notification (deduped per day).',
     'low_stock_scan', '0 7 * * *', true, 60, 1, NULL),
    ('1eda0e00-0000-0000-0000-000000000005',
     'notification_digest_internal',
     'Internal notification digest',
     'Aggregates queued notifications into a daily internal-staff summary. Disabled until v8 ships providers.',
     'notification_digest', '0 8 * * *', false, 60, 0, NULL)
  ON CONFLICT (key) DO NOTHING;

  -- Sample successful run for the calendar sync, so /dashboard/jobs has data.
  INSERT INTO job_runs (id, job_definition_id, job_key, trigger_type, status, started_at, finished_at, duration_ms, attempted, result_summary, metrics) VALUES
    ('1eda0e01-0000-0000-0000-000000000001',
     '1eda0e00-0000-0000-0000-000000000001',
     'calendar_sync_active_feeds',
     'cron', 'success',
     now() - interval '30 minutes',
     now() - interval '30 minutes' + interval '4 seconds',
     4123, 1,
     'Checked 3 · synced 2 · skipped 1 · failed 0',
     '{"feedsChecked": 3, "feedsSynced": 2, "feedsSkipped": 1, "feedsFailed": 0, "eventsUpserted": 4, "conflictsCreated": 0}'::jsonb),
    ('1eda0e01-0000-0000-0000-000000000002',
     '1eda0e00-0000-0000-0000-000000000002',
     'generate_preventive_tasks',
     'cron', 'success',
     now() - interval '1 day',
     now() - interval '1 day' + interval '2 seconds',
     2210, 1,
     'Checked 4 · created 1 · skipped 3 · errors 0',
     '{"schedulesChecked": 4, "tasksCreated": 1, "checklistsAttached": 1, "skipped": 3, "errors": 0}'::jsonb),
    ('1eda0e01-0000-0000-0000-000000000003',
     '1eda0e00-0000-0000-0000-000000000004',
     'scan_low_stock',
     'cron', 'success',
     now() - interval '6 hours',
     now() - interval '6 hours' + interval '1 second',
     980, 1,
     'Found 3 low-stock item(s); queued 2, deduped 0',
     '{"lowStockCount": 3, "notificationsQueued": 2, "deduped": 0, "critical": 1}'::jsonb)
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO job_run_events (id, job_run_id, level, message) VALUES
    ('1eda0e02-0000-0000-0000-000000000001', '1eda0e01-0000-0000-0000-000000000001', 'info', 'Synced feed Airbnb · EV-S5'),
    ('1eda0e02-0000-0000-0000-000000000002', '1eda0e01-0000-0000-0000-000000000001', 'info', 'Synced feed Airbnb · AH-02'),
    ('1eda0e02-0000-0000-0000-000000000003', '1eda0e01-0000-0000-0000-000000000001', 'info', 'Skipping feed Booking.com · ES-S5 (within sync interval)')
  ON CONFLICT (id) DO NOTHING;

  -- Sample low-stock alert so the notification queue UI shows data.
  INSERT INTO notification_queue (id, recipient_type, recipient_id, channel, template_key, title, body, payload, priority, status, dedupe_key, created_at) VALUES
    ('1eda0e03-0000-0000-0000-000000000001',
     'role', NULL, 'in_app', 'low_stock_alert',
     'Low stock alert',
     '3 inventory items at or below reorder point · 1 out of stock.',
     '{"items": [], "critical": 1, "recipientRole": "operations_manager"}'::jsonb,
     'high', 'queued',
     'low_stock_alert:operations_manager:' || to_char(CURRENT_DATE, 'YYYY-MM-DD'),
     now() - interval '6 hours'),
    ('1eda0e03-0000-0000-0000-000000000002',
     'role', NULL, 'in_app', 'low_stock_alert',
     'Low stock alert',
     '3 inventory items at or below reorder point · 1 out of stock.',
     '{"items": [], "critical": 1, "recipientRole": "procurement_manager"}'::jsonb,
     'high', 'queued',
     'low_stock_alert:procurement_manager:' || to_char(CURRENT_DATE, 'YYYY-MM-DD'),
     now() - interval '6 hours')
  ON CONFLICT (id) DO NOTHING;
END $$;

-- =============================================================================
-- v8A — Notification delivery, inbox, preferences
-- Skipped if migration 0009 hasn't been applied yet.
-- =============================================================================
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'notification_deliveries') THEN
    RAISE NOTICE 'notification_deliveries not present — skipping v8A seed.';
    RETURN;
  END IF;

  -- New worker job (delivery). Digest job is re-enabled below.
  INSERT INTO job_definitions (id, key, name, description, job_type, schedule_cron, enabled, timeout_seconds, max_retries, config) VALUES
    ('1eda0e00-0000-0000-0000-000000000006',
     'deliver_pending_notifications',
     'Deliver pending notifications',
     'Worker job: walks queued notifications and dispatches via in-app / email / SMS / WhatsApp providers. Honours preferences + quiet hours. Defaults to dry-run when external provider env is absent.',
     'notification_delivery', '*/10 * * * *', true, 240, 1, NULL)
  ON CONFLICT (key) DO NOTHING;

  -- Flip the original v7 digest definition to enabled (v8A wires its runner).
  UPDATE job_definitions
     SET enabled = true,
         description = 'Builds a daily snapshot (conflicts, failed jobs, urgent tasks, low stock, pending bridge) and queues one in-app digest per internal role.'
   WHERE key = 'notification_digest_internal';

  -- Sample delivery row referencing the seeded low_stock notifications.
  -- (Soft skip if those rows aren't present — the FK insert just fails silently
  -- through ON CONFLICT DO NOTHING.)
  INSERT INTO notification_deliveries (id, notification_id, channel, provider, status, attempted_at, sent_at, response_json) VALUES
    ('1eda0f00-0000-0000-0000-000000000001',
     '1eda0e03-0000-0000-0000-000000000001',
     'in_app', 'noop', 'sent',
     now() - interval '5 hours',
     now() - interval '5 hours',
     '{"dryRun": true, "channel": "in_app"}'::jsonb)
  ON CONFLICT (id) DO NOTHING;

  -- Sample inbox rows for any active super_admin / director — visible to
  -- those staff once they sign in.
  INSERT INTO in_app_notifications (id, app_user_id, role_key, title, body, payload, priority, status, created_at)
  SELECT
    md5(u.id::text || 'v8a-welcome')::uuid,
    u.id,
    NULL,
    'Welcome to v8A — notifications are live',
    'In-app delivery is wired. Email/SMS/WhatsApp ship through Resend/Twilio when those env vars are set and NOTIFICATIONS_DRY_RUN=0.',
    '{"v8a": true}'::jsonb,
    'normal',
    'unread',
    now() - interval '1 hour'
    FROM app_users u
    JOIN user_roles ur ON ur.user_id = u.id
    JOIN roles r ON r.id = ur.role_id
   WHERE u.status = 'active'
     AND r.key IN ('super_admin','director')
  ON CONFLICT (id) DO NOTHING;

  -- A baseline preference for the digest template — disabled email channel
  -- so dry-runs don't spam inboxes once providers are configured.
  INSERT INTO notification_preferences (id, role_key, channel, template_key, enabled)
  VALUES
    ('1eda0f01-0000-0000-0000-000000000001',
     'super_admin', 'email', 'internal_daily_digest', false),
    ('1eda0f01-0000-0000-0000-000000000002',
     'super_admin', 'in_app', 'internal_daily_digest', true)
  ON CONFLICT (id) DO NOTHING;
END $$;

-- =============================================================================
-- v8B — Notification templates (HTML email + plain-text bodies)
-- =============================================================================
DO $$
BEGIN
  -- Internal daily digest — plain-text in_app + HTML email.
  INSERT INTO notification_templates
    (id, template_key, channel, subject_template, body_template, html_template, status)
  VALUES
    ('2eda0f01-0001-0000-0000-000000000001',
     'internal_daily_digest', 'in_app',
     'Daily ops digest',
     'Open tasks: {{openTasks}}. Conflicts: {{conflicts}}. Low stock: {{lowStock}}. Failed jobs: {{failedJobs}}.',
     NULL,
     'active'),
    ('2eda0f01-0001-0000-0000-000000000002',
     'internal_daily_digest', 'email',
     'Arconique — daily ops digest ({{date}})',
     'Open tasks: {{openTasks}}\nConflicts: {{conflicts}}\nLow stock: {{lowStock}}\nFailed jobs: {{failedJobs}}',
     '<!doctype html><html><body style="font-family:system-ui,-apple-system,sans-serif;line-height:1.5;color:#1a1a1a"><h2 style="margin:0 0 12px">Arconique daily digest</h2><p style="margin:0 0 8px">Snapshot for <strong>{{date}}</strong>:</p><ul style="margin:0 0 12px;padding-left:18px"><li>Open tasks: <strong>{{openTasks}}</strong></li><li>Booking conflicts: <strong>{{conflicts}}</strong></li><li>Low-stock items: <strong>{{lowStock}}</strong></li><li>Failed jobs (24h): <strong>{{failedJobs}}</strong></li></ul><p style="margin:0;color:#555">Reply STOP to unsubscribe (handled in product settings).</p></body></html>',
     'active')
  ON CONFLICT (id) DO NOTHING;

  -- Low-stock alert — short SMS + html email.
  INSERT INTO notification_templates
    (id, template_key, channel, subject_template, body_template, html_template, status)
  VALUES
    ('2eda0f01-0002-0000-0000-000000000001',
     'low_stock_alert', 'in_app',
     'Low-stock alert',
     '{{count}} item(s) below reorder point. Earliest: {{firstItem}}.',
     NULL,
     'active'),
    ('2eda0f01-0002-0000-0000-000000000002',
     'low_stock_alert', 'email',
     'Low-stock alert — {{count}} items',
     'The following items are below reorder point: {{items}}',
     '<!doctype html><html><body style="font-family:system-ui,sans-serif;line-height:1.5;color:#1a1a1a"><h2 style="margin:0 0 12px;color:#b94a48">Low-stock alert</h2><p style="margin:0 0 8px"><strong>{{count}}</strong> item(s) are below their reorder point.</p><p style="margin:0 0 8px">{{items}}</p></body></html>',
     'active')
  ON CONFLICT (id) DO NOTHING;
END $$;

-- =============================================================================
-- v8B — Stamp a default timezone on every existing app_user that doesn't
-- already have one (idempotent — the column has a default at the DDL level
-- but older rows from prior seeds may not carry the property explicitly).
-- =============================================================================
UPDATE app_users SET timezone = 'Asia/Makassar' WHERE timezone IS NULL OR timezone = '';

-- =============================================================================
-- v8B — Sample AI Operations Co-pilot run + fallback summary so the
-- dashboard renders something on first load even before the operator
-- clicks Refresh. The deterministic fallback runs in production too,
-- so this is purely a "you don't have to wait for the first generation"
-- convenience.
-- =============================================================================
DO $$
DECLARE
  sample_run uuid := '3eda0f01-0001-0000-0000-000000000001';
BEGIN
  INSERT INTO ai_assistant_runs
    (id, assistant_key, run_type, status, model,
     prompt_tokens, completion_tokens, total_tokens, latency_ms,
     input_summary, output_summary, finished_at, created_at)
  VALUES
    (sample_run,
     'operations_copilot', 'manual', 'fallback', 'fallback',
     NULL, NULL, NULL, 12,
     '[fallback] seed sample',
     'Risk level: normal. Operations metrics within steady-state range.',
     now() - interval '5 minutes',
     now() - interval '5 minutes')
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO ai_operations_summaries
    (id, run_id, summary_date, title, executive_summary, risk_level,
     highlights, risks, recommended_actions, source_snapshot, status, created_at)
  VALUES
    ('3eda0f01-0002-0000-0000-000000000001',
     sample_run,
     CURRENT_DATE,
     'Operations briefing — steady state',
     'Risk level: normal. Open tasks within range. No unresolved booking conflicts. Inventory at par. Background jobs healthy. This is a seeded fallback summary; click Refresh to regenerate.',
     'normal',
     '[{"title":"Open tasks within range","detail":"No urgent backlog detected.","source":"getOperationsMetrics"}]'::jsonb,
     '[]'::jsonb,
     '[{"title":"No same-day actions required","detail":"Operations metrics are within normal ranges.","source":"fallback"}]'::jsonb,
     '{"generatedAt":"seed","metrics":{"openTasks":0,"overdueTasks":0,"todaysCheckins":0,"todaysCheckouts":0,"bookingConflicts":0,"lowStockItems":0,"failedJobsLast24h":0,"queuedNotifications":0}}'::jsonb,
     'active',
     now() - interval '5 minutes')
  ON CONFLICT (id) DO NOTHING;
END $$;

-- =============================================================================
-- v9A — Villa availability, readiness, front-office, scopes, cameras
-- =============================================================================
DO $$
DECLARE
  v_eternal_s2 uuid := '1eda0002-0000-0000-0000-000000000002';
  v_eternal_s5 uuid := '1eda0002-0000-0000-0000-000000000003';
  v_enso_s2    uuid := '1eda0002-0000-0000-0000-000000000011';
  v_enso_s5    uuid := '1eda0002-0000-0000-0000-000000000012';
  v_enso_s6    uuid := '1eda0002-0000-0000-0000-000000000013';
  proj_eternal uuid := '1eda0001-0000-0000-0000-000000000001';
  proj_enso    uuid := '1eda0001-0000-0000-0000-000000000002';
BEGIN
  -- Defensive guard: every INSERT below requires the seeded villas + the
  -- ARC-A-00241 booking. Skip the whole block if the foundational rows
  -- are missing (e.g. partial seed run).
  IF NOT EXISTS (SELECT 1 FROM villas WHERE id = v_enso_s5) THEN
    RAISE NOTICE 'Skipping v9A villa-availability seed — villa % missing.', v_enso_s5;
    RETURN;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM bookings WHERE id = '1eda0007-0000-0000-0000-000000000001') THEN
    RAISE NOTICE 'Skipping v9A villa-availability seed — booking ARC-A-00241 missing.';
    RETURN;
  END IF;

  -- 9A.1 — Calendar blocks (manual examples). Also a `guest_booking` block
  --        synced from booking ARC-A-00241 — keeps the calendar coherent
  --        with the existing booking seed.
  INSERT INTO villa_calendar_blocks
    (id, villa_id, project_id, block_type, source_type, source_id,
     starts_at, ends_at, title, description, status, owner_visible, guest_visible)
  VALUES
    -- Sync of an existing booking. Source unique index makes this idempotent.
    ('4eda0001-0001-0000-0000-000000000001', v_enso_s5, proj_enso,
     'guest_booking', 'booking', '1eda0007-0000-0000-0000-000000000001',
     '2026-04-26 00:00:00+00', '2026-04-30 00:00:00+00',
     'Booking ARC-A-00241', null, 'active', false, false),
    -- Maintenance block.
    ('4eda0001-0002-0000-0000-000000000001', v_enso_s6, proj_enso,
     'maintenance_block', 'manual', null,
     '2026-04-28 02:00:00+00', '2026-05-02 10:00:00+00',
     'Pool pump rebuild', 'Vendor on-site for 4 days', 'active', true, false),
    -- Out-of-order block.
    ('4eda0001-0003-0000-0000-000000000001', v_eternal_s2, proj_eternal,
     'out_of_order', 'manual', null,
     '2026-04-27 06:00:00+00', '2026-04-27 14:00:00+00',
     'AC compressor swap', null, 'active', true, false),
    -- Inspection block.
    ('4eda0001-0004-0000-0000-000000000001', v_eternal_s5, proj_eternal,
     'inspection', 'manual', null,
     '2026-04-30 03:00:00+00', '2026-04-30 05:00:00+00',
     'Quarterly inspection', null, 'active', false, false),
    -- Internal hold (e.g. a manager held the dates while finalising).
    ('4eda0001-0005-0000-0000-000000000001', v_enso_s2, proj_enso,
     'internal_hold', 'manual', null,
     '2026-05-05 00:00:00+00', '2026-05-08 00:00:00+00',
     'Held for direct booking lead', null, 'active', false, false)
  ON CONFLICT (id) DO NOTHING;

  -- 9A.2 — Readiness states. One open row per villa, partial unique index
  -- enforces that.
  INSERT INTO villa_readiness_states (id, villa_id, readiness_status, notes)
  VALUES
    ('4eda0002-0001-0000-0000-000000000001', v_eternal_s2, 'out_of_order',
     'Booked AC compressor swap — see calendar block.'),
    ('4eda0002-0001-0000-0000-000000000002', v_eternal_s5, 'ready', null),
    ('4eda0002-0001-0000-0000-000000000003', v_enso_s2, 'cleaning',
     'Departure cleaning in progress.'),
    ('4eda0002-0001-0000-0000-000000000004', v_enso_s5, 'occupied',
     'In-house guest until 2026-04-30.'),
    ('4eda0002-0001-0000-0000-000000000005', v_enso_s6, 'maintenance_block',
     'Pool pump rebuild')
  ON CONFLICT DO NOTHING;

  -- 9A.3 — Stay events for the existing bookings (arrival/in-house markers).
  INSERT INTO booking_stay_events (id, booking_id, event_type, event_at, notes)
  VALUES
    ('4eda0003-0001-0000-0000-000000000001',
     '1eda0007-0000-0000-0000-000000000001',
     'pre_arrival', now() - interval '2 days',
     'Arrival kit prepared'),
    ('4eda0003-0001-0000-0000-000000000002',
     '1eda0007-0000-0000-0000-000000000001',
     'arrival_due', now() - interval '6 hours', null),
    ('4eda0003-0001-0000-0000-000000000003',
     '1eda0007-0000-0000-0000-000000000003',
     'checked_in', now() - interval '1 day',
     'Guest party of 7'),
    ('4eda0003-0001-0000-0000-000000000004',
     '1eda0007-0000-0000-0000-000000000003',
     'in_house', now() - interval '1 day', null)
  ON CONFLICT (id) DO NOTHING;

  -- 9A.4 — Sample check-in/out requests.
  INSERT INTO checkin_checkout_requests
    (id, booking_id, villa_id, request_type, requested_time, status,
     fee_amount_minor, currency, guest_message)
  VALUES
    ('4eda0004-0001-0000-0000-000000000001',
     '1eda0007-0000-0000-0000-000000000001', v_enso_s5,
     'late_checkout', '2026-04-30 14:00:00+00', 'requested',
     5000, 'USD', 'Flight at 19:00 — could we keep the villa till 14:00?'),
    ('4eda0004-0001-0000-0000-000000000002',
     '1eda0007-0000-0000-0000-000000000003', v_enso_s2,
     'expected_checkout_time', '2026-05-01 11:00:00+00', 'approved',
     null, null, 'Driver pickup at 11:30'),
    ('4eda0004-0001-0000-0000-000000000003',
     '1eda0007-0000-0000-0000-000000000002', v_eternal_s5,
     'early_checkin', '2026-04-25 13:00:00+00', 'rejected',
     null, null, 'Family arriving early — pool ready?')
  ON CONFLICT (id) DO NOTHING;

  -- 9A.5 — Responsibility scopes for an active app_user, if any exists.
  INSERT INTO user_responsibility_scopes
    (id, user_id, role_key, project_id, villa_id, task_category, scope_type, status)
  SELECT
    md5(u.id::text || ':v9a-scope-1')::uuid,
    u.id, 'operations_manager', proj_enso, NULL, NULL, 'operations', 'active'
    FROM app_users u
    JOIN user_roles ur ON ur.user_id = u.id
    JOIN roles r ON r.id = ur.role_id
   WHERE r.key = 'super_admin' AND u.status = 'active'
   LIMIT 1
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO user_responsibility_scopes
    (id, user_id, role_key, project_id, villa_id, task_category, scope_type, status)
  SELECT
    md5(u.id::text || ':v9a-scope-2')::uuid,
    u.id, 'housekeeping_supervisor', NULL, v_enso_s5, 'housekeeping', 'housekeeping', 'active'
    FROM app_users u
    JOIN user_roles ur ON ur.user_id = u.id
    JOIN roles r ON r.id = ur.role_id
   WHERE r.key IN ('super_admin','director') AND u.status = 'active'
   LIMIT 1
  ON CONFLICT (id) DO NOTHING;

  -- 9A.6 — Security camera registry placeholders. Vendor URLs are obvious
  -- placeholders.
  INSERT INTO security_camera_devices
    (id, project_id, villa_id, name, location_label, provider,
     external_app_url, status, access_role, notes)
  VALUES
    ('4eda0006-0001-0000-0000-000000000001', proj_enso, NULL,
     'Enso · Front gate', 'Front gate', 'Reolink',
     'https://reolink.com/app/example-front-gate', 'active', 'security',
     'Approach lane camera. No interior coverage.'),
    ('4eda0006-0001-0000-0000-000000000002', proj_enso, v_enso_s5,
     'Enso S5 · Pool deck', 'Pool deck (exterior)', 'Ubiquiti',
     'https://unifi.example.com/protect/example-s5-pool', 'active', 'operations_manager',
     'Pool-deck camera only — never inside the villa.'),
    ('4eda0006-0001-0000-0000-000000000003', proj_eternal, NULL,
     'Eternal · Driveway', 'Driveway', 'Dahua',
     'https://dmss.example.com/eternal-driveway', 'offline', 'security',
     'Vendor confirmed offline — replacement scheduled.')
  ON CONFLICT (id) DO NOTHING;
END $$;

-- =============================================================================
-- v9B — Owner stay policies, rate plans, equivalence groups, sample requests
-- =============================================================================
DO $$
DECLARE
  proj_eternal uuid := '1eda0001-0000-0000-0000-000000000001';
  proj_enso    uuid := '1eda0001-0000-0000-0000-000000000002';
  v_eternal_s5 uuid := '1eda0002-0000-0000-0000-000000000003';
  v_enso_s1    uuid := '1eda0002-0000-0000-0000-000000000010';
  v_enso_s2    uuid := '1eda0002-0000-0000-0000-000000000011';
  v_enso_s5    uuid := '1eda0002-0000-0000-0000-000000000012';
  v_enso_s6    uuid := '1eda0002-0000-0000-0000-000000000013';
  owner_eternal uuid := '1eda0003-0000-0000-0000-000000000001';
  owner_pool   uuid := '1eda0003-0000-0000-0000-000000000003';
  rp_enso      uuid := '5eda0001-0001-0000-0000-000000000001';
  rp_eternal   uuid := '5eda0001-0001-0000-0000-000000000002';
  group_enso   uuid := '5eda0002-0001-0000-0000-000000000001';
BEGIN
  -- Defensive guard: this block writes owner-stay policies, rate plans,
  -- equivalence groups, and seed owner-stay-requests that reference both
  -- projects (proj_eternal/proj_enso) and the demo owner rows. Skip if
  -- the foundational rows aren't there.
  IF NOT EXISTS (SELECT 1 FROM projects WHERE id = proj_enso) THEN
    RAISE NOTICE 'Skipping v9B owner-stay seed — project % missing.', proj_enso;
    RETURN;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM owners WHERE id = owner_eternal) THEN
    RAISE NOTICE 'Skipping v9B owner-stay seed — owner % missing.', owner_eternal;
    RETURN;
  END IF;

  -- 9B.1 — Owner stay policies (project-scoped defaults).
  INSERT INTO owner_stay_policies
    (id, project_id, villa_id, policy_name,
     free_nights_per_year, free_nights_apply_to_peak, requires_approval,
     allow_displacing_guest_bookings, relocation_allowed,
     operational_cost_model, fixed_operational_cost_minor, currency,
     compensation_model, compensation_percent, fixed_compensation_minor,
     blackout_dates, peak_season_rules, status)
  VALUES
    ('5eda0003-0001-0000-0000-000000000001',
     proj_enso, NULL, 'Enso pooled — default',
     14, false, true,
     false, true,
     'fixed_per_night', 7500, 'USD',
     'percent_of_expected_gross', 25, NULL,
     '[]'::jsonb,
     '{"ranges":[{"start":"2026-12-20","end":"2027-01-05"}]}'::jsonb,
     'active'),
    ('5eda0003-0001-0000-0000-000000000002',
     proj_eternal, NULL, 'Eternal hybrid — default',
     21, true, true,
     false, true,
     'actual_costs', NULL, 'USD',
     'management_fee_on_expected_gross', 18, NULL,
     '[]'::jsonb,
     '{"ranges":[{"start":"2026-12-20","end":"2027-01-05"}]}'::jsonb,
     'active')
  ON CONFLICT (id) DO NOTHING;

  -- 9B.2 — Rate plans (project-scoped for v9B).
  INSERT INTO rate_plans
    (id, project_id, villa_id, name, base_currency,
     base_nightly_rate_minor, management_fee_percent, status)
  VALUES
    (rp_enso, proj_enso, NULL,
     'Enso · base rate', 'USD', 82000, 25, 'active'),
    (rp_eternal, proj_eternal, NULL,
     'Eternal · base rate', 'USD', 72000, 18, 'active')
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO rate_plan_seasons
    (id, rate_plan_id, name, starts_on, ends_on, multiplier,
     nightly_rate_minor, min_los, stop_sell, status)
  VALUES
    ('5eda0004-0001-0000-0000-000000000001', rp_enso,
     'Peak (NYE)', '2026-12-20', '2027-01-05', 1.6,
     NULL, 7, false, 'active'),
    ('5eda0004-0001-0000-0000-000000000002', rp_eternal,
     'Peak (NYE)', '2026-12-20', '2027-01-05', 1.6,
     NULL, 7, false, 'active'),
    ('5eda0004-0001-0000-0000-000000000003', rp_enso,
     'Shoulder · April', '2026-04-01', '2026-04-30', 1.1,
     NULL, NULL, false, 'active')
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO rate_plan_overrides
    (rate_plan_id, stay_date, nightly_rate_minor, min_los, stop_sell, source, notes)
  VALUES
    (rp_enso, '2026-04-26', 95000, NULL, false, 'manual', 'Weekend bump'),
    (rp_enso, '2026-04-27', 95000, NULL, false, 'manual', 'Weekend bump'),
    (rp_enso, '2026-12-31', 220000, 5, false, 'manual', 'NYE'),
    (rp_eternal, '2026-12-31', 200000, 5, false, 'manual', 'NYE')
  ON CONFLICT (rate_plan_id, stay_date) DO NOTHING;

  -- 9B.3 — Equivalence group (Enso pooled — three swap-comparable villas).
  INSERT INTO villa_equivalence_groups
    (id, project_id, name, description, status)
  VALUES
    (group_enso, proj_enso,
     'Enso · 3-bed pool',
     'Swap-comparable Enso villas used for owner-stay relocation candidates.',
     'active')
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO villa_equivalence_group_members
    (id, group_id, villa_id, quality_rank, status)
  VALUES
    ('5eda0005-0001-0000-0000-000000000001', group_enso, v_enso_s1, 100, 'active'),
    ('5eda0005-0001-0000-0000-000000000002', group_enso, v_enso_s2, 100, 'active'),
    ('5eda0005-0001-0000-0000-000000000003', group_enso, v_enso_s5,  90, 'active')
  ON CONFLICT (group_id, villa_id) DO NOTHING;

  -- 9B.4 — Sample owner stay requests.
  INSERT INTO owner_stay_requests
    (id, owner_id, villa_id, project_id,
     requested_start, requested_end, guests_count, purpose,
     status, currency,
     estimated_gross_revenue_minor, estimated_management_compensation_minor,
     estimated_operational_cost_minor, estimated_total_owner_charge_minor,
     allowance_year, allowance_nights_applied, billable_nights,
     relocation_required, relocation_possible)
  VALUES
    -- Available request, future, no conflict.
    ('5eda0006-0001-0000-0000-000000000001',
     owner_eternal, v_eternal_s5, proj_eternal,
     '2026-06-15', '2026-06-22', 4, 'Family stay',
     'pending_admin_approval', 'USD',
     0, 0, 0, 0,
     2026, 7, 0,
     false, true),
    -- Requires relocation — overlaps seeded ARC-A-00241 on ES-S5.
    ('5eda0006-0001-0000-0000-000000000002',
     owner_pool, v_enso_s5, proj_enso,
     '2026-04-27', '2026-04-30', 2, 'Quick check-in trip',
     'requires_relocation', 'USD',
     285000, 71250, 22500, 93750,
     2026, 0, 3,
     true, true)
  ON CONFLICT (id) DO NOTHING;

  -- Rejected request — uses villa_id v_enso_s6 which has v9A maintenance block.
  INSERT INTO owner_stay_requests
    (id, owner_id, villa_id, project_id,
     requested_start, requested_end, guests_count, purpose,
     status, currency, admin_decision, admin_notes,
     estimated_gross_revenue_minor, estimated_management_compensation_minor,
     estimated_operational_cost_minor, estimated_total_owner_charge_minor,
     allowance_year, allowance_nights_applied, billable_nights,
     relocation_required, rejected_at)
  VALUES
    ('5eda0006-0001-0000-0000-000000000003',
     owner_pool, v_enso_s6, proj_enso,
     '2026-04-29', '2026-05-03', 6, 'Owner inspection',
     'rejected', 'USD',
     'rejected', 'Pool pump rebuild scheduled — please reschedule after May 5.',
     0, 0, 0, 0,
     2026, 0, 0,
     false, now() - interval '12 hours')
  ON CONFLICT (id) DO NOTHING;

  -- 9B.5 — Sample relocation candidate for request B.
  INSERT INTO booking_relocation_candidates
    (id, owner_stay_request_id, booking_id,
     from_villa_id, to_villa_id,
     candidate_status, score, guest_impact_level, reason,
     revenue_difference_minor, currency, requires_guest_notification)
  VALUES
    ('5eda0007-0001-0000-0000-000000000001',
     '5eda0006-0001-0000-0000-000000000002',
     '1eda0007-0000-0000-0000-000000000001',
     v_enso_s5, v_enso_s1,
     'candidate', 0.9, 'low', 'equivalent',
     0, 'USD', true)
  ON CONFLICT (id) DO NOTHING;
END $$;

-- =============================================================================
-- v9C — Owner stay notification templates, completed stay, finance links
-- =============================================================================

-- 9C.1 — Notification templates (in_app + email). Bodies use {{var}}
-- placeholders the v8B template engine substitutes from `payload`.
INSERT INTO notification_templates
  (id, template_key, channel, subject_template, body_template, html_template, status)
VALUES
  ('6eda0001-0001-0000-0000-000000000001',
   'owner_stay.request_received', 'in_app',
   'Owner stay request received',
   'We received your stay request for {{villa}} on {{checkIn}} → {{checkOut}}.',
   NULL, 'active'),
  ('6eda0001-0001-0000-0000-000000000002',
   'owner_stay.approved', 'in_app',
   'Owner stay approved',
   'Your stay at {{villa}} on {{checkIn}} → {{checkOut}} is approved.',
   NULL, 'active'),
  ('6eda0001-0001-0000-0000-000000000003',
   'owner_stay.rejected', 'in_app',
   'Owner stay not confirmed',
   'Your stay request for {{villa}} on {{checkIn}} → {{checkOut}} couldn''t be approved. Please contact your property manager.',
   NULL, 'active'),
  ('6eda0001-0001-0000-0000-000000000004',
   'owner_stay.cancelled', 'in_app',
   'Owner stay cancelled',
   'Your stay request for {{villa}} on {{checkIn}} → {{checkOut}} has been cancelled.',
   NULL, 'active'),
  ('6eda0001-0001-0000-0000-000000000005',
   'owner_stay.completed', 'in_app',
   'Owner stay completed',
   'Your stay at {{villa}} on {{checkIn}} → {{checkOut}} is marked complete.',
   NULL, 'active'),
  ('6eda0001-0001-0000-0000-000000000006',
   'owner_stay.relocation_pending', 'in_app',
   'Owner stay — admin review',
   'Some of your selected dates overlap with existing reservations. Our team is reviewing.',
   NULL, 'active'),
  ('6eda0001-0001-0000-0000-000000000007',
   'owner_stay.finance_bridged', 'in_app',
   'Owner stay charges posted',
   'Charges for your stay at {{villa}} on {{checkIn}} → {{checkOut}} have been added to your statement.',
   NULL, 'active'),
  -- Email variants for the most consequential transitions.
  ('6eda0001-0002-0000-0000-000000000001',
   'owner_stay.approved', 'email',
   'Your owner stay at {{villa}} is approved',
   'Your stay at {{villa}} on {{checkIn}} → {{checkOut}} is approved. The estimated charges are listed in your owner portal.',
   '<!doctype html><html><body style="font-family:system-ui,sans-serif;line-height:1.5;color:#1a1a1a"><h2 style="margin:0 0 12px">Owner stay approved</h2><p style="margin:0 0 8px">Your stay at <strong>{{villa}}</strong> on <strong>{{checkIn}} → {{checkOut}}</strong> is approved.</p><p style="margin:0;color:#555">Charges (if any) appear on your statement after the stay completes.</p></body></html>',
   'active'),
  ('6eda0001-0002-0000-0000-000000000002',
   'owner_stay.completed', 'email',
   'Owner stay completed — {{villa}}',
   'Your stay at {{villa}} on {{checkIn}} → {{checkOut}} is marked complete.',
   '<!doctype html><html><body style="font-family:system-ui,sans-serif;line-height:1.5"><h2>Stay completed</h2><p>Your stay at <strong>{{villa}}</strong> on <strong>{{checkIn}} → {{checkOut}}</strong> is now complete. Charges (if any) will appear on your next statement.</p></body></html>',
   'active')
ON CONFLICT (id) DO NOTHING;

-- 9C.2 — Demo data: turn one of the v9B sample requests into a
-- completed + bridged stay so the dashboard renders something on first
-- load. The v9B "rejected" sample (5eda0006-0001-0000-0000-000000000003)
-- stays as it is. We promote the v9B "available" request (id …001)
-- into approved + completed with finance-bridge state, and create the
-- materialised finance rows (skipping the locked-period trigger by
-- using a future stay date in 2026-06).
DO $$
DECLARE
  req_completed uuid := '5eda0006-0001-0000-0000-000000000001';
  v_eternal_s5  uuid := '1eda0002-0000-0000-0000-000000000003';
  proj_eternal  uuid := '1eda0001-0000-0000-0000-000000000001';
  owner_eternal uuid := '1eda0003-0000-0000-0000-000000000001';
  block_id      uuid := '6eda0002-0001-0000-0000-000000000001';
  link_id       uuid := '6eda0003-0001-0000-0000-000000000001';
  mf_id         uuid := '6eda0004-0001-0000-0000-000000000001';
  ex_id         uuid := '6eda0004-0002-0000-0000-000000000001';
BEGIN
  -- Defensive guard: this block bridges the owner_stay_requests row
  -- created in the v9B block to finance lines + a calendar block. Skip
  -- if the source request is missing (e.g. v9B block was guarded out).
  IF NOT EXISTS (SELECT 1 FROM owner_stay_requests WHERE id = req_completed) THEN
    RAISE NOTICE 'Skipping v9C owner-stay finance bridge seed — owner_stay_requests % missing.', req_completed;
    RETURN;
  END IF;

  -- Materialise an owner_stay calendar block for the request (V9A side).
  INSERT INTO villa_calendar_blocks
    (id, villa_id, project_id, block_type, source_type, source_id,
     starts_at, ends_at, title, status, owner_visible, guest_visible)
  VALUES
    (block_id, v_eternal_s5, proj_eternal,
     'owner_stay', 'owner_stay_request', req_completed,
     '2026-06-15 00:00:00+00', '2026-06-22 00:00:00+00',
     'Owner stay', 'active', true, false)
  ON CONFLICT (id) DO NOTHING;

  -- Promote the request to completed with realistic estimate snapshot.
  UPDATE owner_stay_requests
     SET status = 'completed',
         approved_at = now() - interval '10 days',
         completed_at = now() - interval '2 days',
         created_calendar_block_id = block_id,
         estimated_gross_revenue_minor = 720000,        -- 7,200.00 USD (7 nights × ~1029)
         estimated_management_compensation_minor = 129600,
         estimated_operational_cost_minor = 45000,      -- fixed_per_stay placeholder
         estimated_total_owner_charge_minor = 174600,
         allowance_nights_applied = 7,
         billable_nights = 0,
         finance_bridge_status = 'bridged',
         updated_at = now()
   WHERE id = req_completed;

  -- Insert the finance rows the bridge would have created. Effective
  -- date = last night of stay = 2026-06-21 (well outside any seeded
  -- closed/locked period).
  INSERT INTO management_fee_lines
    (id, villa_id, project_id, owner_id, description,
     amount_minor, currency, fee_date, status)
  VALUES
    (mf_id, v_eternal_s5, proj_eternal, owner_eternal,
     'Owner stay compensation · Demo Owner — Emma Whitmore · EV-S5 · 2026-06-15 → 2026-06-22',
     129600, 'USD', '2026-06-21', 'posted')
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO expense_lines
    (id, villa_id, project_id, expense_type, description,
     amount_minor, currency, expense_date,
     allocation_scope, owner_chargeable, status)
  VALUES
    (ex_id, v_eternal_s5, proj_eternal,
     'owner_stay_operational_cost',
     'Owner stay operational cost · Demo Owner — Emma Whitmore · EV-S5 · 2026-06-15 → 2026-06-22',
     45000, 'USD', '2026-06-21',
     'owner_direct', true, 'posted')
  ON CONFLICT (id) DO NOTHING;

  -- Link row.
  INSERT INTO owner_stay_finance_links
    (id, owner_stay_request_id, owner_id, villa_id, project_id,
     statement_period_id, compensation_revenue_line_id,
     operational_expense_line_id, management_fee_line_id,
     bridge_status, amount_minor, currency)
  VALUES
    (link_id, req_completed, owner_eternal, v_eternal_s5, proj_eternal,
     NULL, NULL, ex_id, mf_id,
     'bridged', 174600, 'USD')
  ON CONFLICT (owner_stay_request_id) DO NOTHING;

  -- Point the request at the link row.
  UPDATE owner_stay_requests
     SET finance_link_id = link_id,
         updated_at = now()
   WHERE id = req_completed;

  -- Sample skipped_no_charge link — based on the v9B "rejected" request
  -- to demonstrate non-bridged states. We attach it to that row but
  -- leave the request unchanged (still rejected). The link reflects
  -- "evaluated, no charge to bridge".
  -- (Skipped in demo seed to avoid confusion — rejected requests
  -- should never reach the bridge in normal flow.)

  -- 9C.3 — Sample queued notifications (in_app), so the owner inbox
  -- already has rows on first sign-in. The notification delivery worker
  -- will materialise them into in_app_notifications on next pass.
  INSERT INTO notification_queue
    (id, recipient_type, recipient_id, channel, template_key,
     title, body, payload, priority, status, dedupe_key)
  VALUES
    ('6eda0005-0001-0000-0000-000000000001',
     'owner', owner_eternal, 'in_app', 'owner_stay.approved',
     'Owner stay approved',
     'Your stay at EV-S5 on 2026-06-15 → 2026-06-22 is approved.',
     '{"ownerStayRequestId":"5eda0006-0001-0000-0000-000000000001","villa":"EV-S5","checkIn":"2026-06-15","checkOut":"2026-06-22"}'::jsonb,
     'normal', 'queued',
     'owner_stay.approved:5eda0006-0001-0000-0000-000000000001'),
    ('6eda0005-0001-0000-0000-000000000002',
     'owner', owner_eternal, 'in_app', 'owner_stay.completed',
     'Owner stay completed',
     'Your stay at EV-S5 on 2026-06-15 → 2026-06-22 is marked complete.',
     '{"ownerStayRequestId":"5eda0006-0001-0000-0000-000000000001","villa":"EV-S5","checkIn":"2026-06-15","checkOut":"2026-06-22"}'::jsonb,
     'normal', 'queued',
     'owner_stay.completed:5eda0006-0001-0000-0000-000000000001'),
    ('6eda0005-0001-0000-0000-000000000003',
     'owner', '1eda0003-0000-0000-0000-000000000003', 'in_app',
     'owner_stay.relocation_pending',
     'Owner stay — admin review',
     'Some of your selected dates overlap with existing reservations. Our team is reviewing.',
     '{"ownerStayRequestId":"5eda0006-0001-0000-0000-000000000002","villa":"ES-S5"}'::jsonb,
     'normal', 'queued',
     'owner_stay.relocation_pending:5eda0006-0001-0000-0000-000000000002')
  ON CONFLICT (id) DO NOTHING;
END $$;

-- =============================================================================
-- v9D — Maintenance templates, villa plans, utility accounts, readings,
-- reminders, risks, and notification templates.
-- =============================================================================

-- 9D.1 — Maintenance templates (Bali villa standard catalog).
INSERT INTO maintenance_templates
  (id, key, name, category, default_frequency, default_interval_days,
   default_duration_minutes, default_priority, can_be_done_while_occupied,
   guest_disruption_level, requires_villa_empty, description)
VALUES
  ('7eda0001-0001-0000-0000-000000000001', 'ac_service_biweekly',
   'AC service (filter + drain)', 'ac', 'biweekly', 14,
   45, 'normal', false, 'medium', false,
   'Filter clean, drain pan flush, refrigerant pressure check.'),
  ('7eda0001-0001-0000-0000-000000000002', 'pool_service_twice_weekly',
   'Pool service', 'pool', 'twice_weekly', 4,
   60, 'normal', true, 'low', false,
   'Skim, vacuum, balance pH and chlorine.'),
  ('7eda0001-0001-0000-0000-000000000003', 'pest_control_monthly',
   'Pest control', 'pest_control', 'monthly', 30,
   90, 'normal', false, 'medium', false,
   'Perimeter spray, kitchen + storage focus, ant & roach baits.'),
  ('7eda0001-0001-0000-0000-000000000004', 'garden_weekly',
   'Garden maintenance', 'garden', 'weekly', 7,
   120, 'low', true, 'low', false,
   'Mow, prune, weed, irrigation check.'),
  ('7eda0001-0001-0000-0000-000000000005', 'pump_check_monthly',
   'Pump & water system', 'pump', 'monthly', 30,
   60, 'normal', true, 'low', false,
   'Pressure tank, booster pump, leak check.'),
  ('7eda0001-0001-0000-0000-000000000006', 'wifi_router_monthly',
   'Wi-Fi / router check', 'wifi', 'monthly', 30,
   30, 'normal', true, 'low', false,
   'Reboot, firmware check, signal map.'),
  ('7eda0001-0001-0000-0000-000000000007', 'smartlock_battery_monthly',
   'Smart-lock battery check', 'smart_lock', 'monthly', 30,
   15, 'normal', true, 'none', false,
   'Verify battery level on every external smart lock.'),
  ('7eda0001-0001-0000-0000-000000000008', 'electrical_quarterly',
   'Electrical safety inspection', 'electrical', 'quarterly', 91,
   90, 'high', false, 'high', true,
   'RCBO test, panel inspection, thermal scan.')
ON CONFLICT (id) DO NOTHING;

-- 9D.2 — Villa maintenance plans for two demo villas (Eternal S5 + Enso S5).
DO $$
DECLARE
  v_eternal_s5 uuid := '1eda0002-0000-0000-0000-000000000003';
  v_enso_s5    uuid := '1eda0002-0000-0000-0000-000000000012';
  proj_eternal uuid := '1eda0001-0000-0000-0000-000000000001';
  proj_enso    uuid := '1eda0001-0000-0000-0000-000000000002';
  tpl_ac       uuid := '7eda0001-0001-0000-0000-000000000001';
BEGIN
  -- Defensive guard: villa_maintenance_plans rows reference both villas
  -- and maintenance templates that are seeded earlier in this file. Skip
  -- the block when those prerequisites aren't present.
  IF NOT EXISTS (SELECT 1 FROM villas WHERE id = v_eternal_s5) THEN
    RAISE NOTICE 'Skipping v9D maintenance plans seed — villa % missing.', v_eternal_s5;
    RETURN;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM maintenance_templates WHERE id = tpl_ac) THEN
    RAISE NOTICE 'Skipping v9D maintenance plans seed — maintenance template % missing.', tpl_ac;
    RETURN;
  END IF;

  INSERT INTO villa_maintenance_plans
    (id, villa_id, project_id, template_id, plan_name,
     frequency, interval_days, duration_minutes, priority,
     can_be_done_while_occupied, guest_disruption_level, requires_villa_empty,
     next_due_at, status)
  VALUES
    -- Eternal S5
    ('7eda0002-0001-0000-0000-000000000001', v_eternal_s5, proj_eternal,
     '7eda0001-0001-0000-0000-000000000001',
     'AC service · EV-S5', 'biweekly', 14, 45, 'normal',
     false, 'medium', false,
     now() - interval '1 day', 'active'),
    ('7eda0002-0001-0000-0000-000000000002', v_eternal_s5, proj_eternal,
     '7eda0001-0001-0000-0000-000000000002',
     'Pool service · EV-S5', 'twice_weekly', 4, 60, 'normal',
     true, 'low', false,
     now() + interval '1 day', 'active'),
    ('7eda0002-0001-0000-0000-000000000003', v_eternal_s5, proj_eternal,
     '7eda0001-0001-0000-0000-000000000007',
     'Smart-lock battery · EV-S5', 'monthly', 30, 15, 'normal',
     true, 'none', false,
     now() + interval '5 days', 'active'),
    -- Enso S5
    ('7eda0002-0002-0000-0000-000000000001', v_enso_s5, proj_enso,
     '7eda0001-0001-0000-0000-000000000001',
     'AC service · ES-S5', 'biweekly', 14, 45, 'normal',
     false, 'medium', false,
     now() + interval '3 days', 'active'),
    ('7eda0002-0002-0000-0000-000000000002', v_enso_s5, proj_enso,
     '7eda0001-0001-0000-0000-000000000002',
     'Pool service · ES-S5', 'twice_weekly', 4, 60, 'normal',
     true, 'low', false,
     now() + interval '2 days', 'active'),
    ('7eda0002-0002-0000-0000-000000000003', v_enso_s5, proj_enso,
     '7eda0001-0001-0000-0000-000000000005',
     'Pump check · ES-S5', 'monthly', 30, 60, 'normal',
     true, 'low', false,
     now() - interval '2 days', 'active'),
    ('7eda0002-0002-0000-0000-000000000004', v_enso_s5, proj_enso,
     '7eda0001-0001-0000-0000-000000000008',
     'Electrical inspection · ES-S5', 'quarterly', 91, 90, 'high',
     false, 'high', true,
     now() + interval '15 days', 'active')
  ON CONFLICT (id) DO NOTHING;
END $$;

-- 9D.3 — Notification templates for v9D risk events.
INSERT INTO notification_templates
  (id, template_key, channel, subject_template, body_template, html_template, status)
VALUES
  ('7eda0003-0001-0000-0000-000000000001', 'maintenance.overdue', 'in_app',
   'Overdue maintenance plan',
   'A maintenance plan is overdue: {{title}}.',
   NULL, 'active'),
  ('7eda0003-0001-0000-0000-000000000002', 'maintenance.window_suggested', 'in_app',
   'New maintenance windows',
   'Fresh window suggestions are available for your maintenance plan.',
   NULL, 'active'),
  ('7eda0003-0001-0000-0000-000000000003', 'utility.low_balance', 'in_app',
   'Low utility balance',
   '{{title}} — top up before guests notice.',
   NULL, 'active'),
  ('7eda0003-0001-0000-0000-000000000004', 'utility.critical_balance', 'in_app',
   'Critical utility balance',
   '{{title}} — act now.',
   NULL, 'active'),
  ('7eda0003-0001-0000-0000-000000000005', 'utility.payment_due', 'in_app',
   'Utility payment due',
   'A utility payment is due for {{title}}.',
   NULL, 'active'),
  ('7eda0003-0001-0000-0000-000000000006', 'utility.payment_overdue', 'in_app',
   'Utility payment overdue',
   'A utility payment is overdue for {{title}}.',
   NULL, 'active'),
  ('7eda0003-0001-0000-0000-000000000007', 'readiness.arrival_not_ready', 'in_app',
   'Arrival today, villa not ready',
   '{{title}}',
   NULL, 'active')
ON CONFLICT (id) DO NOTHING;

-- 9D.4 — Utility accounts (PLN token, PDAM water, ISP) per project + villa.
DO $$
DECLARE
  v_eternal_s5 uuid := '1eda0002-0000-0000-0000-000000000003';
  v_enso_s5    uuid := '1eda0002-0000-0000-0000-000000000012';
  proj_eternal uuid := '1eda0001-0000-0000-0000-000000000001';
  proj_enso    uuid := '1eda0001-0000-0000-0000-000000000002';
BEGIN
  -- Defensive guard: utility_accounts has FK to villas + projects.
  -- Skip if either base table is empty (fresh / partial seed).
  IF NOT EXISTS (SELECT 1 FROM villas WHERE id = v_eternal_s5) THEN
    RAISE NOTICE 'Skipping v9D utility accounts seed — villa % missing.', v_eternal_s5;
    RETURN;
  END IF;

  INSERT INTO utility_accounts
    (id, villa_id, project_id, utility_type, provider_name, account_number,
     token_meter, billing_cycle_day, currency,
     average_monthly_cost_minor, low_balance_threshold_minor,
     critical_balance_threshold_minor, status, notes)
  VALUES
    -- Eternal S5 PLN token
    ('7eda0004-0001-0000-0000-000000000001', v_eternal_s5, proj_eternal,
     'electricity', 'PLN', 'PLN-EV-S5-1108',
     true, NULL, 'IDR',
     250000000, 30000000, 10000000,
     'active', 'Prepaid token meter — top up monthly.'),
    -- Eternal S5 PDAM
    ('7eda0004-0001-0000-0000-000000000002', v_eternal_s5, proj_eternal,
     'water', 'PDAM', 'PDAM-EV-S5-77',
     false, 14, 'IDR',
     45000000, NULL, NULL,
     'active', NULL),
    -- Enso S5 PLN token (low balance scenario)
    ('7eda0004-0002-0000-0000-000000000001', v_enso_s5, proj_enso,
     'electricity', 'PLN', 'PLN-ES-S5-2012',
     true, NULL, 'IDR',
     280000000, 30000000, 10000000,
     'active', NULL),
    -- Enso project ISP
    ('7eda0004-0002-0000-0000-000000000002', NULL, proj_enso,
     'internet', 'Biznet Fibre', 'BIZ-ENSO-441',
     false, 5, 'IDR',
     120000000, NULL, NULL,
     'active', 'Project-level — covers all Enso villas.')
  ON CONFLICT (id) DO NOTHING;
END $$;

-- 9D.5 — Sample utility readings. Enso S5 PLN token gets a CRITICAL balance
-- so the risk feed surfaces a critical event after a scan.
INSERT INTO utility_readings
  (id, utility_account_id, villa_id, reading_type, reading_value,
   balance_minor, currency, reading_at, source, notes)
VALUES
  ('7eda0005-0001-0000-0000-000000000001',
   '7eda0004-0001-0000-0000-000000000001',
   '1eda0002-0000-0000-0000-000000000003',
   'token_balance', NULL,
   85000000, 'IDR',
   now() - interval '4 days', 'field_check',
   'Steady, well above low threshold.'),
  ('7eda0005-0001-0000-0000-000000000002',
   '7eda0004-0001-0000-0000-000000000002',
   '1eda0002-0000-0000-0000-000000000003',
   'meter', 12345.67,
   NULL, NULL,
   now() - interval '7 days', 'field_check',
   NULL),
  -- Enso S5 — critical balance
  ('7eda0005-0002-0000-0000-000000000001',
   '7eda0004-0002-0000-0000-000000000001',
   '1eda0002-0000-0000-0000-000000000012',
   'token_balance', NULL,
   8000000, 'IDR',
   now() - interval '1 day', 'field_check',
   'BELOW critical threshold — top up.')
ON CONFLICT (id) DO NOTHING;

-- 9D.6 — Sample payment reminders.
INSERT INTO utility_payment_reminders
  (id, utility_account_id, villa_id, due_date, amount_minor, currency, status, notes)
VALUES
  ('7eda0006-0001-0000-0000-000000000001',
   '7eda0004-0001-0000-0000-000000000002',
   '1eda0002-0000-0000-0000-000000000003',
   (CURRENT_DATE + interval '5 days')::date,
   45000000, 'IDR', 'open',
   'PDAM monthly bill · EV-S5'),
  ('7eda0006-0002-0000-0000-000000000001',
   '7eda0004-0002-0000-0000-000000000002',
   NULL,
   (CURRENT_DATE - interval '2 days')::date,
   120000000, 'IDR', 'overdue',
   'Biznet Fibre · Enso project · OVERDUE')
ON CONFLICT (id) DO NOTHING;

-- 9D.7 — Sample risk events (utility critical + overdue maintenance).
-- These mirror what `scanMaintenanceRisks` would create on first run.
INSERT INTO maintenance_risk_events
  (id, villa_id, project_id, risk_type, severity, title, description,
   source_type, source_id, status)
VALUES
  ('7eda0007-0001-0000-0000-000000000001',
   '1eda0002-0000-0000-0000-000000000012',
   '1eda0001-0000-0000-0000-000000000002',
   'utility_critical_balance', 'critical',
   'Critical utility balance: electricity',
   'PLN token balance is at 80000.00 IDR — below the critical threshold.',
   'utility_account', '7eda0004-0002-0000-0000-000000000001', 'open'),
  ('7eda0007-0001-0000-0000-000000000002',
   '1eda0002-0000-0000-0000-000000000003',
   '1eda0001-0000-0000-0000-000000000001',
   'overdue_maintenance', 'medium',
   'Overdue maintenance: AC service · EV-S5',
   'Plan was due yesterday — generate a task or push next_due_at.',
   'villa_maintenance_plan', '7eda0002-0001-0000-0000-000000000001', 'open')
ON CONFLICT (risk_type, source_type, source_id)
WHERE status = 'open' AND source_type IS NOT NULL AND source_id IS NOT NULL
DO NOTHING;

-- =============================================================================
-- v9E — Guest stay tokens, villa guide content, wifi, contacts, places,
-- smart-lock stub, sample guest service request.
-- =============================================================================

-- 9E.1 — Project- and villa-scoped guide sections.
INSERT INTO villa_guide_sections
  (id, project_id, villa_id, section_key, title, body_md, sort_order, guest_visible, status)
VALUES
  -- Project-level defaults for Enso.
  ('8eda0001-0001-0000-0000-000000000001',
   '1eda0001-0000-0000-0000-000000000002', NULL,
   'check_in', 'Arrival & check-in',
   '## Arrival\n\n- The villa concierge can meet you on arrival between 14:00 and 22:00.\n- Door code unlocks 24 hours before check-in.\n- For late arrivals please send us a quick message.',
   10, true, 'active'),
  ('8eda0001-0001-0000-0000-000000000002',
   '1eda0001-0000-0000-0000-000000000002', NULL,
   'house_rules', 'House rules',
   '- Quiet hours after 22:00.\n- No parties or events without prior approval.\n- Smoking only on outdoor terraces.\n- The pool is unsupervised — children must be accompanied.',
   20, true, 'active'),
  ('8eda0001-0001-0000-0000-000000000003',
   '1eda0001-0000-0000-0000-000000000002', NULL,
   'amenities', 'Amenities',
   '- Private pool, towels in the cupboard near the entrance.\n- Espresso machine in the kitchen — pods on the shelf.\n- Smart TV with Netflix, YouTube, Spotify.\n- Yoga mats and beach towels in the closet.',
   30, true, 'active'),
  ('8eda0001-0001-0000-0000-000000000004',
   '1eda0001-0000-0000-0000-000000000002', NULL,
   'transport',
   'Getting around',
   '- Scooter rental is the fastest way to explore — we can arrange one.\n- Grab and Gojek work everywhere.\n- Airport pickup can be arranged through your concierge.',
   40, true, 'active'),
  -- Villa-specific override for Enso S5 — beats the project default for `check_in`.
  ('8eda0001-0002-0000-0000-000000000001',
   NULL, '1eda0002-0000-0000-0000-000000000012',
   'check_in', 'Arrival at Enso S5',
   '## Welcome to Enso S5\n\nYour door code unlocks 24 h before check-in.\n\n1. Park in the visitor bay near the gate.\n2. Use the keypad on the main door.\n3. Your concierge will WhatsApp you within 30 minutes.',
   10, true, 'active')
ON CONFLICT DO NOTHING;

-- 9E.2 — Wi-Fi: project-level for Enso, villa-level for Enso S5 overrides.
INSERT INTO villa_wifi_credentials
  (id, project_id, villa_id, network_name, display_password, instructions_md, status)
VALUES
  ('8eda0002-0001-0000-0000-000000000001',
   '1eda0001-0000-0000-0000-000000000002', NULL,
   'Enso-Guest', 'enso-bali-2026',
   'Connect from any device. The 5 GHz band has the strongest signal near the pool.',
   'active'),
  ('8eda0002-0001-0000-0000-000000000002',
   NULL, '1eda0002-0000-0000-0000-000000000012',
   'Enso-S5', 's5-cosy-stay-2026',
   'Mesh network — connects automatically as you move around the villa.',
   'active')
ON CONFLICT DO NOTHING;

-- 9E.3 — Emergency contacts (project-level for Enso).
INSERT INTO villa_emergency_contacts
  (id, project_id, villa_id, label, contact_type, phone, whatsapp, email, address, sort_order, guest_visible, status)
VALUES
  ('8eda0003-0001-0000-0000-000000000001',
   '1eda0001-0000-0000-0000-000000000002', NULL,
   'Concierge — Made', 'concierge',
   '+62 812 0000 0001', '+6281200000001', 'concierge@arconique.com',
   NULL, 10, true, 'active'),
  ('8eda0003-0001-0000-0000-000000000002',
   '1eda0001-0000-0000-0000-000000000002', NULL,
   'Manager on duty', 'manager',
   '+62 812 0000 0002', '+6281200000002', NULL,
   NULL, 20, true, 'active'),
  ('8eda0003-0001-0000-0000-000000000003',
   '1eda0001-0000-0000-0000-000000000002', NULL,
   'BIMC Hospital · Nusa Dua', 'hospital',
   '+62 361 3000911', NULL, NULL,
   'Jl. Bypass Ngurah Rai, Kuta Selatan, Bali',
   30, true, 'active'),
  ('8eda0003-0001-0000-0000-000000000004',
   '1eda0001-0000-0000-0000-000000000002', NULL,
   'Police (general)', 'police',
   '110', NULL, NULL, NULL, 40, true, 'active')
ON CONFLICT DO NOTHING;

-- 9E.4 — Neighborhood places (a small Bali sampler — project-level).
INSERT INTO villa_neighborhood_places
  (id, project_id, villa_id, name, category, description_md,
   address, distance_label, travel_time_label, sort_order, guest_visible, status)
VALUES
  ('8eda0004-0001-0000-0000-000000000001',
   '1eda0001-0000-0000-0000-000000000002', NULL,
   'Loloan Beach Club', 'beach',
   'Sunset spot with cocktails, 10 min by scooter.',
   'Pantai Berawa, Bali', '4.2 km', '10 min by scooter',
   10, true, 'active'),
  ('8eda0004-0001-0000-0000-000000000002',
   '1eda0001-0000-0000-0000-000000000002', NULL,
   'Crate Café', 'cafe',
   'Best brunch in Canggu — book ahead.',
   'Jl. Canggu Padang Linjong, Canggu',
   '2.0 km', '5 min by scooter', 20, true, 'active'),
  ('8eda0004-0001-0000-0000-000000000003',
   '1eda0001-0000-0000-0000-000000000002', NULL,
   'Pepito Market', 'supermarket',
   'Wide selection, open daily 07:00–22:00.',
   'Jl. Raya Berawa, Canggu', '0.9 km', '3 min by scooter',
   30, true, 'active'),
  ('8eda0004-0001-0000-0000-000000000004',
   '1eda0001-0000-0000-0000-000000000002', NULL,
   'La Brisa', 'restaurant',
   'Beachfront seafood + Mediterranean.',
   'Jl. Pantai Batu Mejan, Canggu',
   '3.6 km', '9 min by scooter', 40, true, 'active'),
  ('8eda0004-0001-0000-0000-000000000005',
   '1eda0001-0000-0000-0000-000000000002', NULL,
   'Kimpura Bali Pharmacy', 'pharmacy',
   '24-hour pharmacy — covers most needs.',
   'Jl. Raya Canggu, Canggu', '1.4 km',
   '4 min by scooter', 50, true, 'active')
ON CONFLICT DO NOTHING;

-- 9E.5 — A guest stay token bound to the seeded "ARC-A-00238" (Enso S2)
-- booking. Token plaintext is documented in README — never persisted.
DO $$
DECLARE
  booking_target uuid := '1eda0007-0000-0000-0000-000000000003';
  villa_target  uuid;
  token_id      uuid := '8eda0005-0001-0000-0000-000000000001';
  lock_id       uuid := '8eda0006-0001-0000-0000-000000000001';
BEGIN
  SELECT villa_id INTO villa_target FROM bookings WHERE id = booking_target LIMIT 1;
  IF villa_target IS NULL THEN
    RETURN;
  END IF;

  INSERT INTO guest_stay_tokens
    (id, booking_id, token_hash, token_prefix, status,
     issued_to_email, expires_at)
  VALUES
    (token_id,
     booking_target,
     '8b7026566e4d7e161f1cf40d181961986f9a7d6f4baa4f3365cf18568c21b54e',
     'arconiqu',
     'active',
     'guest+demo@arconique.com',
     now() + interval '14 days')
  ON CONFLICT (id) DO NOTHING;

  -- Smart-lock stub for the same booking — code is deterministic from
  -- (booking_id, villa_id) and pre-computed for the seed:
  --   sha256("stub-lock:" + booking_id + ":" + villa_id)[0..3] mod 1e6
  -- For booking_id=1eda0007-…003 / villa_id=ES-S2 (1eda0002-…011) → 903754.
  INSERT INTO smart_lock_access_codes
    (id, booking_id, villa_id, code_display, valid_from, valid_until,
     status, source)
  SELECT
    lock_id,
    b.id,
    b.villa_id,
    '903754',
    (b.check_in::timestamptz - interval '24 hours'),
    (b.check_out::timestamptz + interval '3 hours'),
    'active',
    'stub'
    FROM bookings b
   WHERE b.id = booking_target
  ON CONFLICT DO NOTHING;
END $$;

-- 9E.6 — Notification template for guest service requests.
INSERT INTO notification_templates
  (id, template_key, channel, subject_template, body_template, html_template, status)
VALUES
  ('8eda0007-0001-0000-0000-000000000001',
   'guest_stay.service_request_created', 'in_app',
   'Guest service request',
   '{{title}}',
   NULL, 'active')
ON CONFLICT (id) DO NOTHING;

-- =============================================================================
-- V9F — Guest services catalog seed.
-- =============================================================================

-- 9F.1 — Categories
INSERT INTO guest_service_categories
  (id, key, name, description, icon, sort_order, status)
VALUES
  ('9f000001-0000-0000-0000-000000000001', 'transport',  'Transport',     'Airport transfers, drivers, scooters', 'Car',         10, 'active'),
  ('9f000001-0000-0000-0000-000000000002', 'wellness',   'Wellness',      'In-villa massages, yoga, breath sessions', 'Sparkles', 20, 'active'),
  ('9f000001-0000-0000-0000-000000000003', 'food',       'Food & drink',  'Private chef, breakfasts, groceries', 'Utensils',    30, 'active'),
  ('9f000001-0000-0000-0000-000000000004', 'experiences','Experiences',   'Boats, surf, rice-paddy walks', 'Compass',           40, 'active'),
  ('9f000001-0000-0000-0000-000000000005', 'housekeeping','Housekeeping', 'Extra cleaning, laundry, linen swaps', 'Brush',     50, 'active'),
  ('9f000001-0000-0000-0000-000000000006', 'stay',       'Stay extras',   'Late checkout, early check-in, extra night', 'Clock', 60, 'active'),
  ('9f000001-0000-0000-0000-000000000007', 'concierge',  'Concierge',     'Anything else — quote on request', 'Bell',           70, 'active')
ON CONFLICT (id) DO NOTHING;

-- 9F.2 — Catalog services. Mix of global, project-scoped, and villa-scoped to
-- exercise the resolver. Project = Enso (1eda0001-…0002). Villa = Enso S2.
INSERT INTO guest_services
  (id, category_id, project_id, villa_id, service_key, name,
   short_description, description_md, service_type, pricing_model,
   base_price_minor, internal_cost_minor, currency,
   requires_date, requires_time, requires_guest_count,
   requires_admin_confirmation, allow_multiple_days,
   min_quantity, max_quantity, lead_time_hours,
   cancellation_policy_md, guest_visible, status, sort_order)
VALUES
  -- Global services (no project, no villa)
  ('9f000002-0000-0000-0000-000000000001',
   '9f000001-0000-0000-0000-000000000001', NULL, NULL,
   'airport-transfer', 'Airport transfer (DPS)',
   'Air-conditioned car, meet-and-greet at arrivals',
   'Door-to-door transfer to / from Ngurah Rai airport. Maximum 4 passengers + luggage.',
   'transfer', 'fixed',
   2500000, 1700000, 'IDR',
   true, true, false, true, false,
   1, 4, 6,
   'Free cancellation up to 12 h before pickup.',
   true, 'active', 10),
  ('9f000002-0000-0000-0000-000000000002',
   '9f000001-0000-0000-0000-000000000002', NULL, NULL,
   'in-villa-massage', 'In-villa massage',
   '60 or 90-minute treatment, certified therapists',
   'A licensed therapist arrives with table, oils, and music. Add-ons available.',
   'massage', 'per_person',
   60000, 38000, 'USD',
   true, true, true, true, false,
   1, 6, 4,
   'Free cancellation up to 4 h before slot.',
   true, 'active', 20),
  ('9f000002-0000-0000-0000-000000000003',
   '9f000001-0000-0000-0000-000000000003', NULL, NULL,
   'private-chef-dinner', 'Private chef · dinner',
   'Three- or four-course tasting menu, in-villa',
   'Plant-forward Indonesian/Mediterranean menu. Wine pairing on request.',
   'chef', 'per_person',
   95000, 60000, 'USD',
   true, true, true, true, false,
   2, 12, 24,
   '50% charge if cancelled within 24 h of service.',
   true, 'active', 30),
  ('9f000002-0000-0000-0000-000000000004',
   '9f000001-0000-0000-0000-000000000003', NULL, NULL,
   'breakfast-basket', 'Daily breakfast',
   'Fresh fruit, pastries, coffee delivered each morning',
   'Delivered between 07:30 and 09:00. Quantity = number of mornings.',
   'breakfast', 'per_day',
   18000, 10000, 'USD',
   true, false, true, false, true,
   1, 14, 12,
   'Cancel any morning before 21:00 the night before.',
   true, 'active', 40),
  ('9f000002-0000-0000-0000-000000000005',
   '9f000001-0000-0000-0000-000000000004', NULL, NULL,
   'sunset-cruise', 'Sunset catamaran',
   'Private 2-hour catamaran cruise from Sanur',
   'Includes light bites and one drink each. Up to 8 guests.',
   'experience', 'quote_required',
   0, 0, 'USD',
   true, true, true, true, false,
   1, 8, 48,
   'Quote depends on date and number of guests.',
   true, 'active', 50),
  ('9f000002-0000-0000-0000-000000000006',
   '9f000001-0000-0000-0000-000000000005', NULL, NULL,
   'extra-cleaning', 'Mid-stay deep clean',
   'Extra deep clean by housekeeping team',
   'Two staff for two hours. Schedule any time during your stay.',
   'housekeeping', 'fixed',
   45000, 22000, 'USD',
   true, true, false, true, false,
   1, 5, 12,
   NULL, true, 'active', 60),
  ('9f000002-0000-0000-0000-000000000007',
   '9f000001-0000-0000-0000-000000000005', NULL, NULL,
   'laundry-bag', 'Laundry service',
   'Wash, dry, fold — back within 24 h',
   'Per bag (≤ 5 kg). Delicates handled separately.',
   'laundry', 'per_item',
   12000, 5500, 'USD',
   false, false, false, false, false,
   1, 6, 24,
   NULL, true, 'active', 70),
  ('9f000002-0000-0000-0000-000000000008',
   '9f000001-0000-0000-0000-000000000006', NULL, NULL,
   'late-checkout-2pm', 'Late checkout · 2pm',
   'Stay until 14:00 instead of the standard 11:00',
   'Subject to availability — confirmed 24 h before.',
   'late_checkout', 'fixed',
   5000000, 0, 'IDR',
   false, false, false, true, false,
   1, 1, 24,
   NULL, true, 'active', 80),
  ('9f000002-0000-0000-0000-000000000009',
   '9f000001-0000-0000-0000-000000000006', NULL, NULL,
   'early-checkin-9am', 'Early check-in · 9am',
   'Drop bags / shower from 09:00',
   'Subject to villa readiness on the day.',
   'early_checkin', 'free',
   0, 0, 'USD',
   false, false, false, true, false,
   1, 1, 12,
   NULL, true, 'active', 90),
  -- Project-scoped (Enso): special breakfast for the project
  ('9f000002-0000-0000-0000-000000000010',
   '9f000001-0000-0000-0000-000000000003',
   '1eda0001-0000-0000-0000-000000000002', NULL,
   'enso-signature-breakfast', 'Enso signature breakfast',
   'Project-only breakfast spread, served on the deck',
   'Includes the chef''s special pancake stack and house-made granola.',
   'breakfast', 'per_day',
   28000, 14000, 'USD',
   true, false, true, true, true,
   1, 14, 12,
   NULL, true, 'active', 35),
  -- Villa-scoped override (Enso S2): premium private chef rate
  ('9f000002-0000-0000-0000-000000000011',
   '9f000001-0000-0000-0000-000000000003',
   NULL, '1eda0002-0000-0000-0000-000000000011',
   'private-chef-dinner', 'Private chef · dinner (S2)',
   'S2-only premium tasting menu by the villa''s preferred chef',
   'This villa''s row overrides the global private-chef-dinner.',
   'chef', 'per_person',
   125000, 75000, 'USD',
   true, true, true, true, false,
   2, 10, 24,
   NULL, true, 'active', 30),
  -- Concierge open-ended quote
  ('9f000002-0000-0000-0000-000000000012',
   '9f000001-0000-0000-0000-000000000007', NULL, NULL,
   'concierge-quote', 'Anything else',
   'Tell us what you need — we''ll quote',
   'Use this when nothing else fits. We follow up with options + price.',
   'other', 'quote_required',
   0, 0, 'USD',
   false, false, false, true, false,
   1, 1, NULL,
   NULL, true, 'active', 100)
ON CONFLICT (id) DO NOTHING;

-- 9F.3 — Service options
INSERT INTO guest_service_options
  (id, service_id, option_key, label, description,
   price_delta_minor, internal_cost_delta_minor,
   is_default, sort_order, status)
VALUES
  -- Massage durations
  ('9f000003-0000-0000-0000-000000000001',
   '9f000002-0000-0000-0000-000000000002',
   '60min', '60 minutes', 'Standard length',
   0, 0, true, 10, 'active'),
  ('9f000003-0000-0000-0000-000000000002',
   '9f000002-0000-0000-0000-000000000002',
   '90min', '90 minutes', 'Extended bodywork',
   30000, 18000, false, 20, 'active'),
  -- Chef menus (global)
  ('9f000003-0000-0000-0000-000000000003',
   '9f000002-0000-0000-0000-000000000003',
   '3course', '3-course menu', NULL,
   0, 0, true, 10, 'active'),
  ('9f000003-0000-0000-0000-000000000004',
   '9f000002-0000-0000-0000-000000000003',
   '4course', '4-course menu', 'Adds an amuse-bouche course',
   25000, 15000, false, 20, 'active'),
  -- Chef menus (Enso S2 override)
  ('9f000003-0000-0000-0000-000000000005',
   '9f000002-0000-0000-0000-000000000011',
   '3course', '3-course tasting', NULL,
   0, 0, true, 10, 'active'),
  ('9f000003-0000-0000-0000-000000000006',
   '9f000002-0000-0000-0000-000000000011',
   '5course', '5-course tasting', 'Wine pairing optional, billed separately',
   45000, 28000, false, 20, 'active'),
  -- Airport transfer · airport pickup vs hotel transfer
  ('9f000003-0000-0000-0000-000000000007',
   '9f000002-0000-0000-0000-000000000001',
   'arrival', 'Arrival pickup', 'Meet at DPS arrivals',
   0, 0, true, 10, 'active'),
  ('9f000003-0000-0000-0000-000000000008',
   '9f000002-0000-0000-0000-000000000001',
   'departure', 'Departure dropoff', 'From villa to DPS',
   0, 0, false, 20, 'active')
ON CONFLICT (id) DO NOTHING;

-- 9F.4 — Sample orders bound to the existing Enso S2 demo booking.
-- Defensive guard: depends on the v9E guest_stay_tokens row at
-- 8eda0005-0001-…001 (created in the DO block above, conditional on the
-- ARC-A-00238 booking existing). If that row is missing, skip the
-- whole block — every order INSERT below carries a non-nullable
-- guest_stay_token_id FK and would otherwise fail loudly.
DO $$
DECLARE
  booking_target uuid := '1eda0007-0000-0000-0000-000000000003';
  villa_target   uuid := '1eda0002-0000-0000-0000-000000000011';
  project_target uuid := '1eda0001-0000-0000-0000-000000000002';
  token_id       uuid := '8eda0005-0001-0000-0000-000000000001';
BEGIN
  IF NOT EXISTS (SELECT 1 FROM guest_stay_tokens WHERE id = token_id) THEN
    RAISE NOTICE 'Skipping guest_service_orders demo seed — prerequisite guest_stay_tokens row % missing.', token_id;
    RETURN;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM bookings WHERE id = booking_target) THEN
    RAISE NOTICE 'Skipping guest_service_orders demo seed — prerequisite bookings row % missing.', booking_target;
    RETURN;
  END IF;

  -- Order 1 — `requested` breakfast, 4 mornings × 2 guests at $28/day → $112
  INSERT INTO guest_service_orders
    (id, order_code, guest_stay_token_id, booking_id, villa_id, project_id,
     service_id, requested_date, requested_time, quantity, guest_count,
     guest_note, status,
     guest_price_minor, internal_cost_minor, margin_minor, currency,
     requires_admin_confirmation,
     finance_bridge_status)
  VALUES
    ('9f000004-0000-0000-0000-000000000001',
     'GSO-20260427-0001',
     token_id, booking_target, villa_target, project_target,
     '9f000002-0000-0000-0000-000000000010',
     '2026-04-29', NULL, 4, 2,
     'Strong coffee please, no nuts', 'requested',
     11200, 5600, 5600, 'USD',
     true, 'pending')
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO guest_service_order_events
    (order_id, event_type, actor_type, message)
  VALUES
    ('9f000004-0000-0000-0000-000000000001', 'created', 'guest',
     'Submitted from /stay/[token]/services')
  ON CONFLICT DO NOTHING;

  -- Order 2 — `confirmed` 90-min couple massage, $90 × 2 = $180
  INSERT INTO guest_service_orders
    (id, order_code, guest_stay_token_id, booking_id, villa_id, project_id,
     service_id, selected_option_id,
     requested_date, requested_time, quantity, guest_count,
     status, guest_price_minor, internal_cost_minor, margin_minor, currency,
     requires_admin_confirmation, finance_bridge_status, confirmed_at)
  VALUES
    ('9f000004-0000-0000-0000-000000000002',
     'GSO-20260427-0002',
     token_id, booking_target, villa_target, project_target,
     '9f000002-0000-0000-0000-000000000002',
     '9f000003-0000-0000-0000-000000000002',
     '2026-04-29', '17:00', 1, 2,
     'confirmed',
     18000, 11200, 6800, 'USD',
     true, 'pending', now())
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO guest_service_order_events
    (order_id, event_type, actor_type, message)
  VALUES
    ('9f000004-0000-0000-0000-000000000002', 'created', 'guest', NULL),
    ('9f000004-0000-0000-0000-000000000002', 'confirmed', 'system', 'Auto-confirmed by demo seed')
  ON CONFLICT DO NOTHING;

  -- Order 3 — `fulfilled` airport transfer, IDR 2,500,000 — auto-bridge target
  INSERT INTO guest_service_orders
    (id, order_code, guest_stay_token_id, booking_id, villa_id, project_id,
     service_id, selected_option_id,
     requested_date, requested_time, quantity,
     status, guest_price_minor, internal_cost_minor, margin_minor, currency,
     requires_admin_confirmation, finance_bridge_status,
     confirmed_at, fulfilled_at)
  VALUES
    ('9f000004-0000-0000-0000-000000000003',
     'GSO-20260427-0003',
     token_id, booking_target, villa_target, project_target,
     '9f000002-0000-0000-0000-000000000001',
     '9f000003-0000-0000-0000-000000000007',
     '2026-04-25', '14:00', 1,
     'fulfilled',
     2500000, 1700000, 800000, 'IDR',
     true, 'bridged', now() - interval '3 days', now() - interval '2 days')
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO guest_service_order_events
    (order_id, event_type, actor_type, message)
  VALUES
    ('9f000004-0000-0000-0000-000000000003', 'created', 'guest', NULL),
    ('9f000004-0000-0000-0000-000000000003', 'confirmed', 'staff', NULL),
    ('9f000004-0000-0000-0000-000000000003', 'fulfilled', 'staff', 'Driver confirmed dropoff')
  ON CONFLICT DO NOTHING;

  -- Insert the matching revenue line for the bridged order so the demo
  -- finance dashboards reflect the bridge.
  INSERT INTO revenue_lines
    (id, booking_id, villa_id, project_id, revenue_type, description,
     amount_minor, currency, service_date, earned_at, source, source_reference,
     visibility, status)
  VALUES
    ('9f000005-0000-0000-0000-000000000003',
     booking_target, villa_target, project_target,
     'guest_service', 'Guest service · GSO-20260427-0003',
     2500000, 'IDR',
     '2026-04-25',
     now() - interval '2 days',
     'guest_service_order', 'GSO-20260427-0003',
     'internal', 'posted')
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO guest_service_finance_links
    (id, order_id, revenue_line_id, status, amount_minor, currency, reason)
  VALUES
    ('9f000006-0000-0000-0000-000000000003',
     '9f000004-0000-0000-0000-000000000003',
     '9f000005-0000-0000-0000-000000000003',
     'bridged', 2500000, 'IDR', 'auto on fulfilment')
  ON CONFLICT (id) DO NOTHING;

  UPDATE guest_service_orders
     SET linked_revenue_line_id = '9f000005-0000-0000-0000-000000000003'
   WHERE id = '9f000004-0000-0000-0000-000000000003';

  -- Order 4 — `requested` quote-required sunset cruise (no price yet)
  INSERT INTO guest_service_orders
    (id, order_code, guest_stay_token_id, booking_id, villa_id, project_id,
     service_id, requested_date, requested_time, quantity, guest_count,
     guest_note, status,
     guest_price_minor, internal_cost_minor, margin_minor, currency,
     requires_admin_confirmation, finance_bridge_status)
  VALUES
    ('9f000004-0000-0000-0000-000000000004',
     'GSO-20260427-0004',
     token_id, booking_target, villa_target, project_target,
     '9f000002-0000-0000-0000-000000000005',
     '2026-04-30', '17:30', 1, 6,
     'Anniversary trip — please surprise us', 'requested',
     0, NULL, NULL, 'USD',
     true, 'pending')
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO guest_service_order_events
    (order_id, event_type, actor_type, message)
  VALUES
    ('9f000004-0000-0000-0000-000000000004', 'created', 'guest',
     'Quote required — operator follow-up needed')
  ON CONFLICT DO NOTHING;
END $$;

-- 9F.5 — Notification templates for the v9F lifecycle.
INSERT INTO notification_templates
  (id, template_key, channel, subject_template, body_template, html_template, status)
VALUES
  ('8eda0008-0001-0000-0000-000000000001',
   'guest_service_order.created', 'in_app',
   'New guest service order',
   '{{title}}',
   NULL, 'active'),
  ('8eda0008-0001-0000-0000-000000000002',
   'guest_service_order.confirmed', 'in_app',
   'Service confirmed',
   '{{title}}',
   NULL, 'active'),
  ('8eda0008-0001-0000-0000-000000000003',
   'guest_service_order.scheduled', 'in_app',
   'Service scheduled',
   '{{title}}',
   NULL, 'active'),
  ('8eda0008-0001-0000-0000-000000000004',
   'guest_service_order.fulfilled', 'in_app',
   'Service fulfilled',
   '{{title}}',
   NULL, 'active'),
  ('8eda0008-0001-0000-0000-000000000005',
   'guest_service_order.cancelled', 'in_app',
   'Service cancelled',
   '{{title}}',
   NULL, 'active'),
  ('8eda0008-0001-0000-0000-000000000006',
   'guest_service_order.rejected', 'in_app',
   'Service rejected',
   '{{title}}',
   NULL, 'active')
ON CONFLICT (id) DO NOTHING;

-- =============================================================================
-- V9G — Guest stay security: encryption key bootstrap + notification templates.
-- The migration helper (`migratePlaintextWifiPasswords`) encrypts the v9E
-- seeded plaintext rows in-place at runtime. We can't pre-bake ciphertext into
-- the seed because the AES-256-GCM blob depends on the runtime KMS secret.
-- =============================================================================
INSERT INTO wifi_encryption_keys
  (id, key_version, encrypted_data_key, status)
VALUES
  ('9f000010-0000-0000-0000-000000000001', 1, 'scrypt-v1', 'active')
ON CONFLICT (key_version) DO NOTHING;

INSERT INTO notification_templates
  (id, template_key, channel, subject_template, body_template, html_template, status)
VALUES
  ('8eda0009-0001-0000-0000-000000000001',
   'guest_stay.verification_code', 'email',
   'Your stay verification code',
   '{{title}}',
   NULL, 'active'),
  ('8eda0009-0001-0000-0000-000000000002',
   'guest_stay.verification_code', 'sms',
   'Stay verification code',
   '{{title}}',
   NULL, 'active'),
  ('8eda0009-0001-0000-0000-000000000003',
   'guest_stay.security_alert', 'in_app',
   'Stay security alert',
   '{{title}}',
   NULL, 'active'),
  ('8eda0009-0001-0000-0000-000000000004',
   'guest_stay.link_verified', 'in_app',
   'Stay link verified',
   '{{title}}',
   NULL, 'active')
ON CONFLICT (id) DO NOTHING;

-- =============================================================================
-- V9H — Guest AI concierge: notification template for the conservative
-- safety-attention path. AI never auto-creates service requests; the
-- queue only fires for explicit safety-related intents (unsafe activity
-- or "ask AI to call staff"). Dedupe key includes the session + intent
-- so the same misclassification doesn't spam the inbox.
-- =============================================================================
INSERT INTO notification_templates
  (id, template_key, channel, subject_template, body_template, html_template, status)
VALUES
  ('8eda000a-0001-0000-0000-000000000001',
   'guest_ai.safety_attention', 'in_app',
   'Concierge AI flagged a safety-related question',
   '{{title}}',
   NULL, 'active')
ON CONFLICT (id) DO NOTHING;

-- =============================================================================
-- V9I — Guest concierge handoff notification templates.
-- The handoff action queues `guest_ai.handoff_created` for normal/high
-- priority and `guest_ai.handoff_urgent` for `urgent`. The
-- `_resolved_guest` template is reserved for future v9J guest-side
-- delivery; v9I keeps guest status in-portal only.
-- =============================================================================
INSERT INTO notification_templates
  (id, template_key, channel, subject_template, body_template, html_template, status)
VALUES
  ('8eda000b-0001-0000-0000-000000000001',
   'guest_ai.handoff_created', 'in_app',
   'New guest concierge handoff',
   '{{title}}',
   NULL, 'active'),
  ('8eda000b-0001-0000-0000-000000000002',
   'guest_ai.handoff_urgent', 'in_app',
   'URGENT — guest concierge handoff',
   '{{title}}',
   NULL, 'active'),
  ('8eda000b-0001-0000-0000-000000000003',
   'guest_ai.handoff_resolved_guest', 'in_app',
   'Your concierge request was resolved',
   '{{title}}',
   NULL, 'active')
ON CONFLICT (id) DO NOTHING;

-- =============================================================================
-- V9J — Concierge handoff reply notifications.
-- The action layer fans out `guest_ai.handoff_reply_guest` to staff
-- when the guest sends a follow-up message. `guest_ai.handoff_reply_staff`
-- is reserved for an in-portal guest inbox surface (v9J keeps guest
-- visibility scoped to /stay/[token]/requests; the template is seeded
-- so future versions can wire it without another migration).
-- =============================================================================
INSERT INTO notification_templates
  (id, template_key, channel, subject_template, body_template, html_template, status)
VALUES
  ('8eda000c-0001-0000-0000-000000000001',
   'guest_ai.handoff_reply_guest', 'in_app',
   'Guest replied to a concierge handoff',
   '{{title}}',
   NULL, 'active'),
  ('8eda000c-0001-0000-0000-000000000002',
   'guest_ai.handoff_reply_staff', 'in_app',
   'Concierge replied — open your stay portal',
   '{{title}}',
   NULL, 'active')
ON CONFLICT (id) DO NOTHING;


-- =============================================================================
-- Prompt 101 — Owner intelligence (calendar preferences, reviews, health
-- snapshots, owner-visible events).
-- All inserts are ON CONFLICT DO UPDATE/NOTHING so the seed remains
-- idempotent. IDs use the 1eda0010-* / 1eda0011-* / 1eda0012-* / 1eda0013-*
-- prefixes for guest_reviews / owner_calendar_preferences /
-- villa_health_snapshots / owner_visible_events respectively.
-- =============================================================================

-- Guest reviews (5 total: positive Enso, neutral Eternal, negative Ahau,
-- one hidden, one direct/internal-survey).
INSERT INTO guest_reviews
  (id, booking_id, guest_id, villa_id, project_id, source,
   reviewer_display_name, reviewer_country,
   rating, cleanliness_rating, communication_rating, location_rating, value_rating,
   text, review_date, owner_visible, public_visible, status, sentiment)
VALUES
  -- Positive Enso review (linked to A. Martin's airbnb stay)
  ('1eda0010-0000-0000-0000-000000000001',
   '1eda0007-0000-0000-0000-000000000001',
   '1eda0006-0000-0000-0000-000000000001',
   '1eda0002-0000-0000-0000-000000000012',
   '1eda0001-0000-0000-0000-000000000002',
   'airbnb', 'A. Martin', 'France',
   4.90, 5.00, 4.80, 4.90, 4.70,
   'Stunning ocean view, spotless villa, the team was incredibly responsive. Already planning to come back next year.',
   '2026-04-30', true, true, 'published', 'positive'),
  -- Neutral Eternal review
  ('1eda0010-0000-0000-0000-000000000002',
   '1eda0007-0000-0000-0000-000000000002',
   '1eda0006-0000-0000-0000-000000000002',
   '1eda0002-0000-0000-0000-000000000003',
   '1eda0001-0000-0000-0000-000000000001',
   'booking_com', 'H. Williams', 'United Kingdom',
   3.80, 4.20, 3.60, 4.00, 3.40,
   'Beautiful rice-field view but the kitchen needs an upgrade. Staff was friendly.',
   '2026-04-30', true, true, 'published', 'neutral'),
  -- Negative Ahau review (visible to owner, hidden from public)
  ('1eda0010-0000-0000-0000-000000000003',
   '1eda0007-0000-0000-0000-000000000005',
   '1eda0006-0000-0000-0000-000000000005',
   '1eda0002-0000-0000-0000-000000000021',
   '1eda0001-0000-0000-0000-000000000003',
   'booking_com', 'Mr. Tanaka', 'Japan',
   2.40, 2.80, 3.40, 3.80, 1.80,
   'Air conditioning failed on the second night. Took too long to repair. Otherwise nice property.',
   '2026-04-26', true, false, 'flagged', 'negative'),
  -- Hidden review (admin-only, owner_visible=false)
  ('1eda0010-0000-0000-0000-000000000004',
   NULL, NULL,
   '1eda0002-0000-0000-0000-000000000010',
   '1eda0001-0000-0000-0000-000000000002',
   'google', 'Anonymous', 'Australia',
   1.80, NULL, NULL, NULL, NULL,
   'Internal triage: review references staff member by name; not surfaced to owner until investigation closes.',
   '2026-04-15', false, false, 'hidden', 'negative'),
  -- Direct internal survey for Eternal S5
  ('1eda0010-0000-0000-0000-000000000005',
   NULL, NULL,
   '1eda0002-0000-0000-0000-000000000003',
   '1eda0001-0000-0000-0000-000000000001',
   'internal_survey', 'Survey response — guest #88', NULL,
   4.40, 4.60, 4.30, 4.50, 4.20,
   'Internal post-stay survey: would book again, recommend wider bedside tables.',
   '2026-04-10', true, false, 'published', 'positive')
ON CONFLICT (id) DO UPDATE SET
  rating = EXCLUDED.rating,
  status = EXCLUDED.status,
  sentiment = EXCLUDED.sentiment,
  text = EXCLUDED.text,
  owner_visible = EXCLUDED.owner_visible,
  public_visible = EXCLUDED.public_visible;

-- Owner calendar preferences for the three demo owners.
-- Emma keeps everything visible; Takeda hides guest names + maintenance
-- detail (privacy-leaning investor); Sonoma defaults are accepted.
INSERT INTO owner_calendar_preferences
  (id, owner_id, default_currency,
   show_guest_names, show_guest_country, show_channel_labels,
   show_maintenance_details, calendar_density)
VALUES
  ('1eda0011-0000-0000-0000-000000000001',
   '1eda0003-0000-0000-0000-000000000001',
   'USD', true, true, true, true, 'comfortable'),
  ('1eda0011-0000-0000-0000-000000000002',
   '1eda0003-0000-0000-0000-000000000002',
   'USD', false, true, true, false, 'compact'),
  ('1eda0011-0000-0000-0000-000000000003',
   '1eda0003-0000-0000-0000-000000000003',
   'USD', true, true, true, true, 'detailed')
ON CONFLICT (id) DO UPDATE SET
  default_currency = EXCLUDED.default_currency,
  show_guest_names = EXCLUDED.show_guest_names,
  show_guest_country = EXCLUDED.show_guest_country,
  show_channel_labels = EXCLUDED.show_channel_labels,
  show_maintenance_details = EXCLUDED.show_maintenance_details,
  calendar_density = EXCLUDED.calendar_density;

-- Villa health snapshots for the three owner-facing villas, period
-- 2026-04-01 .. 2026-04-30.
INSERT INTO villa_health_snapshots
  (id, villa_id, project_id, period_start, period_end,
   occupancy_rate, booked_nights, owner_stay_nights, maintenance_blocked_nights,
   housekeeping_tasks_completed, maintenance_tickets_open, maintenance_tickets_completed,
   preventive_tasks_due, utility_risk_count,
   average_review_rating, negative_review_count,
   reserve_balance_minor, reserve_currency,
   health_score, health_status)
VALUES
  -- Enso S5 — pooled, healthy (Takeda + Sonoma + Emma share via pool)
  ('1eda0012-0000-0000-0000-000000000001',
   '1eda0002-0000-0000-0000-000000000012',
   '1eda0001-0000-0000-0000-000000000002',
   '2026-04-01', '2026-04-30',
   0.7800, 23, 2, 1, 14, 0, 3, 1, 0,
   4.90, 0,
   1250000, 'USD',
   88.40, 'excellent'),
  -- Eternal S5 — Emma 100%, watchful
  ('1eda0012-0000-0000-0000-000000000002',
   '1eda0002-0000-0000-0000-000000000003',
   '1eda0001-0000-0000-0000-000000000001',
   '2026-04-01', '2026-04-30',
   0.6200, 18, 1, 3, 12, 1, 4, 2, 1,
   4.10, 0,
   780000, 'USD',
   72.30, 'good'),
  -- Ahau 02 — Emma 100%, attention (negative review + AC repair window)
  ('1eda0012-0000-0000-0000-000000000003',
   '1eda0002-0000-0000-0000-000000000021',
   '1eda0001-0000-0000-0000-000000000003',
   '2026-04-01', '2026-04-30',
   0.4300, 12, 0, 5, 8, 2, 5, 3, 2,
   2.40, 1,
   320000, 'USD',
   54.10, 'attention')
ON CONFLICT (villa_id, period_start, period_end) DO UPDATE SET
  occupancy_rate = EXCLUDED.occupancy_rate,
  booked_nights = EXCLUDED.booked_nights,
  owner_stay_nights = EXCLUDED.owner_stay_nights,
  maintenance_blocked_nights = EXCLUDED.maintenance_blocked_nights,
  housekeeping_tasks_completed = EXCLUDED.housekeeping_tasks_completed,
  maintenance_tickets_open = EXCLUDED.maintenance_tickets_open,
  maintenance_tickets_completed = EXCLUDED.maintenance_tickets_completed,
  preventive_tasks_due = EXCLUDED.preventive_tasks_due,
  utility_risk_count = EXCLUDED.utility_risk_count,
  average_review_rating = EXCLUDED.average_review_rating,
  negative_review_count = EXCLUDED.negative_review_count,
  reserve_balance_minor = EXCLUDED.reserve_balance_minor,
  reserve_currency = EXCLUDED.reserve_currency,
  health_score = EXCLUDED.health_score,
  health_status = EXCLUDED.health_status,
  generated_at = now();

-- Owner-visible events — projection feed for /owner/calendar.
-- Emma sees: bookings on her villas + housekeeping events + a
-- preventive item + a positive review highlight + reserve top-up notice.
INSERT INTO owner_visible_events
  (id, owner_id, villa_id, project_id, source_type, source_id,
   event_date, event_end_date, title, description, severity, owner_visible, sort_order)
VALUES
  -- Booking on Eternal S5 (H. Williams stay)
  ('1eda0013-0000-0000-0000-000000000001',
   '1eda0003-0000-0000-0000-000000000001',
   '1eda0002-0000-0000-0000-000000000003',
   '1eda0001-0000-0000-0000-000000000001',
   'booking', '1eda0007-0000-0000-0000-000000000002',
   '2026-04-25', '2026-04-30',
   'H. W. — Eternal S5',
   'booking.com · 6 guests · 5 nights',
   'info', true, 10),
  -- Booking on Ahau 02 (Mr. Tanaka, currently checked-in)
  ('1eda0013-0000-0000-0000-000000000002',
   '1eda0003-0000-0000-0000-000000000001',
   '1eda0002-0000-0000-0000-000000000021',
   '1eda0001-0000-0000-0000-000000000003',
   'booking', '1eda0007-0000-0000-0000-000000000005',
   '2026-04-22', '2026-04-26',
   'Guest — Ahau 02',
   'booking.com · 2 guests · 4 nights · checked-in',
   'info', true, 20),
  -- Housekeeping event after H. Williams checkout
  ('1eda0013-0000-0000-0000-000000000003',
   '1eda0003-0000-0000-0000-000000000001',
   '1eda0002-0000-0000-0000-000000000003',
   '1eda0001-0000-0000-0000-000000000001',
   'housekeeping_task', NULL,
   '2026-04-30', NULL,
   'Departure clean — Eternal S5',
   'Linen change, deep clean, restock amenities.',
   'info', true, 30),
  -- Preventive maintenance reminder
  ('1eda0013-0000-0000-0000-000000000004',
   '1eda0003-0000-0000-0000-000000000001',
   '1eda0002-0000-0000-0000-000000000021',
   '1eda0001-0000-0000-0000-000000000003',
   'maintenance_ticket', NULL,
   '2026-04-29', NULL,
   'AC service follow-up — Ahau 02',
   'Vendor recheck after April unit replacement.',
   'warning', true, 40),
  -- Owner-visible positive review highlight
  ('1eda0013-0000-0000-0000-000000000005',
   '1eda0003-0000-0000-0000-000000000001',
   '1eda0002-0000-0000-0000-000000000003',
   '1eda0001-0000-0000-0000-000000000001',
   'review', '1eda0010-0000-0000-0000-000000000005',
   '2026-04-10', NULL,
   'Internal survey — 4.4/5',
   'Guest would book again; suggested wider bedside tables.',
   'success', true, 50),
  -- Reserve top-up notice
  ('1eda0013-0000-0000-0000-000000000006',
   '1eda0003-0000-0000-0000-000000000001',
   '1eda0002-0000-0000-0000-000000000003',
   '1eda0001-0000-0000-0000-000000000001',
   'reserve', NULL,
   '2026-04-15', NULL,
   'Reserve top-up — Eternal S5',
   'USD 250.00 added to villa reserve from April distribution.',
   'success', true, 60),
  -- Cross-owner — Takeda sees Enso pool booking
  ('1eda0013-0000-0000-0000-000000000007',
   '1eda0003-0000-0000-0000-000000000002',
   '1eda0002-0000-0000-0000-000000000012',
   '1eda0001-0000-0000-0000-000000000002',
   'booking', '1eda0007-0000-0000-0000-000000000001',
   '2026-04-26', '2026-04-30',
   'Enso S5 — pool booking',
   'airbnb · 4 guests · 4 nights',
   'info', true, 70),
  -- Sonoma sees the same Enso pool booking
  ('1eda0013-0000-0000-0000-000000000008',
   '1eda0003-0000-0000-0000-000000000003',
   '1eda0002-0000-0000-0000-000000000012',
   '1eda0001-0000-0000-0000-000000000002',
   'booking', '1eda0007-0000-0000-0000-000000000001',
   '2026-04-26', '2026-04-30',
   'Enso S5 — pool booking',
   'airbnb · 4 guests · 4 nights',
   'info', true, 80)
ON CONFLICT (id) DO UPDATE SET
  title = EXCLUDED.title,
  description = EXCLUDED.description,
  severity = EXCLUDED.severity,
  owner_visible = EXCLUDED.owner_visible,
  sort_order = EXCLUDED.sort_order;

-- =============================================================================
-- Prompt 102 — Guest Journey Automation.
-- Notification templates, 8 demo journey rules, sample suggestions /
-- events / review requests for the demo Enso S5 booking.
-- =============================================================================

-- Notification templates — in-app body templates. Channel rules use
-- these keys when the runner queues a notification.
INSERT INTO notification_templates
  (id, template_key, channel, subject_template, body_template, html_template, status)
VALUES
  ('8eda0024-0001-0000-0000-000000000001',
   'guest_journey.pre_arrival_guide', 'in_app',
   'Your villa guide is ready',
   'Open your guide for Wi-Fi, doors, and neighbourhood tips.',
   NULL, 'active'),
  ('8eda0024-0001-0000-0000-000000000002',
   'guest_journey.airport_transfer_suggestion', 'in_app',
   'Need airport pickup?',
   'Book a meet-and-greet driver — flat rate, English-speaking.',
   NULL, 'active'),
  ('8eda0024-0001-0000-0000-000000000003',
   'guest_journey.arrival_day_checkin', 'in_app',
   'Arriving today — open check-in',
   'Tap to reveal your door code (logged for safety).',
   NULL, 'active'),
  ('8eda0024-0001-0000-0000-000000000004',
   'guest_journey.in_stay_restaurant_suggestion', 'in_app',
   'Tonight in {{villa_label}}',
   'Concierge picks for dinner tonight, hand-curated.',
   NULL, 'active'),
  ('8eda0024-0001-0000-0000-000000000005',
   'guest_journey.breakfast_suggestion', 'in_app',
   'Add breakfast tomorrow',
   'Tropical breakfast set up at your villa each morning.',
   NULL, 'active'),
  ('8eda0024-0001-0000-0000-000000000006',
   'guest_journey.late_checkout_offer', 'in_app',
   'Need a later checkout?',
   'Subject to next booking — we''ll confirm within 30 minutes.',
   NULL, 'active'),
  ('8eda0024-0001-0000-0000-000000000007',
   'guest_journey.checkout_thank_you', 'in_app',
   'Thanks for staying with us',
   'Hope your trip went well. Open the stay portal one last time for your review link.',
   NULL, 'active'),
  ('8eda0024-0001-0000-0000-000000000008',
   'guest_journey.review_request_direct', 'in_app',
   'How was your stay?',
   'Two questions, under a minute. Your feedback shapes our next month.',
   NULL, 'active'),
  ('8eda0024-0001-0000-0000-000000000009',
   'guest_journey.review_request_ota', 'in_app',
   'Loved your stay? Leave a review',
   'OTA review — a quick rating helps your hosts a lot.',
   NULL, 'active'),
  ('8eda0024-0001-0000-0000-00000000000a',
   'guest_journey.review_reminder', 'in_app',
   'A quick reminder',
   'Your review surface is still open if you have a minute.',
   NULL, 'active'),
  ('8eda0024-0001-0000-0000-00000000000b',
   'guest_journey.in_app_suggestion', 'in_app',
   '{{title}}',
   '{{body}}',
   NULL, 'active')
ON CONFLICT (id) DO UPDATE SET
  body_template = EXCLUDED.body_template,
  status = EXCLUDED.status;

-- Eight demo journey rules covering the documented stages.
INSERT INTO guest_journey_rules
  (id, rule_key, name, description,
   journey_stage, trigger_anchor, offset_minutes, channel, template_key,
   suggestion_type, service_id, applies_to_channel, priority, status)
VALUES
  ('8eda0024-0002-0000-0000-000000000001',
   'pre_arrival_guide_d-7',
   'Pre-arrival villa guide (-7d)',
   'Show the villa guide CTA seven days before check-in so guests can plan.',
   'pre_arrival', 'check_in', -7 * 24 * 60, 'in_app',
   'guest_journey.pre_arrival_guide', 'guide', NULL, 'any', 'normal', 'active'),
  ('8eda0024-0002-0000-0000-000000000002',
   'airport_transfer_d-5',
   'Airport transfer suggestion (-5d)',
   'Offer airport pickup five days before check-in.',
   'pre_arrival', 'check_in', -5 * 24 * 60, 'in_app',
   'guest_journey.airport_transfer_suggestion', 'airport_transfer',
   '9f000002-0000-0000-0000-000000000001', 'any', 'normal', 'active'),
  ('8eda0024-0002-0000-0000-000000000003',
   'arrival_day_checkin_h-8',
   'Arrival day check-in nudge (-8h)',
   'Remind the guest 8 hours before check-in to open the check-in flow.',
   'arrival_day', 'check_in', -8 * 60, 'in_app',
   'guest_journey.arrival_day_checkin', 'guide', NULL, 'any', 'high', 'active'),
  ('8eda0024-0002-0000-0000-000000000004',
   'in_stay_restaurant_d+0_h+6',
   'First evening restaurant pick (+6h)',
   'Restaurant suggestion 6 hours after check-in, while plans are still flexible.',
   'in_stay', 'check_in', 6 * 60, 'in_app',
   'guest_journey.in_stay_restaurant_suggestion', 'restaurant', NULL, 'any',
   'normal', 'active'),
  ('8eda0024-0002-0000-0000-000000000005',
   'in_stay_breakfast_d+1',
   'Breakfast suggestion (+1d)',
   'Offer breakfast service one day into the stay.',
   'in_stay', 'check_in', 1 * 24 * 60, 'in_app',
   'guest_journey.breakfast_suggestion', 'breakfast',
   '9f000002-0000-0000-0000-000000000004', 'any', 'normal', 'active'),
  ('8eda0024-0002-0000-0000-000000000006',
   'in_stay_chef_massage_d+2',
   'Private chef + massage (+2d)',
   'Mid-stay luxury suggestion combining chef + massage upsell.',
   'in_stay', 'check_in', 2 * 24 * 60, 'in_app',
   'guest_journey.in_stay_restaurant_suggestion', 'private_chef',
   '9f000002-0000-0000-0000-000000000003', 'any', 'normal', 'active'),
  ('8eda0024-0002-0000-0000-000000000007',
   'pre_checkout_late_d-1',
   'Late checkout offer (-1d)',
   'Surface late-checkout the day before checkout — subject to next booking.',
   'pre_checkout', 'check_out', -1 * 24 * 60, 'in_app',
   'guest_journey.late_checkout_offer', 'late_checkout', NULL, 'any',
   'normal', 'active'),
  ('8eda0024-0002-0000-0000-000000000008',
   'post_stay_review_d+1',
   'Post-stay review request (+1d)',
   'Trigger the review request 24h after checkout — channel routed by booking.',
   'post_stay', 'check_out', 1 * 24 * 60, 'in_app',
   'guest_journey.review_request_direct', 'review_request', NULL, 'any',
   'normal', 'active')
ON CONFLICT (rule_key) DO UPDATE SET
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  journey_stage = EXCLUDED.journey_stage,
  trigger_anchor = EXCLUDED.trigger_anchor,
  offset_minutes = EXCLUDED.offset_minutes,
  channel = EXCLUDED.channel,
  template_key = EXCLUDED.template_key,
  suggestion_type = EXCLUDED.suggestion_type,
  service_id = EXCLUDED.service_id,
  applies_to_channel = EXCLUDED.applies_to_channel,
  priority = EXCLUDED.priority,
  status = EXCLUDED.status;

-- Three sample suggestions for the demo Enso S5 booking
-- (1eda0007-0000-0000-0000-000000000001) so the /stay/<demo>
-- "Recommended now" panel is non-empty in development.
INSERT INTO guest_journey_suggestions
  (id, booking_id, stay_token_id, rule_id, villa_id, project_id,
   suggestion_type, title, body, cta_label, cta_href,
   service_id, suggested_for, expires_at,
   status, priority, owner_visible)
VALUES
  ('8eda0024-0003-0000-0000-000000000001',
   '1eda0007-0000-0000-0000-000000000001', NULL,
   '8eda0024-0002-0000-0000-000000000002',
   '1eda0002-0000-0000-0000-000000000012',
   '1eda0001-0000-0000-0000-000000000002',
   'airport_transfer',
   'Need airport pickup?',
   'Book a meet-and-greet transfer with our team — flat rate, English-speaking driver.',
   'See transfer options',
   NULL,
   '9f000002-0000-0000-0000-000000000001',
   '2026-04-21 09:00:00+00', '2026-04-30 11:00:00+00',
   'active', 'high', false),
  ('8eda0024-0003-0000-0000-000000000002',
   '1eda0007-0000-0000-0000-000000000001', NULL,
   '8eda0024-0002-0000-0000-000000000005',
   '1eda0002-0000-0000-0000-000000000012',
   '1eda0001-0000-0000-0000-000000000002',
   'breakfast',
   'Add breakfast to your stay',
   'Wake up to a tropical breakfast set up at your villa each morning.',
   'Order breakfast',
   NULL,
   '9f000002-0000-0000-0000-000000000004',
   '2026-04-27 06:00:00+00', '2026-04-30 11:00:00+00',
   'active', 'normal', false),
  ('8eda0024-0003-0000-0000-000000000003',
   '1eda0007-0000-0000-0000-000000000001', NULL,
   '8eda0024-0002-0000-0000-000000000007',
   '1eda0002-0000-0000-0000-000000000012',
   '1eda0001-0000-0000-0000-000000000002',
   'late_checkout',
   'Need a later checkout?',
   'Subject to next booking — we''ll confirm within 30 minutes.',
   'Request late checkout',
   NULL,
   NULL,
   '2026-04-29 06:00:00+00', '2026-04-30 12:00:00+00',
   'active', 'normal', false)
ON CONFLICT (id) DO UPDATE SET
  title = EXCLUDED.title,
  body = EXCLUDED.body,
  status = EXCLUDED.status,
  priority = EXCLUDED.priority,
  expires_at = EXCLUDED.expires_at;

-- Three sample journey events for the same demo booking.
INSERT INTO guest_journey_events
  (id, booking_id, stay_token_id, event_type, source_type, source_id,
   title, description, severity, owner_visible)
VALUES
  ('8eda0024-0004-0000-0000-000000000001',
   '1eda0007-0000-0000-0000-000000000001', NULL,
   'token_issued', 'system', NULL,
   'Stay token issued',
   'Stay portal token created and emailed to guest.',
   'info', false),
  ('8eda0024-0004-0000-0000-000000000002',
   '1eda0007-0000-0000-0000-000000000001', NULL,
   'service_suggested', 'rule',
   '8eda0024-0002-0000-0000-000000000002',
   'Airport transfer suggestion',
   'Suggested 5 days before check-in.',
   'info', false),
  ('8eda0024-0004-0000-0000-000000000003',
   '1eda0007-0000-0000-0000-000000000001', NULL,
   'guide_opened', 'guest_action', NULL,
   'Villa guide opened',
   'Guest opened the villa guide.',
   'info', false)
ON CONFLICT (id) DO NOTHING;

-- Two review requests — one for the airbnb stay (OTA route), one for
-- the direct stay (internal_survey route).
INSERT INTO guest_review_requests
  (id, booking_id, guest_id, villa_id, project_id,
   channel, review_target_url, request_stage, status,
   scheduled_for, sent_at)
VALUES
  ('8eda0024-0005-0000-0000-000000000001',
   '1eda0007-0000-0000-0000-000000000001',
   '1eda0006-0000-0000-0000-000000000001',
   '1eda0002-0000-0000-0000-000000000012',
   '1eda0001-0000-0000-0000-000000000002',
   'airbnb',
   'https://www.airbnb.com/trips',
   'initial', 'sent',
   '2026-05-01 08:00:00+00', '2026-05-01 08:01:00+00'),
  ('8eda0024-0005-0000-0000-000000000002',
   '1eda0007-0000-0000-0000-000000000003',
   '1eda0006-0000-0000-0000-000000000004',
   '1eda0002-0000-0000-0000-000000000011',
   '1eda0001-0000-0000-0000-000000000002',
   'internal_survey',
   '/stay/demo/review',
   'initial', 'pending',
   '2026-05-02 08:00:00+00', NULL)
ON CONFLICT (booking_id, channel) DO UPDATE SET
  status = EXCLUDED.status,
  scheduled_for = EXCLUDED.scheduled_for,
  sent_at = EXCLUDED.sent_at;

-- =============================================================================
-- Prompt 103 — Service Fulfilment & Vendor Ops.
-- Notification templates, 8 vendors, vendor↔service mappings, 5
-- demo fulfilments across statuses, 2 invoices, 2 ratings, 1
-- bridged finance link.
-- =============================================================================

-- Notification templates
INSERT INTO notification_templates
  (id, template_key, channel, subject_template, body_template, html_template, status)
VALUES
  ('8eda0025-0001-0000-0000-000000000001',
   'service_fulfilment.order_received', 'in_app',
   'New service request',
   'Triage required for {{fulfilment_code}}.',
   NULL, 'active'),
  ('8eda0025-0001-0000-0000-000000000002',
   'service_fulfilment.vendor_assigned', 'in_app',
   'Vendor assigned',
   'Fulfilment {{fulfilment_code}} routed to {{vendor_name}}.',
   NULL, 'active'),
  ('8eda0025-0001-0000-0000-000000000003',
   'service_fulfilment.vendor_confirmed', 'in_app',
   'Vendor confirmed',
   '{{vendor_name}} accepted {{fulfilment_code}}.',
   NULL, 'active'),
  ('8eda0025-0001-0000-0000-000000000004',
   'service_fulfilment.guest_confirmation_required', 'in_app',
   'Confirm your service',
   'Open the stay portal to confirm or adjust the timing.',
   NULL, 'active'),
  ('8eda0025-0001-0000-0000-000000000005',
   'service_fulfilment.scheduled', 'in_app',
   'Service scheduled',
   'Scheduled — see your stay portal for details.',
   NULL, 'active'),
  ('8eda0025-0001-0000-0000-000000000006',
   'service_fulfilment.eta_updated', 'in_app',
   'ETA updated',
   'Updated arrival time available in your stay portal.',
   NULL, 'active'),
  ('8eda0025-0001-0000-0000-000000000007',
   'service_fulfilment.completed', 'in_app',
   'Service completed',
   'Hope it went well — leave a quick rating from the stay portal.',
   NULL, 'active'),
  ('8eda0025-0001-0000-0000-000000000008',
   'service_fulfilment.cancelled', 'in_app',
   'Service cancelled',
   'Sorry about that — open the stay portal for next steps.',
   NULL, 'active'),
  ('8eda0025-0001-0000-0000-000000000009',
   'service_fulfilment.rating_requested', 'in_app',
   'Rate your service',
   'Two seconds — pick a star count.',
   NULL, 'active'),
  ('8eda0025-0001-0000-0000-00000000000a',
   'service_fulfilment.vendor_invoice_received', 'in_app',
   'Vendor invoice received',
   'Invoice attached to fulfilment {{fulfilment_code}}.',
   NULL, 'active')
ON CONFLICT (id) DO UPDATE SET
  body_template = EXCLUDED.body_template,
  status = EXCLUDED.status;

-- Eight vendors
INSERT INTO service_vendors
  (id, vendor_code, display_name, legal_name, vendor_type, status,
   contact_name, contact_phone, contact_email, preferred_channel,
   service_area, default_currency, internal_notes, rating_average, rating_count)
VALUES
  ('aa000001-0000-0000-0000-000000000001', 'transport-bali',
   'Bali Airport Express', 'PT Bali Airport Express', 'transport', 'active',
   'Made Sutarma', '+62 812 0000 0001', 'ops@baliairport.demo', 'whatsapp',
   'Canggu / Seminyak / Ubud', 'USD',
   'Reliable, English-speaking drivers. Default 2 vehicles available.',
   4.80, 24),
  ('aa000001-0000-0000-0000-000000000002', 'chef-lotus',
   'Lotus Private Chef', NULL, 'chef', 'active',
   'Chef Wayan', '+62 812 0000 0002', 'wayan@lotuschef.demo', 'whatsapp',
   'Canggu', 'USD',
   'Plant-forward menus, 24h notice required.',
   4.90, 18),
  ('aa000001-0000-0000-0000-000000000003', 'breakfast-kitchen',
   'Sunrise Breakfast Kitchen', NULL, 'chef', 'active',
   'Putu Ari', '+62 812 0000 0003', 'orders@sunrise.demo', 'whatsapp',
   'Canggu / Pererenan', 'USD',
   'Daily breakfast service, deliver 07:30–09:00.',
   4.50, 36),
  ('aa000001-0000-0000-0000-000000000004', 'spa-anandi',
   'Anandi Mobile Spa', NULL, 'wellness', 'active',
   'Made Putri', '+62 812 0000 0004', 'book@anandi.demo', 'whatsapp',
   'Bali-wide', 'USD',
   'Licensed therapists, brings own table + oils.',
   4.70, 42),
  ('aa000001-0000-0000-0000-000000000005', 'driver-bali',
   'Bali Day Drivers', NULL, 'transport', 'active',
   'Komang', '+62 812 0000 0005', 'ops@daydrivers.demo', 'phone',
   'Bali-wide', 'USD',
   'Hourly + full-day drivers, English-speaking.',
   4.60, 28),
  ('aa000001-0000-0000-0000-000000000006', 'rental-cars',
   'Bali Auto Rental', NULL, 'rental', 'active',
   'Ketut', '+62 812 0000 0006', 'rentals@baliauto.demo', 'email',
   'Canggu / Denpasar', 'USD',
   'Self-drive + with-driver rentals; insurance included.',
   4.40, 12),
  ('aa000001-0000-0000-0000-000000000007', 'laundry-arconique',
   'Arconique Laundry Partner', NULL, 'laundry', 'active',
   'Wayan', '+62 812 0000 0007', 'ops@arclaundry.demo', 'in_app',
   'Canggu', 'USD',
   'Same-day turnaround under 4kg.',
   4.30, 15),
  ('aa000001-0000-0000-0000-000000000008', 'rental-playstation',
   'GameRent Bali', NULL, 'rental', 'paused',
   'Putu', '+62 812 0000 0008', 'hello@gamerent.demo', 'whatsapp',
   'Canggu', 'USD',
   'PlayStation 5 + select games. Paused while we onboard new SLA.',
   4.10, 8)
ON CONFLICT (vendor_code) DO UPDATE SET
  display_name = EXCLUDED.display_name,
  status = EXCLUDED.status,
  contact_name = EXCLUDED.contact_name,
  internal_notes = EXCLUDED.internal_notes;

-- Vendor ↔ guest_services mappings (link the seeded services to vendors).
INSERT INTO service_vendor_services
  (id, vendor_id, service_id, status, base_cost_minor, currency, lead_time_minutes, notes)
VALUES
  ('aa000002-0000-0000-0000-000000000001',
   'aa000001-0000-0000-0000-000000000001',
   '9f000002-0000-0000-0000-000000000001',
   'active', 1700000, 'IDR', 360,
   'Airport transfer, default vehicle is air-con SUV.'),
  ('aa000002-0000-0000-0000-000000000002',
   'aa000001-0000-0000-0000-000000000004',
   '9f000002-0000-0000-0000-000000000002',
   'active', 38000, 'USD', 240,
   'In-villa massage; bring own equipment.'),
  ('aa000002-0000-0000-0000-000000000003',
   'aa000001-0000-0000-0000-000000000002',
   '9f000002-0000-0000-0000-000000000003',
   'active', 60000, 'USD', 1440,
   'Private chef dinner, 24h notice.'),
  ('aa000002-0000-0000-0000-000000000004',
   'aa000001-0000-0000-0000-000000000003',
   '9f000002-0000-0000-0000-000000000004',
   'active', 10000, 'USD', 720,
   'Daily breakfast — order night before.')
ON CONFLICT (vendor_id, service_id) DO UPDATE SET
  status = EXCLUDED.status,
  base_cost_minor = EXCLUDED.base_cost_minor,
  currency = EXCLUDED.currency,
  lead_time_minutes = EXCLUDED.lead_time_minutes;

-- Five fulfilments — only insert if the corresponding orders exist.
DO $$
DECLARE
  order_breakfast uuid := '9f000004-0000-0000-0000-000000000001';
  order_massage uuid := '9f000004-0000-0000-0000-000000000002';
  order_transfer uuid := '9f000004-0000-0000-0000-000000000003';
BEGIN
  IF EXISTS (SELECT 1 FROM guest_service_orders WHERE id = order_breakfast) THEN
    INSERT INTO guest_service_fulfilments
      (id, order_id, fulfilment_code, vendor_id, status, fulfilment_type,
       scheduled_for, currency, guest_price_minor, internal_cost_minor,
       requires_guest_confirmation)
    VALUES
      ('aa000003-0000-0000-0000-000000000001', order_breakfast,
       'FUL-20260427-0001',
       'aa000001-0000-0000-0000-000000000003',
       'triage', 'vendor',
       '2026-04-28 23:30:00+00', 'USD', 11200, 5600, true)
    ON CONFLICT (order_id) DO NOTHING;
  END IF;
  IF EXISTS (SELECT 1 FROM guest_service_orders WHERE id = order_massage) THEN
    INSERT INTO guest_service_fulfilments
      (id, order_id, fulfilment_code, vendor_id, status, fulfilment_type,
       scheduled_for, currency, guest_price_minor, internal_cost_minor,
       requires_guest_confirmation)
    VALUES
      ('aa000003-0000-0000-0000-000000000002', order_massage,
       'FUL-20260427-0002',
       'aa000001-0000-0000-0000-000000000004',
       'awaiting_vendor', 'vendor',
       '2026-04-29 09:00:00+00', 'USD', 18000, 11200, false)
    ON CONFLICT (order_id) DO NOTHING;
    INSERT INTO guest_service_fulfilments
      (id, order_id, fulfilment_code, vendor_id, status, fulfilment_type,
       scheduled_for, currency, guest_price_minor, internal_cost_minor,
       requires_guest_confirmation, vendor_confirmed_at)
    VALUES
      ('aa000003-0000-0000-0000-000000000003', order_massage,
       'FUL-20260427-0003',
       'aa000001-0000-0000-0000-000000000004',
       'vendor_confirmed', 'vendor',
       '2026-04-29 09:00:00+00', 'USD', 18000, 11200, false, now())
    ON CONFLICT (order_id) DO NOTHING;
  END IF;
  IF EXISTS (SELECT 1 FROM guest_service_orders WHERE id = order_transfer) THEN
    INSERT INTO guest_service_fulfilments
      (id, order_id, fulfilment_code, vendor_id, status, fulfilment_type,
       scheduled_for, currency, guest_price_minor, internal_cost_minor,
       margin_minor, requires_guest_confirmation, vendor_confirmed_at,
       guest_confirmed_at, started_at, completed_at)
    VALUES
      ('aa000003-0000-0000-0000-000000000004', order_transfer,
       'FUL-20260427-0004',
       'aa000001-0000-0000-0000-000000000001',
       'completed', 'vendor',
       '2026-04-26 09:00:00+00', 'USD', 250000, 170000, 80000,
       false, '2026-04-25 10:00:00+00', '2026-04-25 11:00:00+00',
       '2026-04-26 08:30:00+00', '2026-04-26 10:30:00+00')
    ON CONFLICT (order_id) DO NOTHING;
    -- One internal-only fulfilment that's just scheduled.
    INSERT INTO guest_service_fulfilments
      (id, order_id, fulfilment_code, status, fulfilment_type,
       scheduled_for, currency, guest_price_minor, internal_cost_minor,
       requires_guest_confirmation, internal_notes)
    VALUES
      ('aa000003-0000-0000-0000-000000000005', order_transfer,
       'FUL-20260427-0005',
       'scheduled', 'internal',
       '2026-04-30 12:00:00+00', 'USD', 0, 0, false,
       'Reserved fulfilment for late-checkout walkthrough.')
    ON CONFLICT (order_id) DO NOTHING;
  END IF;
END $$;

-- Two vendor invoices on the completed transfer fulfilment.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM guest_service_fulfilments
    WHERE id = 'aa000003-0000-0000-0000-000000000004'
  ) THEN
    INSERT INTO service_vendor_invoices
      (id, fulfilment_id, vendor_id, invoice_number, invoice_status,
       amount_minor, currency, invoice_date, due_date, notes)
    VALUES
      ('aa000004-0000-0000-0000-000000000001',
       'aa000003-0000-0000-0000-000000000004',
       'aa000001-0000-0000-0000-000000000001',
       'INV-2026-0411', 'received',
       170000, 'USD',
       '2026-04-26', '2026-05-10',
       'One pickup + one drop, English-speaking driver.')
    ON CONFLICT (id) DO NOTHING;
    INSERT INTO service_vendor_invoices
      (id, fulfilment_id, vendor_id, invoice_number, invoice_status,
       amount_minor, currency, invoice_date, due_date, notes,
       approved_at, paid_at)
    VALUES
      ('aa000004-0000-0000-0000-000000000002',
       'aa000003-0000-0000-0000-000000000004',
       'aa000001-0000-0000-0000-000000000001',
       'INV-2026-0412', 'paid',
       30000, 'USD',
       '2026-04-26', '2026-05-10',
       'Toll surcharge.', '2026-04-27 09:00:00+00', '2026-04-29 09:00:00+00')
    ON CONFLICT (id) DO NOTHING;
  END IF;
END $$;

-- Two guest ratings on completed fulfilments.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM guest_service_fulfilments
    WHERE id = 'aa000003-0000-0000-0000-000000000004'
  ) THEN
    INSERT INTO guest_service_ratings
      (id, order_id, fulfilment_id, booking_id, vendor_id, rating, comment, sentiment, status)
    SELECT
      'aa000005-0000-0000-0000-000000000001',
      f.order_id, f.id, o.booking_id, f.vendor_id,
      5, 'Driver was waiting at arrivals exactly on time.', 'positive', 'published'
    FROM guest_service_fulfilments f
    JOIN guest_service_orders o ON o.id = f.order_id
    WHERE f.id = 'aa000003-0000-0000-0000-000000000004'
    ON CONFLICT (id) DO NOTHING;
    INSERT INTO guest_service_ratings
      (id, order_id, fulfilment_id, booking_id, vendor_id, rating, comment, sentiment, status)
    SELECT
      'aa000005-0000-0000-0000-000000000002',
      f.order_id, f.id, o.booking_id, f.vendor_id,
      4, 'Could have helped a bit with luggage.', 'neutral', 'published'
    FROM guest_service_fulfilments f
    JOIN guest_service_orders o ON o.id = f.order_id
    WHERE f.id = 'aa000003-0000-0000-0000-000000000004'
    ON CONFLICT (id) DO NOTHING;
  END IF;
END $$;

-- One bridged finance link for the completed transfer.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM guest_service_fulfilments
    WHERE id = 'aa000003-0000-0000-0000-000000000004'
  ) THEN
    INSERT INTO service_fulfilment_finance_links
      (id, fulfilment_id, order_id, status, amount_revenue_minor, amount_expense_minor,
       currency, bridged_at)
    SELECT
      'aa000006-0000-0000-0000-000000000001',
      f.id, f.order_id, 'bridged', 250000, 170000,
      'USD', f.completed_at
    FROM guest_service_fulfilments f
    WHERE f.id = 'aa000003-0000-0000-0000-000000000004'
    ON CONFLICT (fulfilment_id) DO NOTHING;
  END IF;
END $$;

-- Append a couple of timeline events for the completed fulfilment.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM guest_service_fulfilments
    WHERE id = 'aa000003-0000-0000-0000-000000000004'
  ) THEN
    INSERT INTO service_fulfilment_events
      (fulfilment_id, event_type, actor_type, title, description)
    VALUES
      ('aa000003-0000-0000-0000-000000000004', 'created', 'system',
       'Fulfilment FUL-20260427-0004 created', NULL),
      ('aa000003-0000-0000-0000-000000000004', 'assigned', 'admin',
       'Vendor assigned: Bali Airport Express', NULL),
      ('aa000003-0000-0000-0000-000000000004', 'vendor_confirmed', 'vendor',
       'Vendor accepted', NULL),
      ('aa000003-0000-0000-0000-000000000004', 'completed', 'vendor',
       'Vendor reported completion', NULL),
      ('aa000003-0000-0000-0000-000000000004', 'finance_bridged', 'admin',
       'Finance bridge: bridged', 'Revenue 2,500.00 USD · expense 1,700.00 USD')
    ON CONFLICT DO NOTHING;
  END IF;
END $$;

-- =============================================================================
-- Prompt 104 — Dynamic Pricing & Availability Rules.
-- Two rule sets (global Bali baseline + villa-specific Enso S5),
-- the documented modifier set, a couple of demo quote logs, and two
-- simulated channel-push events.
-- =============================================================================

-- 1) Rule sets
INSERT INTO pricing_rule_sets
  (id, rule_set_code, name, scope_type, project_id, villa_id,
   priority, currency, base_rate_minor, min_rate_minor, max_rate_minor)
VALUES
  ('bb000001-0000-0000-0000-000000000001',
   'bali-baseline', 'Bali baseline (global)',
   'global', NULL, NULL, 100, 'USD',
   60000, 30000, 200000),
  ('bb000001-0000-0000-0000-000000000002',
   'enso-s5', 'Enso S5 villa-specific',
   'villa', NULL, '1eda0002-0000-0000-0000-000000000012',
   10, 'USD',
   82000, 50000, 250000)
ON CONFLICT (rule_set_code) DO UPDATE SET
  name = EXCLUDED.name,
  base_rate_minor = EXCLUDED.base_rate_minor,
  min_rate_minor = EXCLUDED.min_rate_minor,
  max_rate_minor = EXCLUDED.max_rate_minor;

-- 2) Day-of-week rules (apply to global baseline)
INSERT INTO pricing_day_of_week_rules
  (id, rule_set_id, weekday, modifier_type, modifier_value_numeric)
VALUES
  ('bb000002-0000-0000-0000-000000000001',
   'bb000001-0000-0000-0000-000000000001', 5, 'percent', 0.12),
  ('bb000002-0000-0000-0000-000000000002',
   'bb000001-0000-0000-0000-000000000001', 6, 'percent', 0.12),
  ('bb000002-0000-0000-0000-000000000003',
   'bb000001-0000-0000-0000-000000000001', 7, 'percent', -0.05)
ON CONFLICT (rule_set_id, weekday) DO UPDATE SET
  modifier_type = EXCLUDED.modifier_type,
  modifier_value_numeric = EXCLUDED.modifier_value_numeric;

-- 3) Occupancy rules (4 bands, applies to baseline)
INSERT INTO pricing_occupancy_rules
  (id, rule_set_id, occupancy_min, occupancy_max, modifier_type, modifier_value_numeric)
VALUES
  ('bb000003-0000-0000-0000-000000000001',
   'bb000001-0000-0000-0000-000000000001', 0.0, 0.4, 'percent', -0.10),
  ('bb000003-0000-0000-0000-000000000002',
   'bb000001-0000-0000-0000-000000000001', 0.4, 0.7, 'percent', 0.0),
  ('bb000003-0000-0000-0000-000000000003',
   'bb000001-0000-0000-0000-000000000001', 0.7, 0.9, 'percent', 0.10),
  ('bb000003-0000-0000-0000-000000000004',
   'bb000001-0000-0000-0000-000000000001', 0.9, 1.0, 'percent', 0.20)
ON CONFLICT (id) DO UPDATE SET
  occupancy_min = EXCLUDED.occupancy_min,
  occupancy_max = EXCLUDED.occupancy_max,
  modifier_value_numeric = EXCLUDED.modifier_value_numeric;

-- 4) Close-out rules (last-minute discount + far-future surcharge)
INSERT INTO pricing_close_out_rules
  (id, rule_set_id, days_before_checkin_min, days_before_checkin_max,
   modifier_type, modifier_value_numeric)
VALUES
  ('bb000004-0000-0000-0000-000000000001',
   'bb000001-0000-0000-0000-000000000001', 0, 3, 'percent', -0.15),
  ('bb000004-0000-0000-0000-000000000002',
   'bb000001-0000-0000-0000-000000000001', 180, 365, 'percent', 0.10)
ON CONFLICT (id) DO UPDATE SET
  modifier_value_numeric = EXCLUDED.modifier_value_numeric;

-- 5) Channel rules
INSERT INTO pricing_channel_rules
  (id, rule_set_id, channel_key, modifier_type, modifier_value_numeric, commission_model)
VALUES
  ('bb000005-0000-0000-0000-000000000001',
   'bb000001-0000-0000-0000-000000000001', 'airbnb', 'percent', 0.14, 'channel_collects'),
  ('bb000005-0000-0000-0000-000000000002',
   'bb000001-0000-0000-0000-000000000001', 'booking_com', 'percent', 0.18, 'commission_on_gross'),
  ('bb000005-0000-0000-0000-000000000003',
   'bb000001-0000-0000-0000-000000000001', 'direct', 'percent', -0.05, 'none')
ON CONFLICT (rule_set_id, channel_key) DO UPDATE SET
  modifier_type = EXCLUDED.modifier_type,
  modifier_value_numeric = EXCLUDED.modifier_value_numeric,
  commission_model = EXCLUDED.commission_model;

-- 6) Min-stay rules
INSERT INTO pricing_min_stay_rules
  (id, rule_set_id, name, starts_on, ends_on, weekday_mask, min_los, priority)
VALUES
  ('bb000006-0000-0000-0000-000000000001',
   'bb000001-0000-0000-0000-000000000001', 'Default 2 nights',
   NULL, NULL, NULL, 2, 100),
  ('bb000006-0000-0000-0000-000000000002',
   'bb000001-0000-0000-0000-000000000001', 'Peak 5 nights',
   '2026-12-20', '2027-01-05', NULL, 5, 10)
ON CONFLICT (id) DO UPDATE SET
  min_los = EXCLUDED.min_los,
  priority = EXCLUDED.priority;

-- 7) Stop-sell rule (operational risk, short demo window)
INSERT INTO pricing_stop_sell_rules
  (id, rule_set_id, name, starts_on, ends_on, reason)
VALUES
  ('bb000007-0000-0000-0000-000000000001',
   'bb000001-0000-0000-0000-000000000001', 'Roof works hold',
   '2026-05-12', '2026-05-14', 'operational_risk')
ON CONFLICT (id) DO UPDATE SET
  starts_on = EXCLUDED.starts_on,
  ends_on = EXCLUDED.ends_on,
  reason = EXCLUDED.reason;

-- 8) Quote logs
INSERT INTO pricing_quote_logs
  (id, villa_id, channel_key, check_in, check_out, nights,
   available, reason, total_minor, currency, public_quote, rule_set_id)
VALUES
  ('bb000008-0000-0000-0000-000000000001',
   '1eda0002-0000-0000-0000-000000000012', 'direct',
   '2026-05-01', '2026-05-04', 3, true, 'ok', 246000, 'USD',
   true, 'bb000001-0000-0000-0000-000000000001'),
  ('bb000008-0000-0000-0000-000000000002',
   '1eda0002-0000-0000-0000-000000000012', 'airbnb',
   '2026-05-12', '2026-05-15', 3, false, 'stop_sell', 0, 'USD',
   true, 'bb000001-0000-0000-0000-000000000001'),
  ('bb000008-0000-0000-0000-000000000003',
   '1eda0002-0000-0000-0000-000000000003', 'booking_com',
   '2026-06-10', '2026-06-12', 2, true, 'ok', 192000, 'USD',
   false, 'bb000001-0000-0000-0000-000000000001')
ON CONFLICT (id) DO NOTHING;

-- 9) Channel push events
INSERT INTO channel_push_events
  (id, event_code, event_type, channel_key, villa_id,
   date_start, date_end, payload_json, status)
VALUES
  ('bb000009-0000-0000-0000-000000000001',
   'CPE-DEMO-001', 'rate_update', 'airbnb',
   '1eda0002-0000-0000-0000-000000000012',
   '2026-05-01', '2026-05-31',
   '{"ruleSetId":"bb000001-0000-0000-0000-000000000001","note":"demo seed"}'::jsonb,
   'simulated'),
  ('bb000009-0000-0000-0000-000000000002',
   'CPE-DEMO-002', 'stop_sell_update', 'booking_com',
   '1eda0002-0000-0000-0000-000000000012',
   '2026-05-12', '2026-05-14',
   '{"reason":"operational_risk"}'::jsonb,
   'simulated')
ON CONFLICT (event_code) DO UPDATE SET
  status = EXCLUDED.status,
  payload_json = EXCLUDED.payload_json;

-- =============================================================================
-- Prompt 105 — Direct Booking Hold & Checkout Stub.
-- Notification templates, 2 active holds, 1 expired hold, 3 requests
-- across statuses, plus event timelines.
-- =============================================================================

-- Notification templates
INSERT INTO notification_templates
  (id, template_key, channel, subject_template, body_template, html_template, status)
VALUES
  ('cc000001-0001-0000-0000-000000000001',
   'direct_booking.request_submitted', 'in_app',
   'Direct booking request',
   'Review {{request_code}}.',
   NULL, 'active'),
  ('cc000001-0001-0000-0000-000000000002',
   'direct_booking.request_under_review', 'in_app',
   'Booking request under review',
   '{{request_code}} is under review.',
   NULL, 'active'),
  ('cc000001-0001-0000-0000-000000000003',
   'direct_booking.request_approved', 'in_app',
   'Booking approved',
   '{{request_code}} approved — convert when ready.',
   NULL, 'active'),
  ('cc000001-0001-0000-0000-000000000004',
   'direct_booking.request_rejected', 'in_app',
   'Booking rejected',
   '{{request_code}} rejected.',
   NULL, 'active'),
  ('cc000001-0001-0000-0000-000000000005',
   'direct_booking.request_converted', 'in_app',
   'Booking confirmed',
   'Direct booking converted to {{booking_code}}.',
   NULL, 'active'),
  ('cc000001-0001-0000-0000-000000000006',
   'direct_booking.hold_expiring', 'in_app',
   'Hold expiring soon',
   '{{hold_code}} expires in <5 minutes.',
   NULL, 'active'),
  ('cc000001-0001-0000-0000-000000000007',
   'direct_booking.hold_expired', 'in_app',
   'Hold expired',
   '{{hold_code}} expired without a booking.',
   NULL, 'active')
ON CONFLICT (id) DO UPDATE SET
  body_template = EXCLUDED.body_template,
  status = EXCLUDED.status;

-- Two active holds + one expired one. Token hashes are dummy values
-- (raw tokens are never persisted — these can never be used to look
-- a hold up via the public API; they exist for admin-side display).
INSERT INTO direct_booking_holds
  (id, hold_code, hold_token_hash, token_prefix, villa_id,
   project_id, check_in, check_out, nights, guest_count, channel_key,
   currency, total_minor, average_nightly_minor, quote_snapshot_json,
   status, expires_at)
VALUES
  ('cc000002-0000-0000-0000-000000000001',
   'HLD-DEMO-001',
   'demo_token_hash_001_long_enough_to_satisfy_unique_constraint_aaa',
   'demo0001',
   '1eda0002-0000-0000-0000-000000000012',
   '1eda0001-0000-0000-0000-000000000002',
   '2026-06-15', '2026-06-19', 4, 4, 'direct',
   'USD', 328000, 82000,
   '{"available":true,"reason":"ok","nights":4,"currency":"USD","channelKey":"direct","totalMinor":"328000","averageNightlyMinor":"82000","nightly":[{"date":"2026-06-15","rateMinor":"82000","available":true},{"date":"2026-06-16","rateMinor":"82000","available":true},{"date":"2026-06-17","rateMinor":"82000","available":true},{"date":"2026-06-18","rateMinor":"82000","available":true}],"capturedAt":"2026-04-29T10:00:00Z"}'::jsonb,
   'active', now() + interval '15 minutes'),
  ('cc000002-0000-0000-0000-000000000002',
   'HLD-DEMO-002',
   'demo_token_hash_002_long_enough_to_satisfy_unique_constraint_bbb',
   'demo0002',
   '1eda0002-0000-0000-0000-000000000003',
   '1eda0001-0000-0000-0000-000000000001',
   '2026-07-04', '2026-07-08', 4, 6, 'direct',
   'USD', 288000, 72000,
   '{"available":true,"reason":"ok","nights":4,"currency":"USD","channelKey":"direct","totalMinor":"288000","averageNightlyMinor":"72000","nightly":[{"date":"2026-07-04","rateMinor":"72000","available":true},{"date":"2026-07-05","rateMinor":"72000","available":true},{"date":"2026-07-06","rateMinor":"72000","available":true},{"date":"2026-07-07","rateMinor":"72000","available":true}],"capturedAt":"2026-04-29T10:05:00Z"}'::jsonb,
   'active', now() + interval '14 minutes'),
  ('cc000002-0000-0000-0000-000000000003',
   'HLD-DEMO-003',
   'demo_token_hash_003_long_enough_to_satisfy_unique_constraint_ccc',
   'demo0003',
   '1eda0002-0000-0000-0000-000000000020',
   '1eda0001-0000-0000-0000-000000000003',
   '2026-08-10', '2026-08-13', 3, 2, 'direct',
   'USD', 216000, 72000,
   '{"available":true,"reason":"ok","nights":3,"currency":"USD","channelKey":"direct","totalMinor":"216000","averageNightlyMinor":"72000","nightly":[{"date":"2026-08-10","rateMinor":"72000","available":true},{"date":"2026-08-11","rateMinor":"72000","available":true},{"date":"2026-08-12","rateMinor":"72000","available":true}],"capturedAt":"2026-04-28T08:00:00Z"}'::jsonb,
   'expired', now() - interval '30 minutes')
ON CONFLICT (hold_code) DO UPDATE SET
  status = EXCLUDED.status,
  expires_at = EXCLUDED.expires_at;

-- Three requests — submitted / under_review / approved.
INSERT INTO direct_booking_requests
  (id, request_code, hold_id, villa_id, project_id,
   guest_first_name, guest_last_name, guest_email, guest_phone,
   guest_country, guest_count, special_requests, arrival_time,
   purpose_of_stay, marketing_consent, terms_accepted, status)
VALUES
  ('cc000003-0000-0000-0000-000000000001',
   'DBR-DEMO-001',
   'cc000002-0000-0000-0000-000000000001',
   '1eda0002-0000-0000-0000-000000000012',
   '1eda0001-0000-0000-0000-000000000002',
   'Sophia', 'Reyes', 'sophia.reyes.demo@arconique.com',
   '+34 600 000 000', 'Spain', 4,
   'Late arrival around 22:00 — please prep cold drinks.',
   '22:00', 'holiday', false, true, 'submitted'),
  ('cc000003-0000-0000-0000-000000000002',
   'DBR-DEMO-002',
   'cc000002-0000-0000-0000-000000000002',
   '1eda0002-0000-0000-0000-000000000003',
   '1eda0001-0000-0000-0000-000000000001',
   'Marcus', 'Hill', 'marcus.hill.demo@arconique.com',
   '+1 415 555 0182', 'United States', 6,
   'Family with two kids; need crib + high chair.',
   '14:00', 'family', true, true, 'under_review'),
  ('cc000003-0000-0000-0000-000000000003',
   'DBR-DEMO-003',
   'cc000002-0000-0000-0000-000000000001',
   '1eda0002-0000-0000-0000-000000000012',
   '1eda0001-0000-0000-0000-000000000002',
   'Aiko', 'Tanaka', 'aiko.tanaka.demo@arconique.com',
   '+81 90 1234 5678', 'Japan', 2,
   NULL, '15:30', 'honeymoon', false, true, 'approved')
ON CONFLICT (request_code) DO UPDATE SET
  status = EXCLUDED.status,
  decision_note = EXCLUDED.decision_note;

-- Event timelines for the three requests.
INSERT INTO direct_booking_request_events
  (request_id, event_type, actor_type, message)
VALUES
  ('cc000003-0000-0000-0000-000000000001', 'hold_created', 'system', 'Hold HLD-DEMO-001 created'),
  ('cc000003-0000-0000-0000-000000000001', 'request_submitted', 'guest', 'Submitted via /api/v1/holds/<token>/submit'),
  ('cc000003-0000-0000-0000-000000000002', 'hold_created', 'system', 'Hold HLD-DEMO-002 created'),
  ('cc000003-0000-0000-0000-000000000002', 'request_submitted', 'guest', NULL),
  ('cc000003-0000-0000-0000-000000000002', 'under_review', 'internal', 'Concierge picked up the request'),
  ('cc000003-0000-0000-0000-000000000003', 'hold_created', 'system', NULL),
  ('cc000003-0000-0000-0000-000000000003', 'request_submitted', 'guest', NULL),
  ('cc000003-0000-0000-0000-000000000003', 'under_review', 'internal', 'Awaiting villa team confirmation'),
  ('cc000003-0000-0000-0000-000000000003', 'approved', 'internal', 'Villa team confirmed availability — ready to convert.')
ON CONFLICT DO NOTHING;

-- =============================================================================
-- Prompt 106 — Direct Booking Deposit Workflow + Payment Provider Stub.
-- 1 manual_stub provider, 4 deposits across statuses (pending, paid,
-- failed, cancelled), event timelines, 2 sample webhook events
-- (ignored + processed), and the 6 deposit-event notification
-- templates.
-- =============================================================================

-- 1) Notification templates
INSERT INTO notification_templates
  (id, template_key, channel, subject_template, body_template, html_template, status)
VALUES
  ('dd000001-0001-0000-0000-000000000001',
   'direct_booking.deposit_created', 'in_app',
   'Deposit created',
   '{{deposit_code}} for request {{request_code}}.',
   NULL, 'active'),
  ('dd000001-0001-0000-0000-000000000002',
   'direct_booking.deposit_guest_claimed_paid', 'in_app',
   'Guest claims deposit paid',
   'Verify {{deposit_code}} before marking paid.',
   NULL, 'active'),
  ('dd000001-0001-0000-0000-000000000003',
   'direct_booking.deposit_marked_paid', 'in_app',
   'Deposit marked paid',
   'Deposit {{deposit_code}} manually marked paid.',
   NULL, 'active'),
  ('dd000001-0001-0000-0000-000000000004',
   'direct_booking.deposit_failed', 'in_app',
   'Deposit failed',
   'Deposit {{deposit_code}} marked failed.',
   NULL, 'active'),
  ('dd000001-0001-0000-0000-000000000005',
   'direct_booking.deposit_cancelled', 'in_app',
   'Deposit cancelled',
   'Deposit {{deposit_code}} cancelled.',
   NULL, 'active'),
  ('dd000001-0001-0000-0000-000000000006',
   'direct_booking.booking_confirmed', 'in_app',
   'Booking confirmed',
   '{{booking_code}} issued from direct booking.',
   NULL, 'active')
ON CONFLICT (id) DO UPDATE SET
  body_template = EXCLUDED.body_template,
  status = EXCLUDED.status;

-- 2) Manual-stub provider account
INSERT INTO payment_provider_accounts
  (id, provider_key, display_name, status, mode, supported_currencies,
   config_public_json)
VALUES
  ('dd000002-0000-0000-0000-000000000001',
   'manual_stub', 'Manual stub (demo)', 'active', 'test',
   ARRAY['USD','IDR']::text[],
   '{"label":"Manual stub","note":"Concierge verifies payment off-platform."}'::jsonb)
ON CONFLICT (id) DO UPDATE SET
  status = EXCLUDED.status,
  display_name = EXCLUDED.display_name;

-- 3) Deposits attached to the existing direct-booking requests (DBR-DEMO-001..003).
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM direct_booking_requests WHERE id = 'cc000003-0000-0000-0000-000000000001') THEN
    INSERT INTO direct_booking_deposits
      (id, hold_id, request_id, provider_account_id, deposit_code, provider_key,
       provider_session_id, amount_minor, currency, status, payment_url,
       expires_at)
    VALUES
      ('dd000003-0000-0000-0000-000000000001',
       'cc000002-0000-0000-0000-000000000001',
       'cc000003-0000-0000-0000-000000000001',
       'dd000002-0000-0000-0000-000000000001',
       'DEP-DEMO-001', 'manual_stub',
       'man_dd000003-0000-0000-0000-000000000001',
       98400, 'USD', 'pending',
       '/book/hold/demo0001/payment?d=dd000003-0000-0000-0000-000000000001',
       now() + interval '24 hours')
    ON CONFLICT (deposit_code) DO NOTHING;
  END IF;
  IF EXISTS (SELECT 1 FROM direct_booking_requests WHERE id = 'cc000003-0000-0000-0000-000000000002') THEN
    INSERT INTO direct_booking_deposits
      (id, hold_id, request_id, provider_account_id, deposit_code, provider_key,
       provider_session_id, amount_minor, currency, status, payment_url,
       paid_at)
    VALUES
      ('dd000003-0000-0000-0000-000000000002',
       'cc000002-0000-0000-0000-000000000002',
       'cc000003-0000-0000-0000-000000000002',
       'dd000002-0000-0000-0000-000000000001',
       'DEP-DEMO-002', 'manual_stub',
       'man_dd000003-0000-0000-0000-000000000002',
       86400, 'USD', 'manually_marked_paid',
       '/book/hold/demo0002/payment?d=dd000003-0000-0000-0000-000000000002',
       now() - interval '2 hours')
    ON CONFLICT (deposit_code) DO NOTHING;
  END IF;
  IF EXISTS (SELECT 1 FROM direct_booking_requests WHERE id = 'cc000003-0000-0000-0000-000000000003') THEN
    INSERT INTO direct_booking_deposits
      (id, hold_id, request_id, provider_account_id, deposit_code, provider_key,
       provider_session_id, amount_minor, currency, status, payment_url,
       failed_at)
    VALUES
      ('dd000003-0000-0000-0000-000000000003',
       'cc000002-0000-0000-0000-000000000001',
       'cc000003-0000-0000-0000-000000000003',
       'dd000002-0000-0000-0000-000000000001',
       'DEP-DEMO-003', 'manual_stub',
       'man_dd000003-0000-0000-0000-000000000003',
       64800, 'USD', 'failed',
       '/book/hold/demo0001/payment?d=dd000003-0000-0000-0000-000000000003',
       now() - interval '10 hours')
    ON CONFLICT (deposit_code) DO NOTHING;
    -- Replacement deposit cancelled afterwards.
    INSERT INTO direct_booking_deposits
      (id, hold_id, request_id, provider_account_id, deposit_code, provider_key,
       provider_session_id, amount_minor, currency, status, payment_url,
       cancelled_at)
    VALUES
      ('dd000003-0000-0000-0000-000000000004',
       'cc000002-0000-0000-0000-000000000001',
       'cc000003-0000-0000-0000-000000000003',
       'dd000002-0000-0000-0000-000000000001',
       'DEP-DEMO-004', 'manual_stub',
       'man_dd000003-0000-0000-0000-000000000004',
       64800, 'USD', 'cancelled',
       '/book/hold/demo0001/payment?d=dd000003-0000-0000-0000-000000000004',
       now() - interval '5 hours')
    ON CONFLICT (deposit_code) DO NOTHING;
  END IF;
END $$;

-- 4) Deposit event timelines.
INSERT INTO direct_booking_deposit_events
  (deposit_id, event_type, actor_type, message)
VALUES
  ('dd000003-0000-0000-0000-000000000001', 'created', 'system',
   'Deposit created on submit'),
  ('dd000003-0000-0000-0000-000000000001', 'session_created', 'system',
   'Manual-stub session created'),
  ('dd000003-0000-0000-0000-000000000002', 'created', 'system', NULL),
  ('dd000003-0000-0000-0000-000000000002', 'session_created', 'system', NULL),
  ('dd000003-0000-0000-0000-000000000002', 'guest_claimed_paid', 'guest',
   'Guest reports payment via stay portal'),
  ('dd000003-0000-0000-0000-000000000002', 'manually_marked_paid', 'internal',
   'Marked paid by admin'),
  ('dd000003-0000-0000-0000-000000000003', 'created', 'system', NULL),
  ('dd000003-0000-0000-0000-000000000003', 'session_created', 'system', NULL),
  ('dd000003-0000-0000-0000-000000000003', 'provider_failed', 'internal',
   'Wrong amount transferred'),
  ('dd000003-0000-0000-0000-000000000004', 'created', 'system',
   'Replacement deposit'),
  ('dd000003-0000-0000-0000-000000000004', 'cancelled', 'internal',
   'Cancelled — guest withdrew')
ON CONFLICT DO NOTHING;

-- 5) Sample webhook events (manual stub does NOT write here; these
-- demonstrate what a real provider webhook would look like).
INSERT INTO payment_webhook_events
  (id, provider_key, external_event_id, event_type, payload_json, status,
   processed_at)
VALUES
  ('dd000004-0000-0000-0000-000000000001',
   'stripe', 'evt_demo_processed_001', 'payment_intent.succeeded',
   '{"id":"evt_demo_processed_001","type":"payment_intent.succeeded","data":{"object":{"id":"pi_demo","amount":86400,"currency":"usd"}}}'::jsonb,
   'processed', now() - interval '1 hour'),
  ('dd000004-0000-0000-0000-000000000002',
   'stripe', 'evt_demo_ignored_002', 'payment_intent.created',
   '{"id":"evt_demo_ignored_002","type":"payment_intent.created","data":{"object":{"id":"pi_demo2"}}}'::jsonb,
   'ignored', NULL)
ON CONFLICT (id) DO NOTHING;

-- =============================================================================
-- Prompt 107 — Direct Booking Finance Reconciliation + Deposit Expiry.
-- Notification templates, finance-link rows across statuses, an
-- expired pending deposit, a paid-with-balance-due deposit.
-- =============================================================================

-- Notification templates
INSERT INTO notification_templates
  (id, template_key, channel, subject_template, body_template, html_template, status)
VALUES
  ('ee000001-0001-0000-0000-000000000001',
   'direct_booking.deposit_expired', 'in_app',
   'Deposit expired',
   'Deposit {{deposit_code}} expired without payment.',
   NULL, 'active'),
  ('ee000001-0001-0000-0000-000000000002',
   'direct_booking.revenue_posted', 'in_app',
   'Direct booking revenue posted',
   '{{request_code}} posted to revenue ledger.',
   NULL, 'active'),
  ('ee000001-0001-0000-0000-000000000003',
   'direct_booking.reconciliation_failed', 'in_app',
   'Reconciliation failed',
   '{{request_code}} could not post — finance team to review.',
   NULL, 'active'),
  ('ee000001-0001-0000-0000-000000000004',
   'direct_booking.balance_due_reminder', 'in_app',
   'Balance due reminder',
   'Booking {{booking_code}} still has a balance due.',
   NULL, 'active')
ON CONFLICT (id) DO UPDATE SET
  body_template = EXCLUDED.body_template,
  status = EXCLUDED.status;

-- Update existing deposits to populate balance_due_minor for the
-- two paid demo rows (so the dashboard surfaces a non-zero value).
UPDATE direct_booking_deposits
SET balance_due_minor =
  GREATEST(
    0,
    COALESCE(
      (SELECT total_minor - amount_minor
         FROM direct_booking_holds h
        WHERE h.id = direct_booking_deposits.hold_id),
      0
    )
  )
WHERE id IN (
  'dd000003-0000-0000-0000-000000000001',
  'dd000003-0000-0000-0000-000000000002',
  'dd000003-0000-0000-0000-000000000003',
  'dd000003-0000-0000-0000-000000000004'
);

-- Push DEP-DEMO-001 into an expired-pending state so the expiry
-- demo shows something meaningful.
UPDATE direct_booking_deposits
SET expires_at = now() - interval '2 hours',
    expires_reason = 'demo_expired_seed'
WHERE id = 'dd000003-0000-0000-0000-000000000001';

-- 4 finance links across statuses (only inserted when prerequisite
-- demo rows exist).
DO $$
BEGIN
  -- 1) Posted link with revenue line + statement period.
  IF EXISTS (SELECT 1 FROM direct_booking_requests WHERE id = 'cc000003-0000-0000-0000-000000000002') THEN
    INSERT INTO direct_booking_finance_links
      (id, request_id, hold_id, deposit_id, booking_id, revenue_line_id,
       statement_period_id, link_code, gross_amount_minor, deposit_amount_minor,
       balance_due_minor, currency, status, posted_at)
    VALUES
      ('ee000002-0000-0000-0000-000000000001',
       'cc000003-0000-0000-0000-000000000002',
       'cc000002-0000-0000-0000-000000000002',
       'dd000003-0000-0000-0000-000000000002',
       NULL, NULL, NULL,
       'DBF-DEMO-0001', 288000, 86400, 201600, 'USD',
       'posted', now() - interval '1 hour')
    ON CONFLICT (link_code) DO NOTHING;
    UPDATE direct_booking_requests
      SET finance_bridge_status = 'posted',
          finance_link_id = 'ee000002-0000-0000-0000-000000000001'
      WHERE id = 'cc000003-0000-0000-0000-000000000002';
  END IF;
  -- 2) Skipped locked period demo.
  IF EXISTS (SELECT 1 FROM direct_booking_requests WHERE id = 'cc000003-0000-0000-0000-000000000001') THEN
    INSERT INTO direct_booking_finance_links
      (id, request_id, hold_id, deposit_id, booking_id, revenue_line_id,
       statement_period_id, link_code, gross_amount_minor, deposit_amount_minor,
       balance_due_minor, currency, status, error)
    VALUES
      ('ee000002-0000-0000-0000-000000000002',
       'cc000003-0000-0000-0000-000000000001',
       'cc000002-0000-0000-0000-000000000001',
       'dd000003-0000-0000-0000-000000000001',
       NULL, NULL, NULL,
       'DBF-DEMO-0002', 328000, 98400, 229600, 'USD',
       'skipped_locked_period',
       'Period 2026-04 is locked.')
    ON CONFLICT (link_code) DO NOTHING;
  END IF;
  -- 3) Pending converted but unposted (uses approved request).
  IF EXISTS (SELECT 1 FROM direct_booking_requests WHERE id = 'cc000003-0000-0000-0000-000000000003') THEN
    INSERT INTO direct_booking_finance_links
      (id, request_id, hold_id, deposit_id, booking_id, revenue_line_id,
       statement_period_id, link_code, gross_amount_minor, deposit_amount_minor,
       balance_due_minor, currency, status)
    VALUES
      ('ee000002-0000-0000-0000-000000000003',
       'cc000003-0000-0000-0000-000000000003',
       'cc000002-0000-0000-0000-000000000001',
       'dd000003-0000-0000-0000-000000000003',
       NULL, NULL, NULL,
       'DBF-DEMO-0003', 216000, 64800, 151200, 'USD',
       'pending')
    ON CONFLICT (link_code) DO NOTHING;
  END IF;
  -- 4) Failed demo row.
  IF EXISTS (SELECT 1 FROM direct_booking_requests WHERE id = 'cc000003-0000-0000-0000-000000000003') THEN
    INSERT INTO direct_booking_finance_links
      (id, request_id, hold_id, deposit_id, booking_id, revenue_line_id,
       statement_period_id, link_code, gross_amount_minor, deposit_amount_minor,
       balance_due_minor, currency, status, error)
    VALUES
      ('ee000002-0000-0000-0000-000000000004',
       NULL,
       'cc000002-0000-0000-0000-000000000001',
       'dd000003-0000-0000-0000-000000000004',
       NULL, NULL, NULL,
       'DBF-DEMO-0004', 0, 0, 0, 'USD',
       'failed',
       'demo_failed_seed: deposit cancelled before reconciliation.')
    ON CONFLICT (link_code) DO NOTHING;
  END IF;
END $$;

-- =============================================================================
-- Prompt 108 — Owner booking projection seed.
-- Owner: Emma Whitmore (1eda0003-0000-0000-0000-000000000001)
-- Villas: Eternal S5 (1eda0002-0000-0000-0000-000000000003)
--         Ahau 02 (1eda0002-0000-0000-0000-000000000021)
-- These rows are *projection* rows — they are illustrative only.
-- Real production rows are written by the rebuild job; the seed exists
-- so the demo owner portal renders without running the cron.
-- =============================================================================
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.tables
     WHERE table_name = 'owner_booking_summaries'
  ) THEN
    RAISE NOTICE 'Owner booking projection tables not present — skipping P108 seed.';
    RETURN;
  END IF;

  -- 1) Direct booking, posted to a statement (Eternal S5).
  INSERT INTO owner_booking_summaries
    (id, owner_id, villa_id, project_id, booking_id,
     direct_booking_request_id, direct_booking_hold_id,
     source_type, public_status, owner_label,
     guest_label, guest_country, channel_label,
     check_in, check_out, nights, guest_count,
     total_amount_minor, owner_revenue_minor, currency,
     revenue_posted, statement_id, statement_line_id,
     owner_visible, source_updated_at)
  VALUES
    ('ff000001-0000-0000-0000-000000000001',
     '1eda0003-0000-0000-0000-000000000001',
     '1eda0002-0000-0000-0000-000000000003',
     '1eda0001-0000-0000-0000-000000000001',
     NULL, NULL, NULL,
     'direct_booking', 'completed',
     'Direct booking · Completed',
     'Emma W.', 'JP', 'Direct',
     '2026-03-08', '2026-03-12', 4, 2,
     208000, 170560, 'USD',
     true, NULL, NULL,
     true, now())
  ON CONFLICT (id) DO NOTHING;

  -- 2) Direct booking confirmed but not yet on a statement (Ahau 02).
  INSERT INTO owner_booking_summaries
    (id, owner_id, villa_id, project_id, booking_id,
     direct_booking_request_id, direct_booking_hold_id,
     source_type, public_status, owner_label,
     guest_label, guest_country, channel_label,
     check_in, check_out, nights, guest_count,
     total_amount_minor, owner_revenue_minor, currency,
     revenue_posted, statement_id, statement_line_id,
     owner_visible, source_updated_at)
  VALUES
    ('ff000001-0000-0000-0000-000000000002',
     '1eda0003-0000-0000-0000-000000000001',
     '1eda0002-0000-0000-0000-000000000021',
     '1eda0001-0000-0000-0000-000000000003',
     NULL, NULL, NULL,
     'direct_booking', 'confirmed',
     'Direct booking · Confirmed',
     'Daniel K.', 'AU', 'Direct',
     '2026-04-12', '2026-04-19', 7, 4,
     532000, NULL, 'USD',
     false, NULL, NULL,
     true, now())
  ON CONFLICT (id) DO NOTHING;

  -- 3) OTA (Airbnb) confirmed, estimated only.
  INSERT INTO owner_booking_summaries
    (id, owner_id, villa_id, project_id, booking_id,
     direct_booking_request_id, direct_booking_hold_id,
     source_type, public_status, owner_label,
     guest_label, guest_country, channel_label,
     check_in, check_out, nights, guest_count,
     total_amount_minor, owner_revenue_minor, currency,
     revenue_posted, statement_id, statement_line_id,
     owner_visible, source_updated_at)
  VALUES
    ('ff000001-0000-0000-0000-000000000003',
     '1eda0003-0000-0000-0000-000000000001',
     '1eda0002-0000-0000-0000-000000000003',
     '1eda0001-0000-0000-0000-000000000001',
     NULL, NULL, NULL,
     'ota_airbnb', 'confirmed',
     'Airbnb stay · Confirmed',
     'Sofia M.', 'SG', 'Airbnb',
     '2026-04-22', '2026-04-26', 4, 2,
     224000, NULL, 'USD',
     false, NULL, NULL,
     true, now())
  ON CONFLICT (id) DO NOTHING;

  -- 4) Owner stay (Ahau 02).
  INSERT INTO owner_booking_summaries
    (id, owner_id, villa_id, project_id, booking_id,
     direct_booking_request_id, direct_booking_hold_id,
     source_type, public_status, owner_label,
     guest_label, guest_country, channel_label,
     check_in, check_out, nights, guest_count,
     total_amount_minor, owner_revenue_minor, currency,
     revenue_posted, statement_id, statement_line_id,
     owner_visible, source_updated_at)
  VALUES
    ('ff000001-0000-0000-0000-000000000004',
     '1eda0003-0000-0000-0000-000000000001',
     '1eda0002-0000-0000-0000-000000000021',
     '1eda0001-0000-0000-0000-000000000003',
     NULL, NULL, NULL,
     'owner_stay', 'owner_stay',
     'Owner stay',
     NULL, NULL, NULL,
     '2026-05-04', '2026-05-08', 4, 2,
     NULL, NULL, 'USD',
     false, NULL, NULL,
     true, now())
  ON CONFLICT (id) DO NOTHING;

  -- 5) Maintenance block (Eternal S5).
  INSERT INTO owner_booking_summaries
    (id, owner_id, villa_id, project_id, booking_id,
     direct_booking_request_id, direct_booking_hold_id,
     source_type, public_status, owner_label,
     guest_label, guest_country, channel_label,
     check_in, check_out, nights, guest_count,
     total_amount_minor, owner_revenue_minor, currency,
     revenue_posted, statement_id, statement_line_id,
     owner_visible, source_updated_at)
  VALUES
    ('ff000001-0000-0000-0000-000000000005',
     '1eda0003-0000-0000-0000-000000000001',
     '1eda0002-0000-0000-0000-000000000003',
     '1eda0001-0000-0000-0000-000000000001',
     NULL, NULL, NULL,
     'maintenance_block', 'maintenance',
     'Maintenance block',
     NULL, NULL, NULL,
     '2026-05-12', '2026-05-14', 2, NULL,
     NULL, NULL, NULL,
     false, NULL, NULL,
     true, now())
  ON CONFLICT (id) DO NOTHING;

  -- Revenue breakdown rows: posted direct booking + service upsell.
  INSERT INTO owner_booking_revenue_breakdowns
    (id, owner_booking_summary_id, owner_id, villa_id, booking_id,
     direct_booking_request_id, category, label,
     amount_minor, currency, direction, owner_visible, sort_order)
  VALUES
    ('ff000002-0000-0000-0000-000000000001',
     'ff000001-0000-0000-0000-000000000001',
     '1eda0003-0000-0000-0000-000000000001',
     '1eda0002-0000-0000-0000-000000000003',
     NULL, NULL,
     'accommodation', 'Direct booking accommodation',
     208000, 'USD', 'revenue', true, 10),
    ('ff000002-0000-0000-0000-000000000002',
     'ff000001-0000-0000-0000-000000000001',
     '1eda0003-0000-0000-0000-000000000001',
     '1eda0002-0000-0000-0000-000000000003',
     NULL, NULL,
     'management_fee', 'Management fee (18%)',
     37440, 'USD', 'deduction', true, 60),
    ('ff000002-0000-0000-0000-000000000003',
     'ff000001-0000-0000-0000-000000000002',
     '1eda0003-0000-0000-0000-000000000001',
     '1eda0002-0000-0000-0000-000000000021',
     NULL, NULL,
     'accommodation', 'Direct booking accommodation (estimated)',
     532000, 'USD', 'revenue', true, 10),
    ('ff000002-0000-0000-0000-000000000004',
     'ff000001-0000-0000-0000-000000000003',
     '1eda0003-0000-0000-0000-000000000001',
     '1eda0002-0000-0000-0000-000000000003',
     NULL, NULL,
     'accommodation', 'Airbnb accommodation (estimated)',
     224000, 'USD', 'revenue', true, 10),
    ('ff000002-0000-0000-0000-000000000005',
     'ff000001-0000-0000-0000-000000000003',
     '1eda0003-0000-0000-0000-000000000001',
     '1eda0002-0000-0000-0000-000000000003',
     NULL, NULL,
     'ota_fee', 'Airbnb commission (estimated)',
     31360, 'USD', 'deduction', true, 40),
    ('ff000002-0000-0000-0000-000000000006',
     'ff000001-0000-0000-0000-000000000004',
     '1eda0003-0000-0000-0000-000000000001',
     '1eda0002-0000-0000-0000-000000000021',
     NULL, NULL,
     'owner_payout_effect', 'Owner stay charges (estimated)',
     12000, 'USD', 'deduction', true, 50)
  ON CONFLICT (id) DO NOTHING;

  -- Monthly source mix buckets (3 months for Emma).
  INSERT INTO owner_revenue_source_monthly
    (id, owner_id, villa_id, project_id, period_month, source_type,
     gross_revenue_minor, deductions_minor, net_owner_effect_minor,
     booking_count, occupied_nights, currency)
  VALUES
    ('ff000003-0000-0000-0000-000000000001',
     '1eda0003-0000-0000-0000-000000000001',
     '1eda0002-0000-0000-0000-000000000003',
     '1eda0001-0000-0000-0000-000000000001',
     '2026-03-01', 'direct_booking',
     208000, 37440, 170560, 1, 4, 'USD'),
    ('ff000003-0000-0000-0000-000000000002',
     '1eda0003-0000-0000-0000-000000000001',
     '1eda0002-0000-0000-0000-000000000021',
     '1eda0001-0000-0000-0000-000000000003',
     '2026-04-01', 'direct_booking',
     532000, 0, 532000, 1, 7, 'USD'),
    ('ff000003-0000-0000-0000-000000000003',
     '1eda0003-0000-0000-0000-000000000001',
     '1eda0002-0000-0000-0000-000000000003',
     '1eda0001-0000-0000-0000-000000000001',
     '2026-04-01', 'ota',
     224000, 31360, 192640, 1, 4, 'USD'),
    ('ff000003-0000-0000-0000-000000000004',
     '1eda0003-0000-0000-0000-000000000001',
     '1eda0002-0000-0000-0000-000000000021',
     '1eda0001-0000-0000-0000-000000000003',
     '2026-02-01', 'ota',
     180000, 25200, 154800, 1, 3, 'USD')
  ON CONFLICT (id) DO NOTHING;
END $$;

-- =============================================================================
-- Prompt 109 — Guest booking notifications + status center.
-- Notification templates for direct-booking guest-facing copy.
-- =============================================================================
INSERT INTO notification_templates
  (id, template_key, channel, subject_template, body_template, html_template, status)
VALUES
  ('ee010001-0001-0000-0000-000000000001',
   'direct_booking_guest.request_received', 'in_app',
   'Request received',
   'Thank you. Your direct booking request has been received and is now in our concierge queue.',
   NULL, 'active'),
  ('ee010001-0001-0000-0000-000000000002',
   'direct_booking_guest.under_review', 'in_app',
   'Under review',
   'A concierge has picked up your request and is reviewing availability and the details you shared.',
   NULL, 'active'),
  ('ee010001-0001-0000-0000-000000000003',
   'direct_booking_guest.deposit_requested', 'in_app',
   'Deposit requested',
   'Your request was approved. Please continue to the deposit step to confirm your booking.',
   NULL, 'active'),
  ('ee010001-0001-0000-0000-000000000004',
   'direct_booking_guest.guest_claimed_paid', 'in_app',
   'Payment confirmation received',
   'Thank you. We are verifying the deposit and will update your booking shortly.',
   NULL, 'active'),
  ('ee010001-0001-0000-0000-000000000005',
   'direct_booking_guest.deposit_confirmed', 'in_app',
   'Deposit confirmed',
   'Your deposit is recorded. We are issuing your booking confirmation now.',
   NULL, 'active'),
  ('ee010001-0001-0000-0000-000000000006',
   'direct_booking_guest.booking_confirmed', 'in_app',
   'Your booking is confirmed',
   'Your booking is confirmed. We will send your stay access details closer to arrival.',
   NULL, 'active'),
  ('ee010001-0001-0000-0000-000000000007',
   'direct_booking_guest.request_rejected', 'in_app',
   'We could not confirm your request',
   'Unfortunately we are not able to confirm this booking. Our concierge team will follow up if alternatives are available.',
   NULL, 'active'),
  ('ee010001-0001-0000-0000-000000000008',
   'direct_booking_guest.hold_expired', 'in_app',
   'This hold has expired',
   'The temporary hold is no longer active. You may request the dates again if they are still available.',
   NULL, 'active'),
  ('ee010001-0001-0000-0000-000000000009',
   'direct_booking_guest.deposit_expired', 'in_app',
   'Deposit window expired',
   'The deposit window has closed and the hold is no longer active.',
   NULL, 'active'),
  ('ee010001-0001-0000-0000-000000000010',
   'direct_booking_guest.concierge_reply', 'in_app',
   'Message from concierge',
   'You have a new message from the concierge team in your booking conversation.',
   NULL, 'active')
ON CONFLICT (template_key, channel) DO UPDATE SET
  status = EXCLUDED.status,
  subject_template = EXCLUDED.subject_template,
  body_template = EXCLUDED.body_template;

-- =============================================================================
-- Prompt 109 — Demo guest status snapshots, notifications, and message threads.
-- All copy is guest-safe; no PII / providerSession / token leakage.
-- =============================================================================
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.tables
     WHERE table_name = 'direct_booking_guest_status_snapshots'
  ) THEN
    RAISE NOTICE 'Guest status tables not present — skipping P109 demo seed.';
    RETURN;
  END IF;

  -- Snapshot 1: under_review (uses existing demo request DEMO-0001).
  IF EXISTS (SELECT 1 FROM direct_booking_holds WHERE id = 'cc000002-0000-0000-0000-000000000001') THEN
    INSERT INTO direct_booking_guest_status_snapshots
      (id, hold_id, request_id, deposit_id, booking_id, public_stage,
       headline, body, next_action_label, next_action_href, guest_can_act,
       hold_expires_at, deposit_expires_at, total_amount_minor,
       deposit_amount_minor, balance_due_minor, currency, villa_label,
       check_in, check_out, nights, guest_count, source_updated_at)
    VALUES
      ('ee020001-0000-0000-0000-000000000001',
       'cc000002-0000-0000-0000-000000000001',
       'cc000003-0000-0000-0000-000000000001',
       NULL, NULL,
       'under_review',
       'Under review by our concierge team',
       'A concierge has picked up your request. We are confirming availability and any extras you asked for.',
       NULL, NULL, true,
       now() + interval '15 minutes', NULL, 328000, 0, 328000, 'USD',
       'Eternal S5', '2026-05-10', '2026-05-13', 3, 2, now())
    ON CONFLICT (hold_id) DO NOTHING;
  END IF;

  -- Notification chain for the demo: request_received → under_review.
  IF EXISTS (SELECT 1 FROM direct_booking_holds WHERE id = 'cc000002-0000-0000-0000-000000000001') THEN
    INSERT INTO direct_booking_guest_notifications
      (id, hold_id, request_id, deposit_id, booking_id, notification_key,
       public_title, public_body, public_action_label, public_action_href,
       severity, status, dedupe_key)
    VALUES
      ('ee030001-0000-0000-0000-000000000001',
       'cc000002-0000-0000-0000-000000000001',
       'cc000003-0000-0000-0000-000000000001',
       NULL, NULL,
       'request_received',
       'Request received',
       'Thank you. Your direct booking request has been received and is now in our concierge queue.',
       NULL, NULL,
       'info', 'unread',
       'dbg-demo:request_received:cc000002')
    ON CONFLICT (dedupe_key) DO NOTHING;
    INSERT INTO direct_booking_guest_notifications
      (id, hold_id, request_id, deposit_id, booking_id, notification_key,
       public_title, public_body, public_action_label, public_action_href,
       severity, status, dedupe_key)
    VALUES
      ('ee030001-0000-0000-0000-000000000002',
       'cc000002-0000-0000-0000-000000000001',
       'cc000003-0000-0000-0000-000000000001',
       NULL, NULL,
       'request_under_review',
       'Under review',
       'A concierge has picked up your request and is reviewing availability and the details you shared.',
       NULL, NULL,
       'info', 'unread',
       'dbg-demo:under_review:cc000002')
    ON CONFLICT (dedupe_key) DO NOTHING;
  END IF;

  -- Demo deposit-requested notification + matching snapshot for hold #2.
  IF EXISTS (SELECT 1 FROM direct_booking_holds WHERE id = 'cc000002-0000-0000-0000-000000000002') THEN
    INSERT INTO direct_booking_guest_status_snapshots
      (id, hold_id, request_id, public_stage,
       headline, body, next_action_label, next_action_href, guest_can_act,
       total_amount_minor, deposit_amount_minor, balance_due_minor, currency,
       villa_label, check_in, check_out, nights, guest_count, source_updated_at)
    VALUES
      ('ee020001-0000-0000-0000-000000000002',
       'cc000002-0000-0000-0000-000000000002',
       'cc000003-0000-0000-0000-000000000002',
       'deposit_required',
       'Deposit requested',
       'Your request is approved. To continue, please complete the deposit step. No card details are collected in this demo — our team will guide you offline.',
       'Open deposit page', '/book/hold/__demo__/payment', true,
       216000, 64800, 151200, 'USD',
       'Enso S2', '2026-05-20', '2026-05-23', 3, 2, now())
    ON CONFLICT (hold_id) DO NOTHING;
    INSERT INTO direct_booking_guest_notifications
      (id, hold_id, request_id, notification_key,
       public_title, public_body, public_action_label, public_action_href,
       severity, status, dedupe_key)
    VALUES
      ('ee030001-0000-0000-0000-000000000003',
       'cc000002-0000-0000-0000-000000000002',
       'cc000003-0000-0000-0000-000000000002',
       'deposit_requested',
       'Deposit requested',
       'Your request was approved. Please continue to the deposit step to confirm your booking.',
       'Open deposit page', '/book/hold/__demo__/payment',
       'warning', 'unread',
       'dbg-demo:deposit_requested:cc000002b')
    ON CONFLICT (dedupe_key) DO NOTHING;
  END IF;

  -- Demo expired hold notification.
  IF EXISTS (SELECT 1 FROM direct_booking_holds WHERE id = 'cc000002-0000-0000-0000-000000000003') THEN
    INSERT INTO direct_booking_guest_status_snapshots
      (id, hold_id, public_stage,
       headline, body, guest_can_act, currency,
       villa_label, check_in, check_out, nights, source_updated_at)
    VALUES
      ('ee020001-0000-0000-0000-000000000003',
       'cc000002-0000-0000-0000-000000000003',
       'expired',
       'This hold has expired',
       'The temporary hold is no longer active. You may request the dates again if they are still available.',
       false, 'USD',
       'Ahau 02', '2026-04-15', '2026-04-18', 3, now())
    ON CONFLICT (hold_id) DO NOTHING;
    INSERT INTO direct_booking_guest_notifications
      (id, hold_id, notification_key,
       public_title, public_body, severity, status, dedupe_key)
    VALUES
      ('ee030001-0000-0000-0000-000000000004',
       'cc000002-0000-0000-0000-000000000003',
       'hold_expired',
       'This hold has expired',
       'The temporary hold is no longer active. You may request the dates again if they are still available.',
       'warning', 'unread',
       'dbg-demo:expired:cc000002c')
    ON CONFLICT (dedupe_key) DO NOTHING;
  END IF;

  -- One open thread (under_review) + one closed thread (expired hold).
  IF EXISTS (SELECT 1 FROM direct_booking_holds WHERE id = 'cc000002-0000-0000-0000-000000000001') THEN
    INSERT INTO direct_booking_guest_message_threads
      (id, hold_id, request_id, status,
       guest_unread_count, staff_unread_count,
       last_guest_message_at, last_staff_message_at, last_message_at)
    VALUES
      ('ee040001-0000-0000-0000-000000000001',
       'cc000002-0000-0000-0000-000000000001',
       'cc000003-0000-0000-0000-000000000001',
       'open',
       1, 0,
       now() - interval '20 minutes',
       now() - interval '5 minutes',
       now() - interval '5 minutes')
    -- The unique index on request_id is partial (WHERE request_id IS NOT NULL),
    -- so the ON CONFLICT must repeat the predicate or PG can't infer the
    -- arbiter index (error 42P10). See seed.sql header.
    ON CONFLICT (request_id) WHERE request_id IS NOT NULL DO NOTHING;

    INSERT INTO direct_booking_guest_messages
      (id, thread_id, author_type, body, body_redacted,
       visibility, status_snapshot)
    VALUES
      ('ee050001-0000-0000-0000-000000000001',
       'ee040001-0000-0000-0000-000000000001',
       'guest',
       'Hi — could we add an early check-in if possible?',
       'Hi — could we add an early check-in if possible?',
       'guest_visible', 'under_review'),
      ('ee050001-0000-0000-0000-000000000002',
       'ee040001-0000-0000-0000-000000000001',
       'staff',
       'Hello, thanks for getting in touch. We are checking with the team and will confirm shortly.',
       'Hello, thanks for getting in touch. We are checking with the team and will confirm shortly.',
       'guest_visible', 'under_review')
    ON CONFLICT (id) DO NOTHING;
  END IF;

  IF EXISTS (SELECT 1 FROM direct_booking_holds WHERE id = 'cc000002-0000-0000-0000-000000000003') THEN
    INSERT INTO direct_booking_guest_message_threads
      (id, hold_id, status,
       guest_unread_count, staff_unread_count,
       last_message_at)
    VALUES
      ('ee040001-0000-0000-0000-000000000002',
       'cc000002-0000-0000-0000-000000000003',
       'closed', 0, 0,
       now() - interval '5 days')
    ON CONFLICT (id) DO NOTHING;
  END IF;
END $$;

-- =============================================================================
-- Prompt 110 — Statement transparency demo seed.
--
-- Conditional: only inserts demo rows when at least one owner_statement
-- already exists.  In a fresh demo the statement pipeline has not run
-- yet, so the seed no-ops gracefully.
-- =============================================================================
DO $$
DECLARE
  demo_statement_id uuid;
  demo_owner_id uuid;
  demo_villa_id uuid;
  demo_currency text;
  group_dbk_id uuid;
  group_ota_id uuid;
  group_gs_id uuid;
  group_os_id uuid;
  group_util_id uuid;
  group_mfee_id uuid;
  group_res_id uuid;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.tables
     WHERE table_name = 'statement_source_groups'
  ) THEN
    RAISE NOTICE 'Statement transparency tables not present — skipping P110 seed.';
    RETURN;
  END IF;

  -- Pick the most recent issued/approved/paid statement, if any.
  SELECT id, owner_id, villa_id, currency
    INTO demo_statement_id, demo_owner_id, demo_villa_id, demo_currency
    FROM owner_statements
   WHERE status IN ('issued', 'approved', 'paid')
   ORDER BY created_at DESC
   LIMIT 1;

  IF demo_statement_id IS NULL THEN
    RAISE NOTICE 'No issued statement to attach P110 demo data — skipping.';
    RETURN;
  END IF;

  -- Idempotent: skip if we've already seeded for this statement.
  IF EXISTS (
    SELECT 1 FROM statement_source_groups
     WHERE owner_statement_id = demo_statement_id
       AND group_key = 'direct_booking_revenue'
  ) THEN
    RETURN;
  END IF;

  INSERT INTO statement_source_groups
    (id, owner_statement_id, owner_id, villa_id, group_key, group_label,
     group_description, gross_amount_minor, deduction_amount_minor,
     net_amount_minor, currency, line_count, sort_order, owner_visible)
  VALUES
    (gen_random_uuid(), demo_statement_id, demo_owner_id, demo_villa_id,
     'direct_booking_revenue', 'Direct booking revenue',
     'Revenue from bookings made directly through Arconique.',
     482000, 0, 482000, demo_currency, 2, 10, true)
  RETURNING id INTO group_dbk_id;

  INSERT INTO statement_source_groups
    (id, owner_statement_id, owner_id, villa_id, group_key, group_label,
     group_description, gross_amount_minor, deduction_amount_minor,
     net_amount_minor, currency, line_count, sort_order, owner_visible)
  VALUES
    (gen_random_uuid(), demo_statement_id, demo_owner_id, demo_villa_id,
     'ota_revenue', 'OTA / platform revenue',
     'Revenue from Airbnb / Booking.com / Vrbo and similar platforms.',
     614000, 30700, 583300, demo_currency, 1, 20, true)
  RETURNING id INTO group_ota_id;

  INSERT INTO statement_source_groups
    (id, owner_statement_id, owner_id, villa_id, group_key, group_label,
     group_description, gross_amount_minor, deduction_amount_minor,
     net_amount_minor, currency, line_count, sort_order, owner_visible)
  VALUES
    (gen_random_uuid(), demo_statement_id, demo_owner_id, demo_villa_id,
     'guest_service_revenue', 'Guest services & upsells',
     'Concierge service orders and in-stay upsells.',
     74000, 0, 74000, demo_currency, 1, 30, true)
  RETURNING id INTO group_gs_id;

  INSERT INTO statement_source_groups
    (id, owner_statement_id, owner_id, villa_id, group_key, group_label,
     group_description, gross_amount_minor, deduction_amount_minor,
     net_amount_minor, currency, line_count, sort_order, owner_visible)
  VALUES
    (gen_random_uuid(), demo_statement_id, demo_owner_id, demo_villa_id,
     'owner_stay_charges', 'Owner stay charges',
     'Operational charges associated with owner stays.',
     0, 12000, -12000, demo_currency, 1, 40, true)
  RETURNING id INTO group_os_id;

  INSERT INTO statement_source_groups
    (id, owner_statement_id, owner_id, villa_id, group_key, group_label,
     group_description, gross_amount_minor, deduction_amount_minor,
     net_amount_minor, currency, line_count, sort_order, owner_visible)
  VALUES
    (gen_random_uuid(), demo_statement_id, demo_owner_id, demo_villa_id,
     'utility_charges', 'Utilities',
     'Electricity, water, internet recorded against the villa.',
     0, 21500, -21500, demo_currency, 1, 60, true)
  RETURNING id INTO group_util_id;

  INSERT INTO statement_source_groups
    (id, owner_statement_id, owner_id, villa_id, group_key, group_label,
     group_description, gross_amount_minor, deduction_amount_minor,
     net_amount_minor, currency, line_count, sort_order, owner_visible)
  VALUES
    (gen_random_uuid(), demo_statement_id, demo_owner_id, demo_villa_id,
     'management_fees', 'Management fees',
     'Management fees billed for the period.',
     0, 197580, -197580, demo_currency, 1, 90, true)
  RETURNING id INTO group_mfee_id;

  INSERT INTO statement_source_groups
    (id, owner_statement_id, owner_id, villa_id, group_key, group_label,
     group_description, gross_amount_minor, deduction_amount_minor,
     net_amount_minor, currency, line_count, sort_order, owner_visible)
  VALUES
    (gen_random_uuid(), demo_statement_id, demo_owner_id, demo_villa_id,
     'reserves', 'Reserve movements',
     'Funds added to / released from your reserve balance.',
     0, 50000, -50000, demo_currency, 1, 110, true)
  RETURNING id INTO group_res_id;

  -- Source-group lines bridge the first six statement lines into the
  -- right groups.  We don't fabricate statement_lines if none exist —
  -- the rebuild action will produce real bridges from the actual lines.

  -- Statement reconciliation warnings — five examples.
  INSERT INTO statement_reconciliation_warnings
    (id, owner_statement_id, owner_id, villa_id,
     warning_type, severity, owner_visible,
     owner_title, owner_message,
     internal_title, internal_message,
     source_table, source_id, status)
  VALUES
    (gen_random_uuid(), demo_statement_id, demo_owner_id, demo_villa_id,
     'pending_direct_booking_revenue', 'warning', true,
     'A booking is awaiting reconciliation',
     'A direct booking has been confirmed but its revenue has not yet appeared in this statement. It is expected to be included after finance reconciliation.',
     'Pending direct-booking revenue',
     'A direct-booking finance link is in `pending` status for a converted booking that overlaps this statement period.',
     'direct_booking_finance_links', NULL, 'open'),
    (gen_random_uuid(), demo_statement_id, demo_owner_id, demo_villa_id,
     'locked_period_skipped', 'warning', false,
     NULL, NULL,
     'Locked-period skip',
     'A finance bridge attempted to post into a locked statement period and skipped. Manual journal review is required.',
     'direct_booking_finance_links', NULL, 'open'),
    (gen_random_uuid(), demo_statement_id, demo_owner_id, demo_villa_id,
     'missing_source_trace', 'warning', false,
     NULL, NULL,
     'Missing source trace',
     'A statement_lines row has no source_table / source_id — likely a manual entry that needs trace metadata.',
     'statement_lines', NULL, 'open'),
    (gen_random_uuid(), demo_statement_id, demo_owner_id, demo_villa_id,
     'currency_mismatch', 'warning', true,
     'Mixed currencies were detected on this statement',
     'More than one currency appears on this statement. Conversion is not applied automatically. Please contact the finance team if this affects you.',
     'Currency mismatch',
     'Statement_lines for this statement contain more than one currency.',
     'owner_statements', demo_statement_id, 'open'),
    (gen_random_uuid(), demo_statement_id, demo_owner_id, demo_villa_id,
     'manual_review_required', 'info', false,
     NULL, NULL,
     'Manual review required',
     'Operator flagged this statement for manual review before approval.',
     NULL, NULL, 'acknowledged')
  ON CONFLICT DO NOTHING;

  -- One ready explanation snapshot.
  INSERT INTO statement_explanation_snapshots
    (id, owner_statement_id, owner_id, headline, summary,
     bullet_points, payout_explanation, revenue_explanation,
     deduction_explanation, reserve_explanation, warning_explanation,
     currency, total_revenue_minor, total_deductions_minor,
     net_payout_minor)
  VALUES
    (gen_random_uuid(), demo_statement_id, demo_owner_id,
     'Your statement is ready for review.',
     'This statement includes direct booking revenue, OTA stays, guest-service revenue, management fees, reserve movements, and owner-stay related charges for the period.',
     '["Direct bookings contributed gross accommodation revenue.", "OTA / platform bookings contributed before platform-related deductions.", "Guest services and upsells added additional revenue.", "Management fees and reserves reduced the current payout."]'::jsonb,
     'Your expected net payout for this statement is derived from gross revenue minus charges, fees, taxes, and reserve movements.',
     'Direct bookings, OTA stays, and guest services all contributed to this period.',
     'Management fees, owner-stay charges, utilities, and reserve additions reduced the payout.',
     'Funds were added to your reserve balance for upcoming maintenance and contingency cover.',
     'Some finance items have been flagged for operator review. Your statement remains accurate; the team will reach out if anything affects your final payout.',
     demo_currency, 1170000, 311080, 858920)
  ON CONFLICT (owner_statement_id) DO NOTHING;
END $$;

-- =============================================================================
-- Prompt 111 — Security baseline & operational hardening demo seed.
--
-- Inserts a small set of demo login attempts, security events, and job
-- locks so the new admin pages render with realistic data.  No real
-- emails / IPs / secrets — every value is a fixture, and missing
-- migrations cause the seed to no-op gracefully.
-- =============================================================================
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.tables
     WHERE table_name = 'auth_login_attempts'
  ) THEN
    RAISE NOTICE 'Security tables not present — skipping P111 seed.';
    RETURN;
  END IF;

  -- Login attempts (no real PII).
  INSERT INTO auth_login_attempts
    (id, email_normalized, ip_hash, user_agent_hash, succeeded, failure_reason, locked_until, created_at)
  VALUES
    (gen_random_uuid(), 'demo.admin@arconique.local', '0123456789abcdef', 'fedcba9876543210',
     true, NULL, NULL, now() - interval '5 minutes'),
    (gen_random_uuid(), 'demo.investor@arconique.local', '11111111aaaaaaaa', 'fedcba9876543210',
     false, 'wrong_password', NULL, now() - interval '2 hours'),
    (gen_random_uuid(), 'demo.investor@arconique.local', '11111111aaaaaaaa', 'fedcba9876543210',
     false, 'wrong_password', NULL, now() - interval '1 hour 55 minutes'),
    (gen_random_uuid(), 'demo.intruder@arconique.local', '22222222bbbbbbbb', '33333333cccccccc',
     false, 'wrong_password', now() + interval '14 minutes', now() - interval '1 minute')
  ON CONFLICT DO NOTHING;

  -- Security events.
  INSERT INTO auth_security_events
    (id, event_type, severity, ip_hash, metadata, created_at)
  VALUES
    (gen_random_uuid(), 'login_locked', 'warning', '22222222bbbbbbbb',
     '{"email":"demo.intruder@arconique.local","reason":"max_failed_per_email"}'::jsonb,
     now() - interval '1 minute'),
    (gen_random_uuid(), 'mfa_enrolled', 'info', NULL,
     '{"stage":"started"}'::jsonb,
     now() - interval '6 hours'),
    (gen_random_uuid(), 'mfa_verified', 'info', NULL,
     '{"stage":"enrolment"}'::jsonb,
     now() - interval '5 hours 55 minutes'),
    (gen_random_uuid(), 'job_lock_skipped', 'info', NULL,
     '{"jobKey":"deliver_pending_notifications","lockedBy":"cron:notif"}'::jsonb,
     now() - interval '30 minutes')
  ON CONFLICT DO NOTHING;

  -- Job locks: one active, one expired.
  INSERT INTO job_locks
    (id, job_key, status, locked_by, locked_at, expires_at, released_at, metadata)
  VALUES
    (gen_random_uuid(), 'demo_active_job', 'locked', 'cron:demo',
     now() - interval '2 minutes', now() + interval '8 minutes', NULL,
     '{"demo":true}'::jsonb),
    (gen_random_uuid(), 'demo_stale_job', 'expired', 'cron:demo',
     now() - interval '1 hour', now() - interval '50 minutes',
     now() - interval '1 minute', '{"demo":true,"prior_status":"locked"}'::jsonb)
  ON CONFLICT (job_key) DO NOTHING;
END $$;
