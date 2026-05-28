-- =============================================================================
-- Phase 2 data-wiring PR 1 — Mgmt slice seed
--
-- Adds demo rows for the 4 new tables landed in migration 0112 +
-- exercises the owner_statements ALTER (`owner_state` + the 6 owner-
-- side timestamps/reasons).
--
-- Idempotent: every INSERT uses ON CONFLICT DO NOTHING (or DO UPDATE
-- for the existing-row touch). Re-applying is safe.
--
-- Apply order: drizzle/seed.sql → drizzle/seed/phase-2-mgmt.sql
--
-- Per docs/audits/2026-05-27-phase-2-data-wiring-scope.md § Mgmt P1
-- and phase-2-data-wiring-handoff/prompts/01-mgmt.md Step 2.
--
-- UUID prefix convention for this slice: 1eda0c01..1eda0c0f
-- =============================================================================

DO $$
BEGIN
  -- Schema check: skip cleanly if migration 0112 hasn't applied yet.
  IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'statement_anomalies') THEN
    RAISE NOTICE 'Phase 2 mgmt tables not present — skipping seed.';
    RETURN;
  END IF;

  -- Existence guard: every FK target must already be seeded.
  IF NOT EXISTS (SELECT 1 FROM owners WHERE id = '1eda0003-0000-0000-0000-000000000001') THEN
    RAISE NOTICE 'Base owners not present — skipping phase-2 mgmt seed.';
    RETURN;
  END IF;

  -- ===========================================================================
  -- 1. Additional owners (11 new → 14 total with the 3 in drizzle/seed.sql)
  -- ===========================================================================
  -- The 3 base owners (Emma / Takeda FO / Sonoma Capital) anchor the cabinet
  -- with realistic ownership_shares; these 11 fill the cabinet so the
  -- risk-ring distribution looks dense without overwhelming the demo.

  INSERT INTO owners (id, type, display_name, legal_name, email, phone, nationality, tax_residency, status) VALUES
    ('1eda0c01-0000-0000-0000-000000000001', 'individual',   'Demo Owner — Aisha Ramirez',    'Aisha Ramirez',                    'aisha.demo@arconique.com',    '+1 415 000 0011', 'American',   'United States',   'active'),
    ('1eda0c01-0000-0000-0000-000000000002', 'individual',   'Demo Owner — Hiroshi Tanaka',   'Hiroshi Tanaka',                   'hiroshi.demo@arconique.com',  '+81 3 0000 0011', 'Japanese',   'Japan',           'active'),
    ('1eda0c01-0000-0000-0000-000000000003', 'individual',   'Demo Owner — Linnea Sjöberg',   'Linnea Sjöberg',                   'linnea.demo@arconique.com',   '+46 8 0000 0011', 'Swedish',    'Sweden',          'active'),
    ('1eda0c01-0000-0000-0000-000000000004', 'individual',   'Demo Owner — Rohan Mehta',      'Rohan Mehta',                      'rohan.demo@arconique.com',    '+91 22 000 0011', 'Indian',     'Singapore',       'active'),
    ('1eda0c01-0000-0000-0000-000000000005', 'individual',   'Demo Owner — Chloé Martin',     'Chloé Martin',                     'chloe.demo@arconique.com',    '+33 1 0000 0011', 'French',     'France',          'active'),
    ('1eda0c01-0000-0000-0000-000000000006', 'individual',   'Demo Owner — Daniel Brennan',   'Daniel Brennan',                   'daniel.demo@arconique.com',   '+61 2 0000 0011', 'Australian', 'Australia',       'active'),
    ('1eda0c01-0000-0000-0000-000000000007', 'family_office','Demo Investor — Park Capital',  'Park Capital Holdings Pte. Ltd.',  'park.demo@arconique.com',     '+65 6 000 0011',  'Korean',     'Singapore',       'active'),
    ('1eda0c01-0000-0000-0000-000000000008', 'company',      'Demo Investor — Atlas Equity',  'Atlas Equity LLC',                 'atlas.demo@arconique.com',    '+1 212 000 0011', 'American',   'United States',   'active'),
    ('1eda0c01-0000-0000-0000-000000000009', 'individual',   'Demo Owner — Olusegun Adeyemi', 'Olusegun Adeyemi',                 'olusegun.demo@arconique.com', '+234 1 000 0011', 'Nigerian',   'United Kingdom',  'active'),
    ('1eda0c01-0000-0000-0000-00000000000a', 'individual',   'Demo Owner — Mei-Ling Chen',    'Mei-Ling Chen',                    'meiling.demo@arconique.com',  '+886 2 0000 0011','Taiwanese',  'Taiwan',          'active'),
    ('1eda0c01-0000-0000-0000-00000000000b', 'individual',   'Demo Owner — Andrei Volkov',    'Andrei Volkov',                    'andrei.demo@arconique.com',   '+971 4 000 0011', 'Russian',    'United Arab Emirates','active')
  ON CONFLICT (id) DO UPDATE SET
    display_name = EXCLUDED.display_name,
    email = EXCLUDED.email,
    status = EXCLUDED.status;

  -- ===========================================================================
  -- 2. owner_insights — 8 rows: 3 act / 3 watch / 2 info
  -- ===========================================================================
  -- The 3 `act` insights go on owners flagged risk-ne-none (Park Capital,
  -- Olusegun Adeyemi, Andrei Volkov — the watch/risk pool). Each insight's
  -- payload mirrors what owner-intelligence would emit: metric + window +
  -- recommended next action.

  INSERT INTO owner_insights (id, owner_id, kind, level, payload, fired_at) VALUES
    ('1eda0c02-0000-0000-0000-000000000001', '1eda0c01-0000-0000-0000-000000000007', 'occupancy_trend',     'act',   '{"metric":"occupancy_pct","window_days":90,"value":58.4,"baseline":72.1,"recommended":"Review pricing floor + low-season strategy"}'::jsonb, now() - interval '2 days'),
    ('1eda0c02-0000-0000-0000-000000000002', '1eda0c01-0000-0000-0000-000000000009', 'maintenance_cost',    'act',   '{"metric":"trailing_30d_maintenance_usd","value":4800,"baseline":1450,"recommended":"Investigate AC + plumbing chain; consider preventive sweep"}'::jsonb, now() - interval '5 days'),
    ('1eda0c02-0000-0000-0000-00000000000b', '1eda0c01-0000-0000-0000-00000000000b', 'guest_satisfaction',  'act',   '{"metric":"trailing_review_avg","value":3.6,"baseline":4.4,"recommended":"Walk the property + audit cleaning checklist"}'::jsonb, now() - interval '1 days'),
    ('1eda0c02-0000-0000-0000-000000000003', '1eda0c01-0000-0000-0000-000000000007', 'adr_trend',           'watch', '{"metric":"adr_usd","window_days":60,"value":485,"baseline":520,"recommended":"Watch comp set, no action yet"}'::jsonb, now() - interval '7 days'),
    ('1eda0c02-0000-0000-0000-000000000004', '1eda0c01-0000-0000-0000-000000000003', 'renewal_window',      'watch', '{"days_to_renewal":120,"contract_end":"2026-09-26","recommended":"Schedule renewal call within 30 days"}'::jsonb, now() - interval '14 days'),
    ('1eda0c02-0000-0000-0000-000000000005', '1eda0003-0000-0000-0000-000000000002', 'contract_milestone',  'watch', '{"milestone":"five_year_review","at":"2026-08-15","recommended":"Prepare portfolio brief for Takeda FO"}'::jsonb, now() - interval '21 days'),
    ('1eda0c02-0000-0000-0000-000000000006', '1eda0003-0000-0000-0000-000000000001', 'adr_trend',           'info',  '{"metric":"adr_usd","window_days":30,"value":612,"baseline":608,"note":"Trending flat, informational only"}'::jsonb, now() - interval '3 days'),
    ('1eda0c02-0000-0000-0000-000000000007', '1eda0c01-0000-0000-0000-000000000005', 'occupancy_trend',     'info',  '{"metric":"occupancy_pct","window_days":30,"value":74.0,"baseline":71.8,"note":"Small uptick"}'::jsonb, now() - interval '4 days')
  ON CONFLICT (id) DO UPDATE SET
    level = EXCLUDED.level,
    payload = EXCLUDED.payload;

  -- ===========================================================================
  -- 3. onboarding_drafts — 2 in-flight drafts (step 1 + step 2)
  -- ===========================================================================
  -- director_user_id resolved via subquery: any super_admin app_user. If the
  -- demo seed hasn't created an app_user yet (production runs may seed
  -- through Supabase Auth callback instead), this block becomes a no-op via
  -- the NOT EXISTS guard.

  IF EXISTS (
    SELECT 1
    FROM app_users u
    JOIN app_user_roles r ON r.app_user_id = u.id
    WHERE r.role_key IN ('super_admin','director')
    LIMIT 1
  ) THEN
    INSERT INTO onboarding_drafts (id, director_user_id, step, data) VALUES
      ('1eda0c03-0000-0000-0000-000000000001',
       (SELECT u.id FROM app_users u
        JOIN app_user_roles r ON r.app_user_id = u.id
        WHERE r.role_key IN ('super_admin','director')
        ORDER BY u.created_at LIMIT 1),
       1,
       '{"owner_legal_name":"In-Progress LLC","owner_email":"pending@example.com"}'::jsonb),
      ('1eda0c03-0000-0000-0000-000000000002',
       (SELECT u.id FROM app_users u
        JOIN app_user_roles r ON r.app_user_id = u.id
        WHERE r.role_key IN ('super_admin','director')
        ORDER BY u.created_at LIMIT 1),
       2,
       '{"owner_legal_name":"Mid-Flow Holdings","owner_email":"midflow@example.com","villas_picked":["1eda0002-0000-0000-0000-000000000013"]}'::jsonb)
    ON CONFLICT (id) DO UPDATE SET
      step = EXCLUDED.step,
      data = EXCLUDED.data,
      updated_at = now();
  ELSE
    RAISE NOTICE 'No super_admin/director app_user found — skipping onboarding_drafts seed.';
  END IF;

  -- ===========================================================================
  -- 4. statement_periods — extend back 2 more months so prior-month
  --                       acknowledged statements have a real period
  -- ===========================================================================
  -- Base seed already has March + April 2026 (1eda0900-...-301/302). Add
  -- January + February 2026, both `closed` so the prior-month statements
  -- map to a closed period (matches the acknowledged owner_state).

  INSERT INTO statement_periods (id, period_start, period_end, label, status) VALUES
    ('1eda0900-0000-0000-0000-000000000201', '2026-01-01', '2026-01-31', 'January 2026',  'closed'),
    ('1eda0900-0000-0000-0000-000000000202', '2026-02-01', '2026-02-28', 'February 2026', 'closed')
  ON CONFLICT (period_start, period_end) DO UPDATE
    SET label = EXCLUDED.label,
        status = EXCLUDED.status;

  -- ===========================================================================
  -- 5. owner_statements — 4 pending (April) + 12 acknowledged
  --                      (4 villas × 3 prior months)
  -- ===========================================================================
  -- Picks 4 villas with existing fixtures and 4 owners with ownership_shares
  -- mapping to them. Statement code: STMT-YYYYMM-VILLA-NN. owner_state +
  -- auto_ack_at exercise the ALTER from migration 0112.
  --
  -- For the demo, choose villas: 1eda0002-...-0001 (Eternal S1),
  -- 1eda0002-...-0013 (Enso V3), 1eda0002-...-0020 (Ahau 01),
  -- 1eda0002-...-0021 (Ahau 02 — Emma's). Map each to one of the base
  -- owners so ownership consistency holds (each statement gets the
  -- existing share's owner).

  -- The 4 pending (April 2026, owner_state = 'pending', auto_ack_at = +14d)
  INSERT INTO owner_statements
    (id, owner_id, villa_id, period_id, statement_code, management_model, currency,
     gross_revenue_minor, total_fees_minor, total_expenses_minor, total_taxes_minor,
     total_reserves_minor, management_fee_minor, net_payout_minor, status,
     issued_at, owner_state, auto_ack_at)
  VALUES
    ('1eda0c04-0000-0000-0000-000000000001',
     '1eda0003-0000-0000-0000-000000000001', '1eda0002-0000-0000-0000-000000000021',
     '1eda0900-0000-0000-0000-000000000302', 'STMT-202604-AHAU02-01', 'managed', 'USD',
     1850000, 92500, 145000, 222000, 92500, 333000, 965000, 'issued',
     now() - interval '2 days', 'pending', now() + interval '14 days'),
    ('1eda0c04-0000-0000-0000-000000000002',
     '1eda0003-0000-0000-0000-000000000002', '1eda0002-0000-0000-0000-000000000020',
     '1eda0900-0000-0000-0000-000000000302', 'STMT-202604-AHAU01-01', 'managed', 'USD',
     2050000, 102500, 158000, 246000, 102500, 369000, 1072000, 'issued',
     now() - interval '2 days', 'pending', now() + interval '14 days'),
    ('1eda0c04-0000-0000-0000-000000000003',
     '1eda0003-0000-0000-0000-000000000003', '1eda0002-0000-0000-0000-000000000001',
     '1eda0900-0000-0000-0000-000000000302', 'STMT-202604-ETER01-01', 'managed', 'USD',
     2480000, 124000, 192000, 297600, 124000, 446400, 1296000, 'issued',
     now() - interval '2 days', 'pending', now() + interval '14 days'),
    ('1eda0c04-0000-0000-0000-000000000004',
     '1eda0003-0000-0000-0000-000000000003', '1eda0002-0000-0000-0000-000000000013',
     '1eda0900-0000-0000-0000-000000000302', 'STMT-202604-ENSO03-01', 'managed', 'USD',
     1620000, 81000, 128000, 194400, 81000, 291600, 844000, 'issued',
     now() - interval '2 days', 'pending', now() + interval '14 days')
  ON CONFLICT (statement_code) DO UPDATE SET
    owner_state = EXCLUDED.owner_state,
    auto_ack_at = EXCLUDED.auto_ack_at,
    status = EXCLUDED.status;

  -- The 12 acknowledged (3 prior months × 4 villas) — owner_state =
  -- 'acknowledged', owner_acked_at populated, no auto_ack.
  INSERT INTO owner_statements
    (id, owner_id, villa_id, period_id, statement_code, management_model, currency,
     gross_revenue_minor, total_fees_minor, total_expenses_minor, total_taxes_minor,
     total_reserves_minor, management_fee_minor, net_payout_minor, status,
     issued_at, approved_at, owner_state, owner_viewed_at, owner_acked_at)
  VALUES
    -- January 2026
    ('1eda0c04-0000-0000-0000-000000000101', '1eda0003-0000-0000-0000-000000000001', '1eda0002-0000-0000-0000-000000000021', '1eda0900-0000-0000-0000-000000000201', 'STMT-202601-AHAU02-01', 'managed', 'USD', 1720000,  86000, 138000, 206400,  86000, 309600,  894000, 'approved', '2026-02-03', '2026-02-05', 'acknowledged', '2026-02-04', '2026-02-09'),
    ('1eda0c04-0000-0000-0000-000000000102', '1eda0003-0000-0000-0000-000000000002', '1eda0002-0000-0000-0000-000000000020', '1eda0900-0000-0000-0000-000000000201', 'STMT-202601-AHAU01-01', 'managed', 'USD', 1900000,  95000, 148000, 228000,  95000, 342000,  992000, 'approved', '2026-02-03', '2026-02-05', 'acknowledged', '2026-02-06', '2026-02-08'),
    ('1eda0c04-0000-0000-0000-000000000103', '1eda0003-0000-0000-0000-000000000003', '1eda0002-0000-0000-0000-000000000001', '1eda0900-0000-0000-0000-000000000201', 'STMT-202601-ETER01-01', 'managed', 'USD', 2260000, 113000, 174000, 271200, 113000, 406800, 1182000, 'approved', '2026-02-03', '2026-02-05', 'acknowledged', '2026-02-04', '2026-02-07'),
    ('1eda0c04-0000-0000-0000-000000000104', '1eda0003-0000-0000-0000-000000000003', '1eda0002-0000-0000-0000-000000000013', '1eda0900-0000-0000-0000-000000000201', 'STMT-202601-ENSO03-01', 'managed', 'USD', 1480000,  74000, 118000, 177600,  74000, 266400,  770000, 'approved', '2026-02-03', '2026-02-05', 'acknowledged', '2026-02-05', '2026-02-08'),
    -- February 2026
    ('1eda0c04-0000-0000-0000-000000000201', '1eda0003-0000-0000-0000-000000000001', '1eda0002-0000-0000-0000-000000000021', '1eda0900-0000-0000-0000-000000000202', 'STMT-202602-AHAU02-01', 'managed', 'USD', 1790000,  89500, 142000, 214800,  89500, 322200,  931000, 'approved', '2026-03-03', '2026-03-05', 'acknowledged', '2026-03-04', '2026-03-08'),
    ('1eda0c04-0000-0000-0000-000000000202', '1eda0003-0000-0000-0000-000000000002', '1eda0002-0000-0000-0000-000000000020', '1eda0900-0000-0000-0000-000000000202', 'STMT-202602-AHAU01-01', 'managed', 'USD', 1980000,  99000, 152000, 237600,  99000, 356400, 1036000, 'approved', '2026-03-03', '2026-03-05', 'acknowledged', '2026-03-05', '2026-03-07'),
    ('1eda0c04-0000-0000-0000-000000000203', '1eda0003-0000-0000-0000-000000000003', '1eda0002-0000-0000-0000-000000000001', '1eda0900-0000-0000-0000-000000000202', 'STMT-202602-ETER01-01', 'managed', 'USD', 2390000, 119500, 184000, 286800, 119500, 430200, 1250000, 'approved', '2026-03-03', '2026-03-05', 'acknowledged', '2026-03-04', '2026-03-06'),
    ('1eda0c04-0000-0000-0000-000000000204', '1eda0003-0000-0000-0000-000000000003', '1eda0002-0000-0000-0000-000000000013', '1eda0900-0000-0000-0000-000000000202', 'STMT-202602-ENSO03-01', 'managed', 'USD', 1560000,  78000, 124000, 187200,  78000, 280800,  812000, 'approved', '2026-03-03', '2026-03-05', 'acknowledged', '2026-03-06', '2026-03-09'),
    -- March 2026
    ('1eda0c04-0000-0000-0000-000000000301', '1eda0003-0000-0000-0000-000000000001', '1eda0002-0000-0000-0000-000000000021', '1eda0900-0000-0000-0000-000000000301', 'STMT-202603-AHAU02-01', 'managed', 'USD', 1820000,  91000, 144000, 218400,  91000, 327600,  948000, 'approved', '2026-04-03', '2026-04-05', 'acknowledged', '2026-04-04', '2026-04-07'),
    ('1eda0c04-0000-0000-0000-000000000302', '1eda0003-0000-0000-0000-000000000002', '1eda0002-0000-0000-0000-000000000020', '1eda0900-0000-0000-0000-000000000301', 'STMT-202603-AHAU01-01', 'managed', 'USD', 2010000, 100500, 156000, 241200, 100500, 361800, 1050000, 'approved', '2026-04-03', '2026-04-05', 'acknowledged', '2026-04-04', '2026-04-08'),
    ('1eda0c04-0000-0000-0000-000000000303', '1eda0003-0000-0000-0000-000000000003', '1eda0002-0000-0000-0000-000000000001', '1eda0900-0000-0000-0000-000000000301', 'STMT-202603-ETER01-01', 'managed', 'USD', 2430000, 121500, 188000, 291600, 121500, 437400, 1270000, 'approved', '2026-04-03', '2026-04-05', 'acknowledged', '2026-04-05', '2026-04-07'),
    ('1eda0c04-0000-0000-0000-000000000304', '1eda0003-0000-0000-0000-000000000003', '1eda0002-0000-0000-0000-000000000013', '1eda0900-0000-0000-0000-000000000301', 'STMT-202603-ENSO03-01', 'managed', 'USD', 1590000,  79500, 126000, 190800,  79500, 286200,  828000, 'approved', '2026-04-03', '2026-04-05', 'acknowledged', '2026-04-06', '2026-04-09')
  ON CONFLICT (statement_code) DO UPDATE SET
    owner_state = EXCLUDED.owner_state,
    owner_acked_at = EXCLUDED.owner_acked_at,
    owner_viewed_at = EXCLUDED.owner_viewed_at,
    status = EXCLUDED.status;

  -- ===========================================================================
  -- 6. statement_anomalies — 5 rows across 3 of the 4 pending statements
  -- ===========================================================================
  -- All on pending statements so the Director's "needs review" surface has
  -- something to render. Mix of warn (2) + info (3), no critical.

  INSERT INTO statement_anomalies (id, statement_id, kind, severity, payload, fired_at) VALUES
    ('1eda0c05-0000-0000-0000-000000000001', '1eda0c04-0000-0000-0000-000000000001', 'supplier_cost_spike', 'warn', '{"line_category":"utilities","amount_minor":18500,"baseline_minor":9200,"window":"trailing_60d_avg"}'::jsonb, now() - interval '2 days'),
    ('1eda0c05-0000-0000-0000-000000000002', '1eda0c04-0000-0000-0000-000000000001', 'occupancy_drop',      'info', '{"metric":"occupancy_pct","value":62.1,"baseline":74.3,"window":"current_period"}'::jsonb,                          now() - interval '2 days'),
    ('1eda0c05-0000-0000-0000-000000000003', '1eda0c04-0000-0000-0000-000000000003', 'channel_mix_shift',   'warn', '{"channel_from":"direct","channel_to":"airbnb","pct_shift":18.4,"window":"current_period"}'::jsonb,                now() - interval '2 days'),
    ('1eda0c05-0000-0000-0000-000000000004', '1eda0c04-0000-0000-0000-000000000003', 'one_off_charge',      'info', '{"line_description":"Pool resurfacing","amount_minor":42000,"category":"maintenance"}'::jsonb,                     now() - interval '2 days'),
    ('1eda0c05-0000-0000-0000-000000000005', '1eda0c04-0000-0000-0000-000000000004', 'tax_anomaly',         'info', '{"tax_kind":"VAT","amount_minor":24500,"expected_minor":21800,"delta_pct":12.4}'::jsonb,                            now() - interval '2 days')
  ON CONFLICT (id) DO UPDATE SET
    severity = EXCLUDED.severity,
    payload = EXCLUDED.payload;

  -- ===========================================================================
  -- 7. sla_breaches — 6 rows across the 3 existing maintenance_tickets:
  --                  3 active (resolved_at null), 3 resolved
  -- ===========================================================================
  -- One active + one resolved per ticket. Active breaches have null
  -- resolved_at but still record breach_minutes (computed at SLA-breach
  -- detection time, not at resolution).

  INSERT INTO sla_breaches (id, ticket_id, breached_at, resolved_at, breach_minutes) VALUES
    -- Bedroom 2 AC not cooling — 1 active + 1 resolved
    ('1eda0c06-0000-0000-0000-000000000001', '1eda0b02-0000-0000-0000-000000000001', now() - interval '8 hours',  NULL,                          60),
    ('1eda0c06-0000-0000-0000-000000000002', '1eda0b02-0000-0000-0000-000000000001', now() - interval '3 days',   now() - interval '2 days',    240),
    -- Pool pump intermittent — 1 active + 1 resolved
    ('1eda0c06-0000-0000-0000-000000000003', '1eda0b02-0000-0000-0000-000000000002', now() - interval '12 hours', NULL,                         180),
    ('1eda0c06-0000-0000-0000-000000000004', '1eda0b02-0000-0000-0000-000000000002', now() - interval '7 days',   now() - interval '5 days',    360),
    -- Wi-Fi AP offline — 1 active + 1 resolved
    ('1eda0c06-0000-0000-0000-000000000005', '1eda0b02-0000-0000-0000-000000000003', now() - interval '2 hours',  NULL,                          30),
    ('1eda0c06-0000-0000-0000-000000000006', '1eda0b02-0000-0000-0000-000000000003', now() - interval '5 days',   now() - interval '4 days',    120)
  ON CONFLICT (id) DO UPDATE SET
    breached_at = EXCLUDED.breached_at,
    resolved_at = EXCLUDED.resolved_at,
    breach_minutes = EXCLUDED.breach_minutes;

  RAISE NOTICE 'Phase 2 mgmt seed applied: 11 owners, 8 insights, 2 drafts, 16 statements, 5 anomalies, 6 breaches.';
END $$;
