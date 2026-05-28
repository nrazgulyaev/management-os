-- =============================================================================
-- Packet C PR 1 — owner-data-l2 seed
--
-- Demo rows for villa_photos + owner_activity_log + owner_stay_requests
-- (the prompt says owner_stays but that table is already richly modeled
-- as ownerStayRequests in owner-stays.ts — seed against the real one).
--
-- Idempotent.
--
-- UUID prefix: 1eda0f01..1eda0f0f
-- =============================================================================

DO $$
DECLARE
  v_org_id      uuid := 'aaaa1111-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
  v_director_id uuid;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'villa_photos') THEN
    RAISE NOTICE 'Packet C PR 1 tables not present — skipping seed.';
    RETURN;
  END IF;

  -- Resolve any director / super_admin app_user for the photo uploaded_by.
  SELECT u.id INTO v_director_id
  FROM app_users u
  JOIN app_user_roles r ON r.app_user_id = u.id
  WHERE r.role_key IN ('super_admin','director')
  ORDER BY u.created_at
  LIMIT 1;

  -- ===========================================================================
  -- 1. villa_photos — 6 per villa × 3 villas = 18 rows
  -- ===========================================================================
  -- Uses picsum.photos URLs as demo content. 1 hero, 4 gallery, 1 aerial each.

  INSERT INTO villa_photos (id, villa_id, url, caption, kind, position, width, height, uploaded_by_user_id, visible_to_owner) VALUES
    -- Ahau 02 (Whitmore's villa)
    ('1eda0f01-0000-0000-0000-000000000001', '1eda0002-0000-0000-0000-000000000021', 'https://picsum.photos/seed/ahau02-hero/1600/900', 'Hero shot — sunset from west deck',  'hero',    0, 1600, 900, v_director_id, true),
    ('1eda0f01-0000-0000-0000-000000000002', '1eda0002-0000-0000-0000-000000000021', 'https://picsum.photos/seed/ahau02-g1/1200/800',  'Living pavilion at dusk',           'gallery', 1, 1200, 800, v_director_id, true),
    ('1eda0f01-0000-0000-0000-000000000003', '1eda0002-0000-0000-0000-000000000021', 'https://picsum.photos/seed/ahau02-g2/1200/800',  'Pool reflection',                    'gallery', 2, 1200, 800, v_director_id, true),
    ('1eda0f01-0000-0000-0000-000000000004', '1eda0002-0000-0000-0000-000000000021', 'https://picsum.photos/seed/ahau02-g3/1200/800',  'Master suite',                       'gallery', 3, 1200, 800, v_director_id, true),
    ('1eda0f01-0000-0000-0000-000000000005', '1eda0002-0000-0000-0000-000000000021', 'https://picsum.photos/seed/ahau02-g4/1200/800',  'Garden path to entrance',            'gallery', 4, 1200, 800, v_director_id, true),
    ('1eda0f01-0000-0000-0000-000000000006', '1eda0002-0000-0000-0000-000000000021', 'https://picsum.photos/seed/ahau02-aerial/1600/1000', 'Drone view — full site',        'aerial',  5, 1600, 1000, v_director_id, true),

    -- Ahau 01 (Takeda's villa)
    ('1eda0f01-0000-0000-0000-000000000011', '1eda0002-0000-0000-0000-000000000020', 'https://picsum.photos/seed/ahau01-hero/1600/900', 'Hero shot — main pavilion',         'hero',    0, 1600, 900, v_director_id, true),
    ('1eda0f01-0000-0000-0000-000000000012', '1eda0002-0000-0000-0000-000000000020', 'https://picsum.photos/seed/ahau01-g1/1200/800',  'Pool deck at sunset',                'gallery', 1, 1200, 800, v_director_id, true),
    ('1eda0f01-0000-0000-0000-000000000013', '1eda0002-0000-0000-0000-000000000020', 'https://picsum.photos/seed/ahau01-g2/1200/800',  'Dining pavilion',                    'gallery', 2, 1200, 800, v_director_id, true),
    ('1eda0f01-0000-0000-0000-000000000014', '1eda0002-0000-0000-0000-000000000020', 'https://picsum.photos/seed/ahau01-g3/1200/800',  'Bedroom 1',                          'gallery', 3, 1200, 800, v_director_id, true),
    ('1eda0f01-0000-0000-0000-000000000015', '1eda0002-0000-0000-0000-000000000020', 'https://picsum.photos/seed/ahau01-g4/1200/800',  'Bathroom — main suite',              'gallery', 4, 1200, 800, v_director_id, true),
    ('1eda0f01-0000-0000-0000-000000000016', '1eda0002-0000-0000-0000-000000000020', 'https://picsum.photos/seed/ahau01-aerial/1600/1000', 'Drone view — neighbouring beach', 'aerial', 5, 1600, 1000, v_director_id, true),

    -- Eternal S1 (Sonoma Capital's pooled)
    ('1eda0f01-0000-0000-0000-000000000021', '1eda0002-0000-0000-0000-000000000001', 'https://picsum.photos/seed/ev01-hero/1600/900',   'Hero shot — facade at dawn',         'hero',    0, 1600, 900, v_director_id, true),
    ('1eda0f01-0000-0000-0000-000000000022', '1eda0002-0000-0000-0000-000000000001', 'https://picsum.photos/seed/ev01-g1/1200/800',    'Entry courtyard',                    'gallery', 1, 1200, 800, v_director_id, true),
    ('1eda0f01-0000-0000-0000-000000000023', '1eda0002-0000-0000-0000-000000000001', 'https://picsum.photos/seed/ev01-g2/1200/800',    'Living + kitchen',                   'gallery', 2, 1200, 800, v_director_id, true),
    ('1eda0f01-0000-0000-0000-000000000024', '1eda0002-0000-0000-0000-000000000001', 'https://picsum.photos/seed/ev01-g3/1200/800',    'Cantilever deck',                    'gallery', 3, 1200, 800, v_director_id, true),
    ('1eda0f01-0000-0000-0000-000000000025', '1eda0002-0000-0000-0000-000000000001', 'https://picsum.photos/seed/ev01-g4/1200/800',    'Garden — banyan view',               'gallery', 4, 1200, 800, v_director_id, true),
    ('1eda0f01-0000-0000-0000-000000000026', '1eda0002-0000-0000-0000-000000000001', 'https://picsum.photos/seed/ev01-aerial/1600/1000', 'Drone view — cliff edge',          'aerial',  5, 1600, 1000, v_director_id, true)
  ON CONFLICT (id) DO UPDATE SET
    url = EXCLUDED.url,
    caption = EXCLUDED.caption,
    visible_to_owner = EXCLUDED.visible_to_owner;

  -- ===========================================================================
  -- 2. owner_stay_requests — 3 confirmed past + 2 confirmed future
  --                         + 1 requested + 1 declined = 7 rows
  -- ===========================================================================
  -- The schema is the rich ownerStayRequests model from owner-stays.ts.
  -- Use the existing statuses: 'requested' | 'approved' | 'rejected' |
  -- 'cancelled' | 'completed' (status enum is text — flexible).

  INSERT INTO owner_stay_requests (id, owner_id, requested_by_app_user_id, villa_id, project_id, requested_start, requested_end, guests_count, purpose, status, approved_by, approved_at, completed_at) VALUES
    -- Whitmore — confirmed past (completed)
    ('1eda0f02-0000-0000-0000-000000000001', '1eda0003-0000-0000-0000-000000000001', NULL,
     '1eda0002-0000-0000-0000-000000000021', '1eda0001-0000-0000-0000-000000000003',
     '2025-12-22', '2025-12-29', 4, 'Christmas / NYE',
     'completed', v_director_id, '2025-11-15 00:00:00+00', '2025-12-29 12:00:00+00'),
    ('1eda0f02-0000-0000-0000-000000000002', '1eda0003-0000-0000-0000-000000000001', NULL,
     '1eda0002-0000-0000-0000-000000000021', '1eda0001-0000-0000-0000-000000000003',
     '2026-02-14', '2026-02-21', 2, 'Anniversary week',
     'completed', v_director_id, '2026-01-20 00:00:00+00', '2026-02-21 12:00:00+00'),
    -- Sonoma Capital — confirmed past
    ('1eda0f02-0000-0000-0000-000000000003', '1eda0003-0000-0000-0000-000000000003', NULL,
     '1eda0002-0000-0000-0000-000000000001', '1eda0001-0000-0000-0000-000000000001',
     '2025-08-10', '2025-08-17', 6, 'Partner retreat',
     'completed', v_director_id, '2025-07-15 00:00:00+00', '2025-08-17 12:00:00+00'),
    -- Takeda FO — confirmed future (the one from owner_messages thread 2)
    ('1eda0f02-0000-0000-0000-000000000004', '1eda0003-0000-0000-0000-000000000002', NULL,
     '1eda0002-0000-0000-0000-000000000020', '1eda0001-0000-0000-0000-000000000003',
     '2026-06-22', '2026-06-29', 3, 'Family low-key stay',
     'approved', v_director_id, now() - interval '2 days', NULL),
    -- Whitmore — confirmed future
    ('1eda0f02-0000-0000-0000-000000000005', '1eda0003-0000-0000-0000-000000000001', NULL,
     '1eda0002-0000-0000-0000-000000000021', '1eda0001-0000-0000-0000-000000000003',
     '2026-08-05', '2026-08-12', 4, 'Summer family week',
     'approved', v_director_id, now() - interval '5 days', NULL),
    -- Chloé Martin — pending (requested, awaiting Mgmt confirmation)
    ('1eda0f02-0000-0000-0000-000000000006', '1eda0c01-0000-0000-0000-000000000005', NULL,
     '1eda0002-0000-0000-0000-000000000001', '1eda0001-0000-0000-0000-000000000001',
     '2026-07-10', '2026-07-17', 2, 'Tentative — work travel',
     'requested', NULL, NULL, NULL),
    -- Park Capital — declined (conflict with high-revenue guest period)
    ('1eda0f02-0000-0000-0000-000000000007', '1eda0c01-0000-0000-0000-000000000007', NULL,
     '1eda0002-0000-0000-0000-000000000020', '1eda0001-0000-0000-0000-000000000003',
     '2026-08-15', '2026-08-19', 2, 'Long weekend',
     'rejected', NULL, NULL, NULL)
  ON CONFLICT (id) DO UPDATE SET
    status = EXCLUDED.status,
    approved_at = EXCLUDED.approved_at;

  -- ===========================================================================
  -- 3. owner_activity_log — 24 rows across owners, last 30 days
  -- ===========================================================================
  -- Mix of all 10 kinds spread across owners; dates clustered around the
  -- most-active owners (Whitmore + Takeda).

  INSERT INTO owner_activity_log (id, owner_id, kind, related_entity_type, related_entity_id, subject, body, link_url, occurred_at) VALUES
    -- Whitmore (Emma) — most active demo owner
    ('1eda0f03-0000-0000-0000-000000000001', '1eda0003-0000-0000-0000-000000000001', 'statement_issued',         'statement', '1eda0c04-0000-0000-0000-000000000001', 'April statement ready for review',     'Net to you $9,650 — awaiting your acknowledge.', '/owner/statements/1eda0c04-0000-0000-0000-000000000001', now() - interval '2 days'),
    ('1eda0f03-0000-0000-0000-000000000002', '1eda0003-0000-0000-0000-000000000001', 'message_received',         'thread',    '1eda0e01-0000-0000-0000-000000000001', 'New reply on your dispute thread',     'Mgmt confirmed thermostat install May 14.',     '/owner/inbox/1eda0e01-0000-0000-0000-000000000001',     now() - interval '12 hours'),
    ('1eda0f03-0000-0000-0000-000000000003', '1eda0003-0000-0000-0000-000000000001', 'booking_confirmed',        'booking',   NULL,                                     'Guest confirmed — June arrival',       'Family of 4 · 5 nights · $612 ADR.',             '/owner/calendar',                                        now() - interval '4 days'),
    ('1eda0f03-0000-0000-0000-000000000004', '1eda0003-0000-0000-0000-000000000001', 'document_uploaded',        'document',  '1eda0e03-0000-0000-0000-000000000021', 'PHR certificate FY 2025 uploaded',     NULL,                                              '/owner/documents',                                       now() - interval '7 days'),
    ('1eda0f03-0000-0000-0000-000000000005', '1eda0003-0000-0000-0000-000000000001', 'maintenance_closed',       'ticket',    NULL,                                     'AC service completed at Ahau 02',      'Bedroom 2 AC fully restored.',                   NULL,                                                     now() - interval '11 days'),
    ('1eda0f03-0000-0000-0000-000000000006', '1eda0003-0000-0000-0000-000000000001', 'personal_stay_confirmed',  'owner_stay','1eda0f02-0000-0000-0000-000000000005', 'August stay confirmed',                'Aug 5-12, 4 guests. Welcome plan in queue.',     '/owner/calendar?month=2026-08',                          now() - interval '5 days'),
    ('1eda0f03-0000-0000-0000-000000000007', '1eda0003-0000-0000-0000-000000000001', 'statement_paid',           'statement', '1eda0c04-0000-0000-0000-000000000301', 'March statement payout sent',          'Wire ref WHM-2026-Q1-04 · $9,480.',              NULL,                                                     now() - interval '20 days'),

    -- Takeda FO
    ('1eda0f03-0000-0000-0000-000000000011', '1eda0003-0000-0000-0000-000000000002', 'statement_issued',         'statement', '1eda0c04-0000-0000-0000-000000000002', 'April statement ready for review',     'Net to you $10,720.',                            '/owner/statements/1eda0c04-0000-0000-0000-000000000002', now() - interval '2 days'),
    ('1eda0f03-0000-0000-0000-000000000012', '1eda0003-0000-0000-0000-000000000002', 'personal_stay_confirmed',  'owner_stay','1eda0f02-0000-0000-0000-000000000004', 'June stay confirmed',                  'Jun 22-29, 3 guests, Wayan booked.',             '/owner/calendar?month=2026-06',                          now() - interval '2 days'),
    ('1eda0f03-0000-0000-0000-000000000013', '1eda0003-0000-0000-0000-000000000002', 'message_received',         'thread',    '1eda0e01-0000-0000-0000-000000000002', 'Mgmt confirmed your stay request',     NULL,                                              '/owner/inbox/1eda0e01-0000-0000-0000-000000000002',     now() - interval '1 day'),
    ('1eda0f03-0000-0000-0000-000000000014', '1eda0003-0000-0000-0000-000000000002', 'document_uploaded',        'document',  '1eda0e03-0000-0000-0000-000000000023', 'PHR certificate FY 2025 uploaded',     NULL,                                              '/owner/documents',                                       now() - interval '7 days'),
    ('1eda0f03-0000-0000-0000-000000000015', '1eda0003-0000-0000-0000-000000000002', 'q_review_scheduled',       NULL,        NULL,                                     'Q1 review scheduled — Apr 8',          'Director will join, 14:00 ICT.',                 NULL,                                                     now() - interval '24 days'),

    -- Sonoma Capital
    ('1eda0f03-0000-0000-0000-000000000021', '1eda0003-0000-0000-0000-000000000003', 'statement_issued',         'statement', '1eda0c04-0000-0000-0000-000000000003', 'April statement ready for review',     'Net to you $12,960 across pool.',                '/owner/statements/1eda0c04-0000-0000-0000-000000000003', now() - interval '2 days'),
    ('1eda0f03-0000-0000-0000-000000000022', '1eda0003-0000-0000-0000-000000000003', 'maintenance_closed',       'ticket',    '1eda0b02-0000-0000-0000-000000000002', 'Pool pump replaced at Eternal S1',     'Vendor confirmed; system tested 48h.',           NULL,                                                     now() - interval '4 days'),
    ('1eda0f03-0000-0000-0000-000000000023', '1eda0003-0000-0000-0000-000000000003', 'message_received',         'thread',    '1eda0e01-0000-0000-0000-000000000003', 'Operations Mgr replied + $200 credit', NULL,                                              '/owner/inbox/1eda0e01-0000-0000-0000-000000000003',     now() - interval '4 days'),
    ('1eda0f03-0000-0000-0000-000000000024', '1eda0003-0000-0000-0000-000000000003', 'statement_paid',           'statement', '1eda0c04-0000-0000-0000-000000000303', 'March payout sent',                    'Wire ref SNM-2026-Q1-03 · $12,700.',             NULL,                                                     now() - interval '18 days'),

    -- Chloé Martin
    ('1eda0f03-0000-0000-0000-000000000031', '1eda0c01-0000-0000-0000-000000000005', 'tax_doc_ready',            'document',  NULL,                                     'Tax statement ready',                  'FY 2025 WHT summary uploaded to Documents.',     '/owner/documents',                                       now() - interval '14 days'),
    ('1eda0f03-0000-0000-0000-000000000032', '1eda0c01-0000-0000-0000-000000000005', 'other',                    NULL,        NULL,                                     'Welcome to the Owner Portal',          'Bookmark this page for monthly statements.',     '/owner',                                                  now() - interval '28 days'),

    -- Park Capital
    ('1eda0f03-0000-0000-0000-000000000041', '1eda0c01-0000-0000-0000-000000000007', 'tax_doc_ready',            'document',  NULL,                                     'PHR cert available',                   'FY 2025 PHR cert ready in Documents.',           '/owner/documents',                                       now() - interval '21 days'),
    ('1eda0f03-0000-0000-0000-000000000042', '1eda0c01-0000-0000-0000-000000000007', 'message_received',         'thread',    '1eda0e01-0000-0000-0000-000000000004', 'Q1 PHR conversation archived',         NULL,                                              '/owner/inbox/1eda0e01-0000-0000-0000-000000000004',     now() - interval '22 days'),

    -- Hiroshi Tanaka, Aisha Ramirez, Linnea Sjöberg
    ('1eda0f03-0000-0000-0000-000000000051', '1eda0c01-0000-0000-0000-000000000002', 'other',                    NULL,        NULL,                                     'Welcome to the Owner Portal',          'Tour the cabinet from the home screen.',         '/owner',                                                  now() - interval '8 days'),
    ('1eda0f03-0000-0000-0000-000000000061', '1eda0c01-0000-0000-0000-000000000001', 'other',                    NULL,        NULL,                                     'Welcome to the Owner Portal',          'Tour the cabinet from the home screen.',         '/owner',                                                  now() - interval '6 days'),
    ('1eda0f03-0000-0000-0000-000000000071', '1eda0c01-0000-0000-0000-000000000003', 'other',                    NULL,        NULL,                                     'Welcome to the Owner Portal',          'Tour the cabinet from the home screen.',         '/owner',                                                  now() - interval '5 days'),

    -- Mei-Ling
    ('1eda0f03-0000-0000-0000-000000000081', '1eda0c01-0000-0000-0000-00000000000a', 'q_review_scheduled',       NULL,        NULL,                                     'Q2 review scheduled',                  'Jul 12 at 10:00 ICT.',                           NULL,                                                     now() - interval '2 days')
  ON CONFLICT (id) DO UPDATE SET
    subject = EXCLUDED.subject,
    body = EXCLUDED.body;

  RAISE NOTICE 'Packet C PR 1 seed applied: 18 villa_photos, 7 owner_stay_requests, 24 owner_activity_log.';
END $$;
