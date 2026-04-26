-- Arconique Management OS — Demo seed data
-- Idempotent. Apply after 0000_initial.sql.
-- psql "$DIRECT_URL" -f drizzle/seed.sql
-- Everything labelled "demo" — never use in production.

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
INSERT INTO villas (id, project_id, slug, unit_code, name, status, bedrooms, bathrooms, built_area_sqm, view_type, management_model, current_nightly_rate_usd)
VALUES
  -- Eternal (hybrid)
  ('1eda0002-0000-0000-0000-000000000001', '1eda0001-0000-0000-0000-000000000001', 'eternal-s1', 'EV-S1', 'Eternal S1', 'occupied', 3, 3.5, 220, 'jungle', 'hybrid', 520),
  ('1eda0002-0000-0000-0000-000000000002', '1eda0001-0000-0000-0000-000000000001', 'eternal-s2', 'EV-S2', 'Eternal S2', 'cleaning', 3, 3.5, 220, 'jungle', 'hybrid', 520),
  ('1eda0002-0000-0000-0000-000000000003', '1eda0001-0000-0000-0000-000000000001', 'eternal-s5', 'EV-S5', 'Eternal S5', 'ready', 4, 4.5, 280, 'rice_field', 'hybrid', 720),
  ('1eda0002-0000-0000-0000-000000000004', '1eda0001-0000-0000-0000-000000000001', 'eternal-s6', 'EV-S6', 'Eternal S6', 'inspection', 4, 4.5, 280, 'rice_field', 'hybrid', 720),

  -- Enso (pooled)
  ('1eda0002-0000-0000-0000-000000000010', '1eda0001-0000-0000-0000-000000000002', 'enso-s1', 'ES-S1', 'Enso S1', 'occupied', 3, 3.5, 200, 'garden', 'pooled', 610),
  ('1eda0002-0000-0000-0000-000000000011', '1eda0001-0000-0000-0000-000000000002', 'enso-s2', 'ES-S2', 'Enso S2', 'cleaning', 3, 3.5, 200, 'garden', 'pooled', 610),
  ('1eda0002-0000-0000-0000-000000000012', '1eda0001-0000-0000-0000-000000000002', 'enso-s5', 'ES-S5', 'Enso S5', 'ready', 4, 4.5, 260, 'ocean', 'pooled', 820),
  ('1eda0002-0000-0000-0000-000000000013', '1eda0001-0000-0000-0000-000000000002', 'enso-s6', 'ES-S6', 'Enso S6', 'maintenance_blocked', 4, 4.5, 260, 'ocean', 'pooled', 820),

  -- Ahau (individual)
  ('1eda0002-0000-0000-0000-000000000020', '1eda0001-0000-0000-0000-000000000003', 'ahau-01', 'AH-01', 'Ahau 01', 'ready', 3, 3.0, 210, 'garden', 'individual', 690),
  ('1eda0002-0000-0000-0000-000000000021', '1eda0001-0000-0000-0000-000000000003', 'ahau-02', 'AH-02', 'Ahau 02', 'checkout_pending', 4, 4.0, 250, 'garden', 'individual', 760)
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
     'ac', 'high', 'scheduled', true, 'USD', 18000),
    ('1eda0b02-0000-0000-0000-000000000002', 'MNT-20260425-0002',
     '1eda0002-0000-0000-0000-000000000004', '1eda0001-0000-0000-0000-000000000001',
     'Pool pump intermittent', 'Pump cycling off mid-day — likely thermal cutout. Awaiting parts.',
     'pool', 'normal', 'waiting_parts', true, 'USD', 35000),
    ('1eda0b02-0000-0000-0000-000000000003', 'MNT-20260425-0003',
     '1eda0002-0000-0000-0000-000000000020', '1eda0001-0000-0000-0000-000000000003',
     'Wi-Fi access point offline', 'Lobby AP unresponsive. Power-cycle scheduled.',
     'internet', 'high', 'open', false, 'USD', NULL)
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
     'low', 'under_review', true, false, 'USD', 4500),
    ('1eda0b05-0000-0000-0000-000000000002',
     '1eda0002-0000-0000-0000-000000000021',
     'Wine stain on living-room rug', 'Spot-treated; deep cleaning quoted.',
     'normal', 'approved', false, true, 'USD', 12500)
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
