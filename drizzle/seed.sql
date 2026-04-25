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
