-- =============================================================================
-- Development OS · Stage 2.1 demo seed
--
-- Seeds three demonstration projects (Eternal Villas, Enso Villas,
-- Ahau Gardens) with their development metadata, parallel phase timeline,
-- land plots, unit type templates, and per-villa development meta.
--
-- Idempotent: every INSERT is guarded with ON CONFLICT or NOT EXISTS so the
-- file can be re-applied safely.
--
-- Apply order:  drizzle/seed.sql  →  drizzle/seed/development-stage-2-1.sql
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Roles for Development OS access. Seeded into the existing `roles` table.
-- -----------------------------------------------------------------------------
INSERT INTO roles (key, name, description, is_system) VALUES
  ('dev_os_admin', 'Development OS Admin', 'Full access to Development OS', true),
  ('dev_os_project_manager', 'Development OS Project Manager', 'Read/write assigned projects only', true),
  ('dev_os_viewer', 'Development OS Viewer', 'Read-only access to Development OS', true)
ON CONFLICT (key) DO UPDATE SET
  name = EXCLUDED.name,
  description = EXCLUDED.description;

-- -----------------------------------------------------------------------------
-- Three demo projects. Use deterministic UUIDs so re-applies update in place.
-- -----------------------------------------------------------------------------

-- Eternal Villas — Ungasan, under construction, 8 units, 6 sold
INSERT INTO projects (id, slug, name, concept, location, area, description, status, management_status, total_villas, target_handover_date)
VALUES (
  '11111111-1111-4111-8111-111111111101',
  'eternal-villas',
  'Eternal Villas',
  'Eight ocean-view residences above Ungasan cliffs',
  'Ungasan, Bali',
  'Ungasan',
  'Eight architect-designed villas overlooking the Indian Ocean. Hybrid ownership with shared operating reserves.',
  'under_construction',
  'onboarding',
  8,
  '2026-09-30'
)
ON CONFLICT (slug) DO UPDATE SET
  name = EXCLUDED.name,
  concept = EXCLUDED.concept,
  location = EXCLUDED.location,
  area = EXCLUDED.area,
  description = EXCLUDED.description,
  status = EXCLUDED.status,
  total_villas = EXCLUDED.total_villas,
  target_handover_date = EXCLUDED.target_handover_date;

-- Enso Villas — Pererenan, under construction, 9 units, 2 sold
INSERT INTO projects (id, slug, name, concept, location, area, description, status, management_status, total_villas, target_handover_date)
VALUES (
  '11111111-1111-4111-8111-111111111102',
  'enso-villas',
  'Enso Villas',
  'Circle-inspired retreats in Pererenan',
  'Pererenan, Bali',
  'Pererenan',
  'Nine fully-pooled villas operated as one hospitality asset.',
  'under_construction',
  'onboarding',
  9,
  '2027-04-30'
)
ON CONFLICT (slug) DO UPDATE SET
  name = EXCLUDED.name,
  status = EXCLUDED.status,
  total_villas = EXCLUDED.total_villas,
  target_handover_date = EXCLUDED.target_handover_date;

-- Ahau Gardens — Ubud, permitting, 12 units, 0 sold
INSERT INTO projects (id, slug, name, concept, location, area, description, status, management_status, total_villas, target_handover_date)
VALUES (
  '11111111-1111-4111-8111-111111111103',
  'ahau-gardens',
  'Ahau Gardens',
  'Garden residences along the Ayung valley',
  'Ubud, Bali',
  'Ubud',
  'Twelve individually-owned garden villas with shared landscape and security.',
  'planning',
  'onboarding',
  12,
  '2027-12-15'
)
ON CONFLICT (slug) DO UPDATE SET
  name = EXCLUDED.name,
  status = EXCLUDED.status,
  total_villas = EXCLUDED.total_villas,
  target_handover_date = EXCLUDED.target_handover_date;

-- -----------------------------------------------------------------------------
-- development_project_meta — 1:1 extension
-- -----------------------------------------------------------------------------
INSERT INTO development_project_meta (
  project_id, acquisition_mode, lease_tenure_years, lease_start_date, lease_end_date,
  land_area_sqm, gross_square_meters, net_square_meters, acquisition_date,
  planned_handover_date, project_currency, operational_currency, notes
)
VALUES
  ('11111111-1111-4111-8111-111111111101', 'leasehold', 30, '2024-09-01', '2054-09-01',
    8400.00, 6800.00, 5400.00, '2024-09-15', '2026-09-30', 'USD', 'IDR',
    'Hybrid ownership: 6 sold individual + pooled rental fund.'),
  ('11111111-1111-4111-8111-111111111102', 'leasehold', 30, '2025-04-01', '2055-04-01',
    11200.00, 9100.00, 7400.00, '2025-04-10', '2027-04-30', 'USD', 'IDR',
    'Pooled-only model.'),
  ('11111111-1111-4111-8111-111111111103', 'joint_venture', NULL, NULL, NULL,
    14600.00, 10200.00, 8800.00, '2025-11-15', '2027-12-15', 'USD', 'IDR',
    'JV with landowner — earnings share negotiated at 35/65.')
ON CONFLICT (project_id) DO UPDATE SET
  acquisition_mode = EXCLUDED.acquisition_mode,
  lease_tenure_years = EXCLUDED.lease_tenure_years,
  lease_start_date = EXCLUDED.lease_start_date,
  lease_end_date = EXCLUDED.lease_end_date,
  land_area_sqm = EXCLUDED.land_area_sqm,
  gross_square_meters = EXCLUDED.gross_square_meters,
  net_square_meters = EXCLUDED.net_square_meters,
  acquisition_date = EXCLUDED.acquisition_date,
  planned_handover_date = EXCLUDED.planned_handover_date,
  notes = EXCLUDED.notes,
  updated_at = now();

-- -----------------------------------------------------------------------------
-- project_phases — parallel timeline per project
--
-- Eternal: design ✓ · permits ✓ · pre_sales ▶ · under_construction ▶
-- Enso:    design ✓ · permits ✓ · pre_sales ▶ · under_construction ▶
-- Ahau:    design ✓ · permits ▶ (rejected, resubmitting) · pre_sales not_started
-- -----------------------------------------------------------------------------

-- Stable per-row IDs (deterministic) so re-runs stay idempotent.
INSERT INTO project_phases (id, project_id, phase_type, status, planned_start_date, actual_start_date, planned_end_date, actual_end_date, notes)
VALUES
  -- Eternal Villas
  ('22222222-2222-4222-8222-100000000001', '11111111-1111-4111-8111-111111111101', 'land_sourcing',      'completed',   '2024-06-01','2024-06-15','2024-09-01','2024-09-15', NULL),
  ('22222222-2222-4222-8222-100000000002', '11111111-1111-4111-8111-111111111101', 'due_diligence',      'completed',   '2024-07-01','2024-07-10','2024-09-01','2024-09-05', NULL),
  ('22222222-2222-4222-8222-100000000003', '11111111-1111-4111-8111-111111111101', 'design',             'completed',   '2024-09-15','2024-09-20','2025-02-01','2025-02-10', 'IBUKU lead architect'),
  ('22222222-2222-4222-8222-100000000004', '11111111-1111-4111-8111-111111111101', 'permits',            'completed',   '2025-01-15','2025-01-20','2025-03-15','2025-03-22', NULL),
  ('22222222-2222-4222-8222-100000000005', '11111111-1111-4111-8111-111111111101', 'pre_sales',          'in_progress', '2025-03-01','2025-03-12','2026-08-31', NULL,         '6 of 8 reserved'),
  ('22222222-2222-4222-8222-100000000006', '11111111-1111-4111-8111-111111111101', 'under_construction', 'in_progress', '2025-04-01','2025-04-08','2026-09-15', NULL,         '64% cost-loaded progress'),

  -- Enso Villas
  ('22222222-2222-4222-8222-100000000010', '11111111-1111-4111-8111-111111111102', 'land_sourcing',      'completed',   '2024-12-01','2024-12-10','2025-04-01','2025-04-08', NULL),
  ('22222222-2222-4222-8222-100000000011', '11111111-1111-4111-8111-111111111102', 'due_diligence',      'completed',   '2025-01-01','2025-01-15','2025-03-15','2025-03-20', NULL),
  ('22222222-2222-4222-8222-100000000012', '11111111-1111-4111-8111-111111111102', 'design',             'completed',   '2025-04-15','2025-04-20','2025-08-15','2025-08-22', NULL),
  ('22222222-2222-4222-8222-100000000013', '11111111-1111-4111-8111-111111111102', 'permits',            'completed',   '2025-08-01','2025-08-10','2025-09-15','2025-09-18', NULL),
  ('22222222-2222-4222-8222-100000000014', '11111111-1111-4111-8111-111111111102', 'pre_sales',          'in_progress', '2025-09-01','2025-09-15','2027-04-15', NULL,         '2 of 9 reserved'),
  ('22222222-2222-4222-8222-100000000015', '11111111-1111-4111-8111-111111111102', 'under_construction', 'in_progress', '2025-09-15','2025-09-22','2027-04-15', NULL,         '22% progress, 8 days ahead'),

  -- Ahau Gardens
  ('22222222-2222-4222-8222-100000000020', '11111111-1111-4111-8111-111111111103', 'land_sourcing',      'completed',   '2025-08-01','2025-08-15','2025-11-15','2025-11-20', NULL),
  ('22222222-2222-4222-8222-100000000021', '11111111-1111-4111-8111-111111111103', 'due_diligence',      'completed',   '2025-09-15','2025-10-01','2025-12-01','2025-12-08', NULL),
  ('22222222-2222-4222-8222-100000000022', '11111111-1111-4111-8111-111111111103', 'design',             'completed',   '2025-12-01','2025-12-10','2026-03-15','2026-03-20', NULL),
  ('22222222-2222-4222-8222-100000000023', '11111111-1111-4111-8111-111111111103', 'permits',            'in_progress', '2026-02-01','2026-02-12','2026-04-15', NULL,         'PBG rejected on setback definition; redesign of north edge')
ON CONFLICT (id) DO UPDATE SET
  status = EXCLUDED.status,
  planned_start_date = EXCLUDED.planned_start_date,
  actual_start_date = EXCLUDED.actual_start_date,
  planned_end_date = EXCLUDED.planned_end_date,
  actual_end_date = EXCLUDED.actual_end_date,
  notes = EXCLUDED.notes,
  updated_at = now();

-- -----------------------------------------------------------------------------
-- land_plots — one plot per project for 2.1 demo
-- -----------------------------------------------------------------------------
INSERT INTO land_plots (project_id, plot_code, acquisition_mode, owner_contact_name, area_sqm,
  acquisition_date, purchase_price_minor, purchase_currency, upfront_amount_minor,
  balance_installments, lease_start_date, lease_end_date, notes)
VALUES
  ('11111111-1111-4111-8111-111111111101', 'EV-PLOT-01', 'leasehold', 'Pak Wayan Subagia',
    8400.00, '2024-09-15', 1280000000::bigint, 'USD', 384000000::bigint,
    '[
      { "amount": 320000, "currency": "USD", "dueDate": "2025-03-15", "status": "paid", "paidAt": "2025-03-12" },
      { "amount": 320000, "currency": "USD", "dueDate": "2025-09-15", "status": "paid", "paidAt": "2025-09-10" },
      { "amount": 256000, "currency": "USD", "dueDate": "2026-03-15", "status": "pending" }
    ]'::jsonb,
    '2024-09-15', '2054-09-15',
    '30-year leasehold, two extension options at year 25.'),
  ('11111111-1111-4111-8111-111111111102', 'ES-PLOT-01', 'leasehold', 'Putu Astawa',
    11200.00, '2025-04-10', 1840000000::bigint, 'USD', 552000000::bigint,
    '[
      { "amount": 460000, "currency": "USD", "dueDate": "2025-10-10", "status": "paid", "paidAt": "2025-10-08" },
      { "amount": 460000, "currency": "USD", "dueDate": "2026-04-10", "status": "pending" },
      { "amount": 368000, "currency": "USD", "dueDate": "2026-10-10", "status": "pending" }
    ]'::jsonb,
    '2025-04-10', '2055-04-10', NULL),
  ('11111111-1111-4111-8111-111111111103', 'AH-PLOT-01', 'joint_venture', 'Made Sudarsana family',
    14600.00, '2025-11-15', 0, 'USD', 0,
    '[]'::jsonb,
    NULL, NULL,
    'JV — landowner contributes plot at 35% net profit share, no cash purchase.')
ON CONFLICT (project_id, plot_code) DO UPDATE SET
  area_sqm = EXCLUDED.area_sqm,
  purchase_price_minor = EXCLUDED.purchase_price_minor,
  upfront_amount_minor = EXCLUDED.upfront_amount_minor,
  balance_installments = EXCLUDED.balance_installments,
  notes = EXCLUDED.notes,
  updated_at = now();

-- -----------------------------------------------------------------------------
-- unit_types — project-scoped templates
-- -----------------------------------------------------------------------------
INSERT INTO unit_types (project_id, name, spec_json, base_plot_area_sqm, base_building_area_sqm,
  base_price_minor, base_price_currency, description)
VALUES
  ('11111111-1111-4111-8111-111111111101', 'Type L',
    '{"bedrooms":3,"bathrooms":3.5,"hasPool":true,"livingRooms":2}'::jsonb,
    560.00, 320.00, 78000000::bigint, 'USD', 'Three-bedroom ocean-view, plunge pool.'),
  ('11111111-1111-4111-8111-111111111101', 'Type Q',
    '{"bedrooms":4,"bathrooms":4.5,"hasPool":true,"livingRooms":2}'::jsonb,
    720.00, 410.00, 96000000::bigint, 'USD', 'Four-bedroom corner unit, infinity pool.'),
  ('11111111-1111-4111-8111-111111111102', 'Type V',
    '{"bedrooms":3,"bathrooms":3.0,"hasPool":true,"livingRooms":1}'::jsonb,
    640.00, 360.00, 88000000::bigint, 'USD', 'Three-bedroom with shared landscape pool.'),
  ('11111111-1111-4111-8111-111111111103', 'Type R',
    '{"bedrooms":2,"bathrooms":2.0,"hasPool":false,"livingRooms":1}'::jsonb,
    480.00, 220.00, 52000000::bigint, 'USD', 'Two-bedroom garden residence.')
ON CONFLICT (project_id, name) DO UPDATE SET
  spec_json = EXCLUDED.spec_json,
  base_plot_area_sqm = EXCLUDED.base_plot_area_sqm,
  base_building_area_sqm = EXCLUDED.base_building_area_sqm,
  base_price_minor = EXCLUDED.base_price_minor,
  base_price_currency = EXCLUDED.base_price_currency,
  description = EXCLUDED.description,
  updated_at = now();

-- -----------------------------------------------------------------------------
-- villas + unit_development_meta — demo units per project
--
-- Note: villas already exist in the seed.sql for some projects, so we
-- INSERT … ON CONFLICT to be safe, then upsert unit_development_meta.
-- Use deterministic IDs so re-runs are stable.
-- -----------------------------------------------------------------------------

-- Eternal: 8 villas, 6 sold (units 01-06), 2 available (07-08)
INSERT INTO villas (id, project_id, slug, unit_code, name, status, bedrooms)
VALUES
  ('33333333-3333-4333-8333-100000000001', '11111111-1111-4111-8111-111111111101', 'eternal-01', 'EV-01', 'Eternal Villa 01', 'ready', 3),
  ('33333333-3333-4333-8333-100000000002', '11111111-1111-4111-8111-111111111101', 'eternal-02', 'EV-02', 'Eternal Villa 02', 'ready', 3),
  ('33333333-3333-4333-8333-100000000003', '11111111-1111-4111-8111-111111111101', 'eternal-03', 'EV-03', 'Eternal Villa 03', 'ready', 3),
  ('33333333-3333-4333-8333-100000000004', '11111111-1111-4111-8111-111111111101', 'eternal-04', 'EV-04', 'Eternal Villa 04', 'ready', 4),
  ('33333333-3333-4333-8333-100000000005', '11111111-1111-4111-8111-111111111101', 'eternal-05', 'EV-05', 'Eternal Villa 05', 'ready', 4),
  ('33333333-3333-4333-8333-100000000006', '11111111-1111-4111-8111-111111111101', 'eternal-06', 'EV-06', 'Eternal Villa 06', 'ready', 3),
  ('33333333-3333-4333-8333-100000000007', '11111111-1111-4111-8111-111111111101', 'eternal-07', 'EV-07', 'Eternal Villa 07', 'ready', 3),
  ('33333333-3333-4333-8333-100000000008', '11111111-1111-4111-8111-111111111101', 'eternal-08', 'EV-08', 'Eternal Villa 08', 'ready', 4),
  -- Enso: 9 villas
  ('33333333-3333-4333-8333-200000000001', '11111111-1111-4111-8111-111111111102', 'enso-01', 'ES-01', 'Enso Villa 01', 'ready', 3),
  ('33333333-3333-4333-8333-200000000002', '11111111-1111-4111-8111-111111111102', 'enso-02', 'ES-02', 'Enso Villa 02', 'ready', 3),
  ('33333333-3333-4333-8333-200000000003', '11111111-1111-4111-8111-111111111102', 'enso-03', 'ES-03', 'Enso Villa 03', 'ready', 3),
  ('33333333-3333-4333-8333-200000000004', '11111111-1111-4111-8111-111111111102', 'enso-04', 'ES-04', 'Enso Villa 04', 'ready', 3),
  ('33333333-3333-4333-8333-200000000005', '11111111-1111-4111-8111-111111111102', 'enso-05', 'ES-05', 'Enso Villa 05', 'ready', 3),
  ('33333333-3333-4333-8333-200000000006', '11111111-1111-4111-8111-111111111102', 'enso-06', 'ES-06', 'Enso Villa 06', 'ready', 3),
  ('33333333-3333-4333-8333-200000000007', '11111111-1111-4111-8111-111111111102', 'enso-07', 'ES-07', 'Enso Villa 07', 'ready', 3),
  ('33333333-3333-4333-8333-200000000008', '11111111-1111-4111-8111-111111111102', 'enso-08', 'ES-08', 'Enso Villa 08', 'ready', 3),
  ('33333333-3333-4333-8333-200000000009', '11111111-1111-4111-8111-111111111102', 'enso-09', 'ES-09', 'Enso Villa 09', 'ready', 3),
  -- Ahau: 12 villas
  ('33333333-3333-4333-8333-300000000001', '11111111-1111-4111-8111-111111111103', 'ahau-01', 'AH-01', 'Ahau Villa 01', 'ready', 2),
  ('33333333-3333-4333-8333-300000000002', '11111111-1111-4111-8111-111111111103', 'ahau-02', 'AH-02', 'Ahau Villa 02', 'ready', 2),
  ('33333333-3333-4333-8333-300000000003', '11111111-1111-4111-8111-111111111103', 'ahau-03', 'AH-03', 'Ahau Villa 03', 'ready', 2),
  ('33333333-3333-4333-8333-300000000004', '11111111-1111-4111-8111-111111111103', 'ahau-04', 'AH-04', 'Ahau Villa 04', 'ready', 2),
  ('33333333-3333-4333-8333-300000000005', '11111111-1111-4111-8111-111111111103', 'ahau-05', 'AH-05', 'Ahau Villa 05', 'ready', 2),
  ('33333333-3333-4333-8333-300000000006', '11111111-1111-4111-8111-111111111103', 'ahau-06', 'AH-06', 'Ahau Villa 06', 'ready', 2),
  ('33333333-3333-4333-8333-300000000007', '11111111-1111-4111-8111-111111111103', 'ahau-07', 'AH-07', 'Ahau Villa 07', 'ready', 2),
  ('33333333-3333-4333-8333-300000000008', '11111111-1111-4111-8111-111111111103', 'ahau-08', 'AH-08', 'Ahau Villa 08', 'ready', 2),
  ('33333333-3333-4333-8333-300000000009', '11111111-1111-4111-8111-111111111103', 'ahau-09', 'AH-09', 'Ahau Villa 09', 'ready', 2),
  ('33333333-3333-4333-8333-300000000010', '11111111-1111-4111-8111-111111111103', 'ahau-10', 'AH-10', 'Ahau Villa 10', 'ready', 2),
  ('33333333-3333-4333-8333-300000000011', '11111111-1111-4111-8111-111111111103', 'ahau-11', 'AH-11', 'Ahau Villa 11', 'ready', 2),
  ('33333333-3333-4333-8333-300000000012', '11111111-1111-4111-8111-111111111103', 'ahau-12', 'AH-12', 'Ahau Villa 12', 'ready', 2)
ON CONFLICT (id) DO UPDATE SET
  unit_code = EXCLUDED.unit_code,
  name = EXCLUDED.name,
  bedrooms = EXCLUDED.bedrooms;

-- unit_development_meta — link each villa to its type and stage state
INSERT INTO unit_development_meta (
  villa_id, unit_type_id, unit_category, location_coefficient, location_description,
  construction_status, construction_progress_percent,
  cost_basis_minor, cost_basis_currency,
  target_sale_price_minor, target_sale_currency,
  current_market_price_minor, current_market_currency,
  contract_price_minor, contract_currency, unit_type_frozen
)
SELECT
  v.id, ut.id, 'villa',
  CASE WHEN v.unit_code IN ('EV-01','EV-08','ES-01','ES-09') THEN 1.150 ELSE 1.000 END,
  CASE WHEN v.unit_code IN ('EV-01','EV-08','ES-01','ES-09') THEN 'Corner / premium edge' ELSE NULL END,
  CASE
    WHEN v.unit_code IN ('EV-01','EV-02') THEN 'finishing'
    WHEN v.unit_code IN ('EV-03','EV-04','EV-05','EV-06') THEN 'mep'
    WHEN v.unit_code IN ('EV-07','EV-08') THEN 'structure'
    WHEN v.unit_code LIKE 'ES-%' THEN 'foundation'
    ELSE 'planning'
  END,
  CASE
    WHEN v.unit_code IN ('EV-01','EV-02') THEN 82.00
    WHEN v.unit_code IN ('EV-03','EV-04','EV-05','EV-06') THEN 64.00
    WHEN v.unit_code IN ('EV-07','EV-08') THEN 38.00
    WHEN v.unit_code LIKE 'ES-%' THEN 22.00
    ELSE 0.00
  END,
  CASE
    WHEN v.unit_code LIKE 'EV-%' THEN 52000000::bigint
    WHEN v.unit_code LIKE 'ES-%' THEN 60000000::bigint
    ELSE 38000000::bigint
  END,
  'USD',
  CASE WHEN ut.base_price_minor IS NOT NULL
    THEN (ut.base_price_minor * (CASE WHEN v.unit_code IN ('EV-01','EV-08','ES-01','ES-09') THEN 1150 ELSE 1000 END) / 1000)::bigint
    ELSE NULL END,
  ut.base_price_currency,
  CASE WHEN ut.base_price_minor IS NOT NULL
    THEN (ut.base_price_minor * (CASE WHEN v.unit_code IN ('EV-01','EV-08','ES-01','ES-09') THEN 1180 ELSE 1020 END) / 1000)::bigint
    ELSE NULL END,
  ut.base_price_currency,
  -- Sold = first 6 EV units, first 2 ES units
  CASE
    WHEN v.unit_code IN ('EV-01','EV-02','EV-03','EV-04','EV-05','EV-06')
      THEN (ut.base_price_minor * (CASE WHEN v.unit_code IN ('EV-01') THEN 1150 ELSE 1000 END) / 1000)::bigint
    WHEN v.unit_code IN ('ES-01','ES-02')
      THEN (ut.base_price_minor * (CASE WHEN v.unit_code IN ('ES-01') THEN 1150 ELSE 1000 END) / 1000)::bigint
    ELSE NULL
  END,
  CASE WHEN v.unit_code IN ('EV-01','EV-02','EV-03','EV-04','EV-05','EV-06','ES-01','ES-02')
    THEN ut.base_price_currency ELSE NULL END,
  v.unit_code IN ('EV-01','EV-02','EV-03','EV-04','EV-05','EV-06','ES-01','ES-02')
FROM villas v
JOIN projects p ON p.id = v.project_id
JOIN unit_types ut ON ut.project_id = p.id
  AND ((p.slug = 'eternal-villas' AND ut.name = CASE WHEN v.bedrooms >= 4 THEN 'Type Q' ELSE 'Type L' END)
    OR (p.slug = 'enso-villas' AND ut.name = 'Type V')
    OR (p.slug = 'ahau-gardens' AND ut.name = 'Type R'))
WHERE v.project_id IN (
  '11111111-1111-4111-8111-111111111101',
  '11111111-1111-4111-8111-111111111102',
  '11111111-1111-4111-8111-111111111103'
)
ON CONFLICT (villa_id) DO UPDATE SET
  unit_type_id = EXCLUDED.unit_type_id,
  unit_category = EXCLUDED.unit_category,
  location_coefficient = EXCLUDED.location_coefficient,
  location_description = EXCLUDED.location_description,
  construction_status = EXCLUDED.construction_status,
  construction_progress_percent = EXCLUDED.construction_progress_percent,
  cost_basis_minor = EXCLUDED.cost_basis_minor,
  cost_basis_currency = EXCLUDED.cost_basis_currency,
  target_sale_price_minor = EXCLUDED.target_sale_price_minor,
  target_sale_currency = EXCLUDED.target_sale_currency,
  current_market_price_minor = EXCLUDED.current_market_price_minor,
  current_market_currency = EXCLUDED.current_market_currency,
  contract_price_minor = EXCLUDED.contract_price_minor,
  contract_currency = EXCLUDED.contract_currency,
  unit_type_frozen = EXCLUDED.unit_type_frozen,
  updated_at = now();
