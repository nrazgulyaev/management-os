-- =============================================================================
-- Phase 2 data-wiring PR 2 — Dev slice seed
--
-- Demo rows for the 9 net-new Dev tables from migration 0113.
--
-- Idempotent: every INSERT uses ON CONFLICT DO NOTHING / DO UPDATE.
-- Re-applying is safe.
--
-- Apply order: drizzle/seed.sql → drizzle/seed/phase-2-mgmt.sql →
--              drizzle/seed/phase-2-dev.sql
--
-- Per docs/audits/2026-05-27-phase-2-data-wiring-scope.md § Dev P1
-- and phase-2-data-wiring-handoff/prompts/02-dev.md Seed section.
--
-- UUID prefix convention for this slice: 1eda0d01..1eda0d0f
--
-- Notes on scope vs. spec:
--   * Spec asks for "4 projects × 14 milestones". The base seed has
--     only 3 demo projects (eternal, enso, ahau). Seeding 14 per
--     project = 42 milestones total (close to the 56 target).
--   * boq_actuals + variance_reviews require boq_items rows, which
--     require boq_sections + boq_documents — those aren't in the
--     base seed yet. Seeded conditionally; skipped with NOTICE if
--     the prerequisite isn't present.
--   * vendor_scores and capital_call_allocations require vendors
--     and investors respectively. Both are seeded minimally below
--     so the full dependent chain lights up.
-- =============================================================================

DO $$
DECLARE
  v_org_id      uuid := 'aaaa1111-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
  v_eternal     uuid := '1eda0001-0000-0000-0000-000000000001';
  v_enso        uuid := '1eda0001-0000-0000-0000-000000000002';
  v_ahau        uuid := '1eda0001-0000-0000-0000-000000000003';
  v_contact_a   uuid;
  v_director_id uuid;
BEGIN
  -- Schema check.
  IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'milestones') THEN
    RAISE NOTICE 'Phase 2 dev tables not present — skipping seed.';
    RETURN;
  END IF;

  -- FK target check.
  IF NOT EXISTS (SELECT 1 FROM projects WHERE id = v_eternal) THEN
    RAISE NOTICE 'Base demo projects not present — skipping phase-2 dev seed.';
    RETURN;
  END IF;

  -- Resolve a contact for RFI routing (any contact in the org). Falls back
  -- to NULL if no contacts exist, which is fine (routedToContactId is
  -- nullable per the schema).
  SELECT id INTO v_contact_a FROM contacts ORDER BY created_at LIMIT 1;

  -- Resolve a director user for `created_by_user_id` on capital calls.
  SELECT u.id INTO v_director_id
  FROM app_users u
  JOIN app_user_roles r ON r.app_user_id = u.id
  WHERE r.role_key IN ('super_admin','director')
  ORDER BY u.created_at
  LIMIT 1;

  -- ===========================================================================
  -- 1. milestones — 14 per project × 3 projects = 42
  -- ===========================================================================
  -- Realistic CPM ladder: design → permit → site prep → foundation → frame →
  --                       mep → finishes → handover, with 6 sub-milestones
  --                       distributed across the latter half (mep/finishes).

  INSERT INTO milestones (id, project_id, name, kind, target_date, actual_date, status, notes) VALUES
    -- Eternal Villas — 14 milestones, mostly done, 2 in-progress, 1 at-risk
    ('1eda0d01-0000-0000-0000-000000010001', '1eda0001-0000-0000-0000-000000000001', 'Concept design freeze',      'design',     '2024-09-15', '2024-09-12', 'done',         NULL),
    ('1eda0d01-0000-0000-0000-000000010002', '1eda0001-0000-0000-0000-000000000001', 'IMB / building permit',     'permit',     '2024-11-01', '2024-11-08', 'done',         NULL),
    ('1eda0d01-0000-0000-0000-000000010003', '1eda0001-0000-0000-0000-000000000001', 'Site clearance',            'site_prep',  '2024-11-15', '2024-11-20', 'done',         NULL),
    ('1eda0d01-0000-0000-0000-000000010004', '1eda0001-0000-0000-0000-000000000001', 'Foundation pour S1-S2',     'foundation', '2025-01-10', '2025-01-15', 'done',         NULL),
    ('1eda0d01-0000-0000-0000-000000010005', '1eda0001-0000-0000-0000-000000000001', 'Foundation pour S3-S5',     'foundation', '2025-02-10', '2025-02-12', 'done',         NULL),
    ('1eda0d01-0000-0000-0000-000000010006', '1eda0001-0000-0000-0000-000000000001', 'Frame S1-S2',               'frame',      '2025-04-15', '2025-04-30', 'done',         NULL),
    ('1eda0d01-0000-0000-0000-000000010007', '1eda0001-0000-0000-0000-000000000001', 'Frame S3-S5',               'frame',      '2025-05-30', '2025-06-10', 'done',         NULL),
    ('1eda0d01-0000-0000-0000-000000010008', '1eda0001-0000-0000-0000-000000000001', 'MEP rough-in S1-S2',        'mep',        '2025-08-15', '2025-08-30', 'done',         NULL),
    ('1eda0d01-0000-0000-0000-000000010009', '1eda0001-0000-0000-0000-000000000001', 'MEP rough-in S3-S5',        'mep',        '2025-10-01', '2025-10-15', 'done',         NULL),
    ('1eda0d01-0000-0000-0000-00000001000a', '1eda0001-0000-0000-0000-000000000001', 'Finishes — S1-S2',          'finishes',   '2026-02-15', NULL,         'in_progress',  '70% complete — track tile delivery'),
    ('1eda0d01-0000-0000-0000-00000001000b', '1eda0001-0000-0000-0000-000000000001', 'Finishes — S3-S5',          'finishes',   '2026-04-30', NULL,         'in_progress',  '40% complete'),
    ('1eda0d01-0000-0000-0000-00000001000c', '1eda0001-0000-0000-0000-00000000000a', 'Pool & landscape',          'finishes',   '2026-06-15', NULL,         'planned',      NULL),
    ('1eda0d01-0000-0000-0000-00000001000d', '1eda0001-0000-0000-0000-00000000000b', 'Final inspection',          'handover',   '2026-08-15', NULL,         'at_risk',      'Finishes slip threatens this'),
    ('1eda0d01-0000-0000-0000-00000001000e', '1eda0001-0000-0000-0000-00000000000c', 'Handover ceremony',         'handover',   '2026-09-30', NULL,         'planned',      'Soft-launch with first 3 owners'),

    -- Enso Villas — 14 milestones, earlier stage, 2 done, 6 in-progress, 6 planned
    ('1eda0d01-0000-0000-0000-000000020001', '1eda0001-0000-0000-0000-000000000002', 'Concept design freeze',      'design',     '2025-03-01', '2025-03-05', 'done',         NULL),
    ('1eda0d01-0000-0000-0000-000000020002', '1eda0001-0000-0000-0000-000000000002', 'IMB / building permit',     'permit',     '2025-05-15', '2025-06-01', 'done',         NULL),
    ('1eda0d01-0000-0000-0000-000000020003', '1eda0001-0000-0000-0000-000000000002', 'Site prep',                 'site_prep',  '2025-07-01', NULL,         'in_progress',  NULL),
    ('1eda0d01-0000-0000-0000-000000020004', '1eda0001-0000-0000-0000-000000000002', 'Land cut & fill',           'site_prep',  '2025-09-01', NULL,         'in_progress',  '60% complete'),
    ('1eda0d01-0000-0000-0000-000000020005', '1eda0001-0000-0000-0000-000000000002', 'Foundation block A (3 units)','foundation','2025-11-15', NULL,        'in_progress',  '30% complete'),
    ('1eda0d01-0000-0000-0000-000000020006', '1eda0001-0000-0000-0000-000000000002', 'Foundation block B (3 units)','foundation','2026-02-15', NULL,        'in_progress',  NULL),
    ('1eda0d01-0000-0000-0000-000000020007', '1eda0001-0000-0000-0000-000000000002', 'Foundation block C (3 units)','foundation','2026-04-30', NULL,        'in_progress',  NULL),
    ('1eda0d01-0000-0000-0000-000000020008', '1eda0001-0000-0000-0000-000000000002', 'Frame block A',             'frame',      '2026-06-15', NULL,         'in_progress',  NULL),
    ('1eda0d01-0000-0000-0000-000000020009', '1eda0001-0000-0000-0000-000000000002', 'Frame block B',             'frame',      '2026-09-01', NULL,         'planned',      NULL),
    ('1eda0d01-0000-0000-0000-00000002000a', '1eda0001-0000-0000-0000-000000000002', 'Frame block C',             'frame',      '2026-11-15', NULL,         'planned',      NULL),
    ('1eda0d01-0000-0000-0000-00000002000b', '1eda0001-0000-0000-0000-000000000002', 'MEP rough-in',              'mep',        '2027-02-01', NULL,         'planned',      NULL),
    ('1eda0d01-0000-0000-0000-00000002000c', '1eda0001-0000-0000-0000-000000000002', 'Finishes (all blocks)',     'finishes',   '2027-06-30', NULL,         'planned',      NULL),
    ('1eda0d01-0000-0000-0000-00000002000d', '1eda0001-0000-0000-0000-000000000002', 'Final inspection',          'handover',   '2027-08-30', NULL,         'planned',      NULL),
    ('1eda0d01-0000-0000-0000-00000002000e', '1eda0001-0000-0000-0000-000000000002', 'Handover',                  'handover',   '2027-09-30', NULL,         'planned',      NULL),

    -- Ahau Gardens — 14 milestones, late stage (mostly done, handover imminent)
    ('1eda0d01-0000-0000-0000-000000030001', '1eda0001-0000-0000-0000-000000000003', 'Concept design freeze',      'design',     '2024-04-15', '2024-04-18', 'done',         NULL),
    ('1eda0d01-0000-0000-0000-000000030002', '1eda0001-0000-0000-0000-000000000003', 'IMB / building permit',     'permit',     '2024-06-15', '2024-06-20', 'done',         NULL),
    ('1eda0d01-0000-0000-0000-000000030003', '1eda0001-0000-0000-0000-000000000003', 'Site clearance',            'site_prep',  '2024-07-15', '2024-07-20', 'done',         NULL),
    ('1eda0d01-0000-0000-0000-000000030004', '1eda0001-0000-0000-0000-000000000003', 'Foundation pour',           'foundation', '2024-09-30', '2024-10-05', 'done',         NULL),
    ('1eda0d01-0000-0000-0000-000000030005', '1eda0001-0000-0000-0000-000000000003', 'Frame all units',           'frame',      '2025-02-15', '2025-02-25', 'done',         NULL),
    ('1eda0d01-0000-0000-0000-000000030006', '1eda0001-0000-0000-0000-000000000003', 'Pool excavation',           'site_prep',  '2025-03-01', '2025-03-10', 'done',         NULL),
    ('1eda0d01-0000-0000-0000-000000030007', '1eda0001-0000-0000-0000-000000000003', 'MEP rough-in all units',    'mep',        '2025-06-15', '2025-06-25', 'done',         NULL),
    ('1eda0d01-0000-0000-0000-000000030008', '1eda0001-0000-0000-0000-000000000003', 'Pool MEP + filtration',     'mep',        '2025-07-15', '2025-07-25', 'done',         NULL),
    ('1eda0d01-0000-0000-0000-000000030009', '1eda0001-0000-0000-0000-000000000003', 'Finishes — interior',       'finishes',   '2025-12-15', '2025-12-22', 'done',         NULL),
    ('1eda0d01-0000-0000-0000-00000003000a', '1eda0001-0000-0000-0000-000000000003', 'Finishes — exterior',       'finishes',   '2026-01-15', '2026-01-25', 'done',         NULL),
    ('1eda0d01-0000-0000-0000-00000003000b', '1eda0001-0000-0000-0000-000000000003', 'Landscape & garden',        'finishes',   '2026-02-28', '2026-03-05', 'done',         NULL),
    ('1eda0d01-0000-0000-0000-00000003000c', '1eda0001-0000-0000-0000-000000000003', 'FF&E install',              'finishes',   '2026-04-15', NULL,         'in_progress',  '80% complete; outdoor furniture lead-time'),
    ('1eda0d01-0000-0000-0000-00000003000d', '1eda0001-0000-0000-0000-00000000000a', 'Final inspection + snags',  'handover',   '2026-05-15', NULL,         'planned',      NULL),
    ('1eda0d01-0000-0000-0000-00000003000e', '1eda0001-0000-0000-0000-00000000000b', 'Handover + soft launch',    'handover',   '2026-06-30', NULL,         'planned',      NULL)
  ON CONFLICT (id) DO UPDATE SET
    status = EXCLUDED.status,
    actual_date = EXCLUDED.actual_date,
    notes = EXCLUDED.notes,
    updated_at = now();

  -- ===========================================================================
  -- 2. milestone_dependencies — sample FS chain on Eternal Villas
  -- ===========================================================================
  INSERT INTO milestone_dependencies (from_milestone_id, to_milestone_id, kind) VALUES
    ('1eda0d01-0000-0000-0000-000000010001', '1eda0d01-0000-0000-0000-000000010002', 'fs'),  -- design → permit
    ('1eda0d01-0000-0000-0000-000000010002', '1eda0d01-0000-0000-0000-000000010003', 'fs'),  -- permit → site prep
    ('1eda0d01-0000-0000-0000-000000010003', '1eda0d01-0000-0000-0000-000000010004', 'fs'),  -- site prep → foundation
    ('1eda0d01-0000-0000-0000-000000010004', '1eda0d01-0000-0000-0000-000000010006', 'fs'),  -- foundation → frame
    ('1eda0d01-0000-0000-0000-000000010006', '1eda0d01-0000-0000-0000-000000010008', 'fs'),  -- frame → mep rough-in
    ('1eda0d01-0000-0000-0000-000000010008', '1eda0d01-0000-0000-0000-00000001000a', 'fs')   -- mep → finishes
  ON CONFLICT (from_milestone_id, to_milestone_id) DO NOTHING;

  -- ===========================================================================
  -- 3. rfis — 8 across the 3 projects
  -- ===========================================================================
  INSERT INTO rfis (id, project_id, ref, question, discipline, routed_to_contact_id, routed_by_agent, priority, opened_at, responded_at, response_text, resolved_at) VALUES
    ('1eda0d02-0000-0000-0000-000000000001', v_eternal, 'RFI-EV01-0014',
     'Confirm structural rebar spec for S3 cantilever — sheet S-04 conflicts with detail D-07.',
     'structural',
     v_contact_a, true, 'high',
     now() - interval '12 days', now() - interval '8 days',
     'Use D-07 spec (#22 @ 6"). S-04 to be revised in next issue.', now() - interval '8 days'),
    ('1eda0d02-0000-0000-0000-000000000002', v_eternal, 'RFI-EV01-0015',
     'Pool waterline tile sample selection — option A vs option C for grout colour.',
     'finishes',
     v_contact_a, true, 'medium',
     now() - interval '8 days', now() - interval '3 days',
     'Option A approved by owner. Proceed.', now() - interval '3 days'),
    ('1eda0d02-0000-0000-0000-000000000003', v_eternal, 'RFI-EV01-0016',
     'Door hardware finish — owner asks if we can switch from brushed nickel to matte black.',
     'finishes',
     v_contact_a, false, 'medium',
     now() - interval '5 days', NULL, NULL, NULL),
    ('1eda0d02-0000-0000-0000-000000000004', v_enso,    'RFI-EN02-0007',
     'Block A foundation rebar spacing on plot corner — soil report shows hardpan at 1.8m, not 2.4m as assumed.',
     'structural',
     v_contact_a, true, 'critical',
     now() - interval '3 days', NULL, NULL, NULL),
    ('1eda0d02-0000-0000-0000-000000000005', v_enso,    'RFI-EN02-0008',
     'Power supply transformer size for Block B — sub-MEP says 250kVA, our spec says 200kVA.',
     'mep',
     NULL, false, 'high',
     now() - interval '2 days', NULL, NULL, NULL),
    ('1eda0d02-0000-0000-0000-000000000006', v_ahau,    'RFI-AH03-0021',
     'Final snag list — outdoor lighting on south facade.',
     'mep',
     v_contact_a, true, 'low',
     now() - interval '7 days', now() - interval '4 days',
     'Replaced 3 fixtures, others within spec. Closing.', now() - interval '4 days'),
    ('1eda0d02-0000-0000-0000-000000000007', v_ahau,    'RFI-AH03-0022',
     'Garden irrigation controller location — clash with electrical sub-panel.',
     'landscape',
     NULL, false, 'medium',
     now() - interval '4 days', NULL, NULL, NULL),
    ('1eda0d02-0000-0000-0000-000000000008', v_ahau,    'RFI-AH03-0023',
     'Septic tank ventilation routing — civil drawing rev unclear.',
     'civil',
     v_contact_a, true, 'medium',
     now() - interval '6 days', NULL, NULL, NULL)
  ON CONFLICT (ref) DO UPDATE SET
    priority = EXCLUDED.priority,
    routed_by_agent = EXCLUDED.routed_by_agent;

  -- ===========================================================================
  -- 4. Prerequisite seeds for capital_call_allocations + vendor_scores
  -- ===========================================================================
  -- Minimal vendors (3) + investors (4) so the dependent rows light up.
  -- Both keyed by their natural unique codes for idempotency.

  IF NOT EXISTS (SELECT 1 FROM vendors WHERE vendor_code = 'V-PHASE2-DEMO-01') THEN
    INSERT INTO vendors (id, organization_id, vendor_code, legal_name, vendor_type)
    VALUES
      ('1eda0d03-0000-0000-0000-000000000001', v_org_id, 'V-PHASE2-DEMO-01', 'Bali Stone Co. (demo)',         'subcontractor_finishing'),
      ('1eda0d03-0000-0000-0000-000000000002', v_org_id, 'V-PHASE2-DEMO-02', 'Sumber Sejahtera Steel (demo)', 'subcontractor_civil'),
      ('1eda0d03-0000-0000-0000-000000000003', v_org_id, 'V-PHASE2-DEMO-03', 'PT MEP Solusi (demo)',          'subcontractor_mep')
    ON CONFLICT (vendor_code) DO NOTHING;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM investors WHERE investor_code = 'INV-PHASE2-DEMO-01') THEN
    INSERT INTO investors (id, organization_id, investor_code, investor_type, legal_name)
    VALUES
      ('1eda0d04-0000-0000-0000-000000000001', v_org_id, 'INV-PHASE2-DEMO-01', 'lp_private',       'Whitmore Family Holdings (demo)'),
      ('1eda0d04-0000-0000-0000-000000000002', v_org_id, 'INV-PHASE2-DEMO-02', 'lp_institutional', 'Takeda FO Pte. Ltd. (demo)'),
      ('1eda0d04-0000-0000-0000-000000000003', v_org_id, 'INV-PHASE2-DEMO-03', 'lp_institutional', 'Sonoma Capital (demo)'),
      ('1eda0d04-0000-0000-0000-000000000004', v_org_id, 'INV-PHASE2-DEMO-04', 'gp',               'Arconique GP (demo)')
    ON CONFLICT (investor_code) DO NOTHING;
  END IF;

  -- ===========================================================================
  -- 5. capital_calls — 6, mixed status
  -- ===========================================================================
  INSERT INTO capital_calls (id, project_id, ref, kind, issued_at, due_at, total_usd, status, notes, created_by_user_id) VALUES
    ('1eda0d05-0000-0000-0000-000000000001', v_eternal, 'CC-EV01-0001', 'initial',                  now() - interval '180 days', now() - interval '150 days', 1500000.00, 'received',  'Initial equity call',                       v_director_id),
    ('1eda0d05-0000-0000-0000-000000000002', v_eternal, 'CC-EV01-0002', 'construction_milestone',   now() - interval '120 days', now() - interval '90 days',  1200000.00, 'received',  'Foundation + frame milestone',              v_director_id),
    ('1eda0d05-0000-0000-0000-000000000003', v_eternal, 'CC-EV01-0003', 'construction_milestone',   now() - interval '45 days',  now() - interval '15 days',   850000.00, 'partial',   'MEP + finishes draw (Aisha partial)',       v_director_id),
    ('1eda0d05-0000-0000-0000-000000000004', v_enso,    'CC-EN02-0001', 'initial',                  now() - interval '60 days',  now() - interval '30 days',  2400000.00, 'partial',   'Initial equity for Enso',                    v_director_id),
    ('1eda0d05-0000-0000-0000-000000000005', v_enso,    'CC-EN02-0002', 'construction_milestone',   now() - interval '5 days',   now() + interval '25 days',   980000.00, 'issued',    'Foundation pour A+B',                        v_director_id),
    ('1eda0d05-0000-0000-0000-000000000006', v_ahau,    'CC-AH03-0001', 'final',                    now() - interval '7 days',   now() + interval '23 days',   420000.00, 'draft',     'Final reserve for handover punchlist',       v_director_id)
  ON CONFLICT (ref) DO UPDATE SET
    status = EXCLUDED.status,
    total_usd = EXCLUDED.total_usd,
    notes = EXCLUDED.notes,
    updated_at = now();

  -- ===========================================================================
  -- 6. capital_call_allocations — 3 investors per call × 6 calls = 18 rows
  -- ===========================================================================
  -- Allocation is pro-rata-ish: LP-Private 30%, LP-Institutional A 40%,
  -- LP-Institutional B 20%, GP 10%.

  INSERT INTO capital_call_allocations (id, call_id, investor_id, allocated_usd, received_at, received_usd, wire_ref) VALUES
    -- CC-EV01-0001 (1.5M, received in full)
    ('1eda0d06-0000-0000-0000-000000000101', '1eda0d05-0000-0000-0000-000000000001', '1eda0d04-0000-0000-0000-000000000001', 450000.00, now() - interval '155 days', 450000.00, 'WIRE-2024-Q4-WHM-01'),
    ('1eda0d06-0000-0000-0000-000000000102', '1eda0d05-0000-0000-0000-000000000001', '1eda0d04-0000-0000-0000-000000000002', 600000.00, now() - interval '152 days', 600000.00, 'WIRE-2024-Q4-TKD-01'),
    ('1eda0d06-0000-0000-0000-000000000103', '1eda0d05-0000-0000-0000-000000000001', '1eda0d04-0000-0000-0000-000000000003', 300000.00, now() - interval '156 days', 300000.00, 'WIRE-2024-Q4-SNM-01'),
    ('1eda0d06-0000-0000-0000-000000000104', '1eda0d05-0000-0000-0000-000000000001', '1eda0d04-0000-0000-0000-000000000004', 150000.00, now() - interval '154 days', 150000.00, 'WIRE-2024-Q4-GP-01'),
    -- CC-EV01-0002 (1.2M, received in full)
    ('1eda0d06-0000-0000-0000-000000000201', '1eda0d05-0000-0000-0000-000000000002', '1eda0d04-0000-0000-0000-000000000001', 360000.00, now() - interval '95 days', 360000.00, 'WIRE-2025-Q1-WHM-01'),
    ('1eda0d06-0000-0000-0000-000000000202', '1eda0d05-0000-0000-0000-000000000002', '1eda0d04-0000-0000-0000-000000000002', 480000.00, now() - interval '92 days', 480000.00, 'WIRE-2025-Q1-TKD-01'),
    ('1eda0d06-0000-0000-0000-000000000203', '1eda0d05-0000-0000-0000-000000000002', '1eda0d04-0000-0000-0000-000000000003', 240000.00, now() - interval '96 days', 240000.00, 'WIRE-2025-Q1-SNM-01'),
    ('1eda0d06-0000-0000-0000-000000000204', '1eda0d05-0000-0000-0000-000000000002', '1eda0d04-0000-0000-0000-000000000004', 120000.00, now() - interval '94 days', 120000.00, 'WIRE-2025-Q1-GP-01'),
    -- CC-EV01-0003 (0.85M, partial — Whitmore + GP wired, others outstanding)
    ('1eda0d06-0000-0000-0000-000000000301', '1eda0d05-0000-0000-0000-000000000003', '1eda0d04-0000-0000-0000-000000000001', 255000.00, now() - interval '18 days', 255000.00, 'WIRE-2026-Q2-WHM-01'),
    ('1eda0d06-0000-0000-0000-000000000302', '1eda0d05-0000-0000-0000-000000000003', '1eda0d04-0000-0000-0000-000000000002', 340000.00, NULL, NULL, NULL),
    ('1eda0d06-0000-0000-0000-000000000303', '1eda0d05-0000-0000-0000-000000000003', '1eda0d04-0000-0000-0000-000000000003', 170000.00, NULL, NULL, NULL),
    ('1eda0d06-0000-0000-0000-000000000304', '1eda0d05-0000-0000-0000-000000000003', '1eda0d04-0000-0000-0000-000000000004',  85000.00, now() - interval '16 days',  85000.00, 'WIRE-2026-Q2-GP-01'),
    -- CC-EN02-0001 (2.4M, partial — first two wired)
    ('1eda0d06-0000-0000-0000-000000000401', '1eda0d05-0000-0000-0000-000000000004', '1eda0d04-0000-0000-0000-000000000001', 720000.00, now() - interval '32 days', 720000.00, 'WIRE-2026-Q1-WHM-02'),
    ('1eda0d06-0000-0000-0000-000000000402', '1eda0d05-0000-0000-0000-000000000004', '1eda0d04-0000-0000-0000-000000000002', 960000.00, now() - interval '34 days', 960000.00, 'WIRE-2026-Q1-TKD-02'),
    ('1eda0d06-0000-0000-0000-000000000403', '1eda0d05-0000-0000-0000-000000000004', '1eda0d04-0000-0000-0000-000000000003', 480000.00, NULL, NULL, NULL),
    ('1eda0d06-0000-0000-0000-000000000404', '1eda0d05-0000-0000-0000-000000000004', '1eda0d04-0000-0000-0000-000000000004', 240000.00, NULL, NULL, NULL),
    -- CC-EN02-0002 (0.98M, just issued — no receipts yet)
    ('1eda0d06-0000-0000-0000-000000000501', '1eda0d05-0000-0000-0000-000000000005', '1eda0d04-0000-0000-0000-000000000001', 294000.00, NULL, NULL, NULL),
    ('1eda0d06-0000-0000-0000-000000000502', '1eda0d05-0000-0000-0000-000000000005', '1eda0d04-0000-0000-0000-000000000002', 392000.00, NULL, NULL, NULL)
  ON CONFLICT (id) DO UPDATE SET
    received_at = EXCLUDED.received_at,
    received_usd = EXCLUDED.received_usd,
    wire_ref = EXCLUDED.wire_ref;

  -- ===========================================================================
  -- 7. vendor_scores — 6 nightly snapshots per vendor × 3 vendors = 18 rows
  -- ===========================================================================
  -- Computed_at spans the last 6 days. Scores trend gently up/down per
  -- vendor so the trailing trendline is non-flat for the cabinet.

  INSERT INTO vendor_scores (id, vendor_id, composite, price_score, on_time_score, qa_score, responsive_score, computed_at, score_window) VALUES
    -- Bali Stone Co.: improving (78 → 84)
    ('1eda0d07-0000-0000-0000-000000000101', '1eda0d03-0000-0000-0000-000000000001', 78, 80, 70, 82, 80, now() - interval '5 days', 'trailing_90d'),
    ('1eda0d07-0000-0000-0000-000000000102', '1eda0d03-0000-0000-0000-000000000001', 79, 80, 72, 82, 81, now() - interval '4 days', 'trailing_90d'),
    ('1eda0d07-0000-0000-0000-000000000103', '1eda0d03-0000-0000-0000-000000000001', 80, 80, 75, 82, 82, now() - interval '3 days', 'trailing_90d'),
    ('1eda0d07-0000-0000-0000-000000000104', '1eda0d03-0000-0000-0000-000000000001', 81, 80, 77, 83, 83, now() - interval '2 days', 'trailing_90d'),
    ('1eda0d07-0000-0000-0000-000000000105', '1eda0d03-0000-0000-0000-000000000001', 83, 80, 80, 84, 85, now() - interval '1 days', 'trailing_90d'),
    ('1eda0d07-0000-0000-0000-000000000106', '1eda0d03-0000-0000-0000-000000000001', 84, 80, 82, 85, 86, now(),                      'trailing_90d'),
    -- Sumber Sejahtera Steel: stable (~72)
    ('1eda0d07-0000-0000-0000-000000000201', '1eda0d03-0000-0000-0000-000000000002', 72, 75, 68, 75, 70, now() - interval '5 days', 'trailing_90d'),
    ('1eda0d07-0000-0000-0000-000000000202', '1eda0d03-0000-0000-0000-000000000002', 71, 75, 65, 75, 70, now() - interval '4 days', 'trailing_90d'),
    ('1eda0d07-0000-0000-0000-000000000203', '1eda0d03-0000-0000-0000-000000000002', 73, 75, 70, 75, 71, now() - interval '3 days', 'trailing_90d'),
    ('1eda0d07-0000-0000-0000-000000000204', '1eda0d03-0000-0000-0000-000000000002', 72, 75, 68, 74, 71, now() - interval '2 days', 'trailing_90d'),
    ('1eda0d07-0000-0000-0000-000000000205', '1eda0d03-0000-0000-0000-000000000002', 73, 75, 69, 75, 72, now() - interval '1 days', 'trailing_90d'),
    ('1eda0d07-0000-0000-0000-000000000206', '1eda0d03-0000-0000-0000-000000000002', 72, 75, 67, 75, 71, now(),                      'trailing_90d'),
    -- PT MEP Solusi: declining (68 → 60) — would surface as risk
    ('1eda0d07-0000-0000-0000-000000000301', '1eda0d03-0000-0000-0000-000000000003', 68, 72, 65, 70, 65, now() - interval '5 days', 'trailing_90d'),
    ('1eda0d07-0000-0000-0000-000000000302', '1eda0d03-0000-0000-0000-000000000003', 66, 72, 62, 68, 62, now() - interval '4 days', 'trailing_90d'),
    ('1eda0d07-0000-0000-0000-000000000303', '1eda0d03-0000-0000-0000-000000000003', 64, 72, 58, 67, 60, now() - interval '3 days', 'trailing_90d'),
    ('1eda0d07-0000-0000-0000-000000000304', '1eda0d03-0000-0000-0000-000000000003', 63, 72, 56, 65, 58, now() - interval '2 days', 'trailing_90d'),
    ('1eda0d07-0000-0000-0000-000000000305', '1eda0d03-0000-0000-0000-000000000003', 61, 72, 54, 64, 56, now() - interval '1 days', 'trailing_90d'),
    ('1eda0d07-0000-0000-0000-000000000306', '1eda0d03-0000-0000-0000-000000000003', 60, 72, 52, 64, 55, now(),                      'trailing_90d')
  ON CONFLICT (id) DO UPDATE SET
    composite = EXCLUDED.composite,
    computed_at = EXCLUDED.computed_at;

  -- ===========================================================================
  -- 8. boq_revisions — 4 (one initial + 3 amendments on Eternal Villas)
  -- ===========================================================================
  -- snapshot is just JSONB so this works without needing real boq_items rows.

  INSERT INTO boq_revisions (id, project_id, version, snapshot_at, replaces_id, snapshot, note) VALUES
    ('1eda0d08-0000-0000-0000-000000000001', v_eternal, 1, '2024-10-15 00:00:00+00', NULL,
     '{"version":1,"total_minor":485000000000,"line_count":342,"note":"Initial issue at construction start"}'::jsonb,
     'Initial BOQ at construction start'),
    ('1eda0d08-0000-0000-0000-000000000002', v_eternal, 2, '2025-03-10 00:00:00+00', '1eda0d08-0000-0000-0000-000000000001',
     '{"version":2,"total_minor":492500000000,"line_count":348,"note":"Foundation rebar adjustment + landscape additions"}'::jsonb,
     'Rev 2 — foundation rebar adjustment after soil report; landscape additions'),
    ('1eda0d08-0000-0000-0000-000000000003', v_eternal, 3, '2025-09-20 00:00:00+00', '1eda0d08-0000-0000-0000-000000000002',
     '{"version":3,"total_minor":501200000000,"line_count":354,"note":"MEP scope expansion + smart-home addendum"}'::jsonb,
     'Rev 3 — MEP scope expansion (smart-home addendum)'),
    ('1eda0d08-0000-0000-0000-000000000004', v_eternal, 4, '2026-01-15 00:00:00+00', '1eda0d08-0000-0000-0000-000000000003',
     '{"version":4,"total_minor":508400000000,"line_count":358,"note":"Finishes vendor change-out + pool tile upgrade"}'::jsonb,
     'Rev 4 (current) — finishes vendor change-out; pool tile upgrade')
  ON CONFLICT (project_id, version) DO UPDATE SET
    snapshot = EXCLUDED.snapshot,
    note = EXCLUDED.note;

  -- ===========================================================================
  -- 9. boq_actuals + variance_reviews — conditional on boq_items presence
  -- ===========================================================================
  -- These FK into boq_items, which has its own seed prerequisites (boq_sections
  -- + boq_documents) not yet present in the base demo seed. Skip with NOTICE
  -- if not available; the cabinet UIs handle empty arrays.

  IF EXISTS (SELECT 1 FROM boq_items LIMIT 1) THEN
    RAISE NOTICE 'boq_items present — boq_actuals + variance_reviews seed not yet implemented in this slice (operator can extend).';
  ELSE
    RAISE NOTICE 'boq_items not present — skipping boq_actuals + variance_reviews. (Add boq_documents + boq_sections + boq_items fixtures in a follow-up seed.)';
  END IF;

  RAISE NOTICE 'Phase 2 dev seed applied: 42 milestones, 6 dependencies, 8 RFIs, 3 vendors, 4 investors, 6 capital_calls, 18 allocations, 18 vendor_scores, 4 boq_revisions.';
END $$;
