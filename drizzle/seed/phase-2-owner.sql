-- =============================================================================
-- Phase 2 data-wiring PR 3 — Owner slice seed
--
-- Demo rows for the 3 new Owner tables from migration 0114 +
-- exercises the documents ALTER (signed_at, expires_at, visible_to_owner).
--
-- Idempotent: every INSERT uses ON CONFLICT DO NOTHING / DO UPDATE.
--
-- Apply order: drizzle/seed.sql → drizzle/seed/phase-2-mgmt.sql →
--              drizzle/seed/phase-2-dev.sql →
--              drizzle/seed/phase-2-owner.sql
--
-- Per docs/audits/2026-05-27-phase-2-data-wiring-scope.md § Owner Portal
-- and phase-2-data-wiring-handoff/prompts/03-owner.md Seed section.
--
-- UUID prefix convention for this slice: 1eda0e01..1eda0e0f
-- =============================================================================

DO $$
BEGIN
  -- Schema check.
  IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'owner_threads') THEN
    RAISE NOTICE 'Phase 2 owner tables not present — skipping seed.';
    RETURN;
  END IF;

  -- The 3 base owners + 11 added in phase-2-mgmt.sql = 14 total. If
  -- phase-2-mgmt.sql hasn't applied yet, fall back to the 3 base owners.
  IF NOT EXISTS (SELECT 1 FROM owners WHERE id = '1eda0003-0000-0000-0000-000000000001') THEN
    RAISE NOTICE 'Base owners not present — skipping phase-2 owner seed.';
    RETURN;
  END IF;

  -- ===========================================================================
  -- 1. owner_notification_prefs — 1 row per owner (default values; 4 owners
  --                              get custom overrides)
  -- ===========================================================================
  -- Defaults are already set by the schema; this seed just creates the rows
  -- so the settings page reads a real row instead of falling back to defaults.

  -- Default-prefs row for every owner (any owner_id present in `owners`).
  INSERT INTO owner_notification_prefs (owner_id)
  SELECT id FROM owners
  ON CONFLICT (owner_id) DO NOTHING;

  -- 4 owners with custom overrides — flip arrival_alerts + marketing_updates ON
  -- for the gold-tier (in the mgmt-slice nomenclature) demo owners.
  UPDATE owner_notification_prefs
     SET arrival_alerts = true,
         marketing_updates = true,
         updated_at = now()
   WHERE owner_id IN (
     '1eda0003-0000-0000-0000-000000000001',  -- Emma Whitmore
     '1eda0003-0000-0000-0000-000000000002',  -- Takeda FO
     '1eda0c01-0000-0000-0000-000000000005',  -- Chloé Martin
     '1eda0c01-0000-0000-0000-00000000000a'   -- Mei-Ling Chen
   );

  -- ===========================================================================
  -- 2. owner_threads — 5 threads (2 open, 1 escalated, 2 archived)
  -- ===========================================================================
  INSERT INTO owner_threads (id, owner_id, subject, kind, related_entity_type, related_entity_id, last_message_at, unread_count, status, created_at) VALUES
    -- Emma — open dispute on her April statement
    ('1eda0e01-0000-0000-0000-000000000001', '1eda0003-0000-0000-0000-000000000001',
     'Question on April statement utilities line',
     'dispute',
     'statement', '1eda0c04-0000-0000-0000-000000000001',
     now() - interval '6 hours', 2, 'open',
     now() - interval '2 days'),
    -- Takeda FO — open personal stay request
    ('1eda0e01-0000-0000-0000-000000000002', '1eda0003-0000-0000-0000-000000000002',
     'Personal stay — Ahau 01, late June',
     'personal_stay_request',
     'booking', NULL,
     now() - interval '1 day', 1, 'open',
     now() - interval '3 days'),
    -- Sonoma Capital — escalated maintenance question
    ('1eda0e01-0000-0000-0000-000000000003', '1eda0003-0000-0000-0000-000000000003',
     'Pool pump issue at Eternal S1 — pls advise',
     'maintenance_question',
     'maintenance_ticket', '1eda0b02-0000-0000-0000-000000000002',
     now() - interval '4 days', 0, 'escalated',
     now() - interval '5 days'),
    -- Park Capital — archived tax question
    ('1eda0e01-0000-0000-0000-000000000004', '1eda0c01-0000-0000-0000-000000000007',
     'PHR certificate timing for FY 2025',
     'tax_question',
     NULL, NULL,
     now() - interval '21 days', 0, 'archived',
     now() - interval '30 days'),
    -- Mei-Ling — archived general question
    ('1eda0e01-0000-0000-0000-000000000005', '1eda0c01-0000-0000-0000-00000000000a',
     'Quarterly review walkthrough',
     'q_review',
     NULL, NULL,
     now() - interval '60 days', 0, 'archived',
     now() - interval '70 days')
  ON CONFLICT (id) DO UPDATE SET
    status = EXCLUDED.status,
    unread_count = EXCLUDED.unread_count,
    last_message_at = EXCLUDED.last_message_at;

  -- ===========================================================================
  -- 3. owner_messages — 32 messages distributed across the 5 threads
  -- ===========================================================================
  -- Voice mix: owner / mgmt_staff / concierge_agent. The agent messages
  -- carry `inline_actions` so the UI's "View statement" chip renders.

  INSERT INTO owner_messages (id, thread_id, actor_kind, actor_id, body, inline_actions, sent_at) VALUES
    -- Thread 1: dispute on April statement (10 messages)
    ('1eda0e02-0000-0000-0000-000000010001', '1eda0e01-0000-0000-0000-000000000001', 'owner',           NULL, 'Hi — utilities line on the April statement is $185, which is roughly double March. What changed?', NULL,                                                                                           now() - interval '2 days'),
    ('1eda0e02-0000-0000-0000-000000010002', '1eda0e01-0000-0000-0000-000000000001', 'concierge_agent', NULL, 'Pulling the April statement detail — the utilities line aggregates electricity + water. I''ll attach the per-day breakdown shortly.', '[{"kind":"view_statement","payload":{"statementId":"1eda0c04-0000-0000-0000-000000000001"}}]'::jsonb, now() - interval '2 days' + interval '5 minutes'),
    ('1eda0e02-0000-0000-0000-000000010003', '1eda0e01-0000-0000-0000-000000000001', 'concierge_agent', NULL, 'Per-day: electricity 23 days × ~$5.20 (HVAC ran all month), water $63 (pool top-up after the heavy guests in mid-April). 30% above March, broadly within range vs. last year''s April.', NULL,                                                                                           now() - interval '2 days' + interval '12 minutes'),
    ('1eda0e02-0000-0000-0000-000000010004', '1eda0e01-0000-0000-0000-000000000001', 'owner',           NULL, 'OK that makes sense. Anything we can do about the HVAC draw — is there a programmable thermostat option for the next stay batch?', NULL,                                                                                           now() - interval '1 day' - interval '4 hours'),
    ('1eda0e02-0000-0000-0000-000000010005', '1eda0e01-0000-0000-0000-000000000001', 'mgmt_staff',      NULL, 'Yes — we have a smart thermostat plan in the maintenance backlog. I''ll bump it forward and confirm the install date this week.', NULL,                                                                                           now() - interval '1 day'),
    ('1eda0e02-0000-0000-0000-000000010006', '1eda0e01-0000-0000-0000-000000000001', 'owner',           NULL, 'Great, thanks.', NULL,                                                                                                                                                                                       now() - interval '20 hours'),
    ('1eda0e02-0000-0000-0000-000000010007', '1eda0e01-0000-0000-0000-000000000001', 'mgmt_staff',      NULL, 'Thermostat install scheduled May 14 — vendor confirmed. I''ll mark the statement question resolved unless you''d like to flag anything else.', NULL,                                                       now() - interval '12 hours'),
    ('1eda0e02-0000-0000-0000-000000010008', '1eda0e01-0000-0000-0000-000000000001', 'owner',           NULL, 'One more — can I see the breakdown for water specifically? I want to know if guests are leaving taps running.', NULL,                                                                                       now() - interval '8 hours'),
    ('1eda0e02-0000-0000-0000-000000010009', '1eda0e01-0000-0000-0000-000000000001', 'concierge_agent', NULL, 'Sure — water meter readings attached. Big day was Apr 14 (pool refill after the deep clean); rest of the month looks normal.', '[{"kind":"view_statement","payload":{"statementId":"1eda0c04-0000-0000-0000-000000000001","line":"utilities.water"}}]'::jsonb, now() - interval '7 hours'),
    ('1eda0e02-0000-0000-0000-00000001000a', '1eda0e01-0000-0000-0000-000000000001', 'owner',           NULL, 'Perfect, thanks.', NULL,                                                                                                                                                                                  now() - interval '6 hours'),

    -- Thread 2: Personal stay request (5 messages)
    ('1eda0e02-0000-0000-0000-000000020001', '1eda0e01-0000-0000-0000-000000000002', 'owner',           NULL, 'Hi — we''d like to stay at Ahau 01 June 22-29. 2 adults, 1 child. Just us, low-key.', NULL,                                                                                                                now() - interval '3 days'),
    ('1eda0e02-0000-0000-0000-000000020002', '1eda0e01-0000-0000-0000-000000000002', 'concierge_agent', NULL, 'Booking lookup: Ahau 01 has an open block June 20-July 4. I''ve held it for 48h. Director needs to confirm the comp for owner-stay nights — usually 7 of 7 covered for tier-1 owners.', '[{"kind":"approve_owner_stay","payload":{"villaId":"1eda0002-0000-0000-0000-000000000020","start":"2026-06-22","end":"2026-06-29"}}]'::jsonb, now() - interval '3 days' + interval '8 minutes'),
    ('1eda0e02-0000-0000-0000-000000020003', '1eda0e01-0000-0000-0000-000000000002', 'mgmt_staff',      NULL, 'Director approved — 7 nights, 100% comped. Booking confirmed. Welcome plan + chef pre-stocking will be ready 24h before arrival.', NULL,                                                                  now() - interval '2 days'),
    ('1eda0e02-0000-0000-0000-000000020004', '1eda0e01-0000-0000-0000-000000000002', 'owner',           NULL, 'Wonderful, thank you. Could we have the driver from last time? Wayan was great.', NULL,                                                                                                                    now() - interval '1 day' - interval '6 hours'),
    ('1eda0e02-0000-0000-0000-000000020005', '1eda0e01-0000-0000-0000-000000000002', 'mgmt_staff',      NULL, 'Of course — Wayan is booked for your dates. Anything else, just shout.', NULL,                                                                                                                              now() - interval '1 day'),

    -- Thread 3: Maintenance — escalated (8 messages)
    ('1eda0e02-0000-0000-0000-000000030001', '1eda0e01-0000-0000-0000-000000000003', 'owner',           NULL, 'Hi — was the pool pump fully fixed? Last newsletter mentioned it''d been "intermittent" for 2 weeks before service.', NULL,                                                                                  now() - interval '5 days'),
    ('1eda0e02-0000-0000-0000-000000030002', '1eda0e01-0000-0000-0000-000000000003', 'concierge_agent', NULL, 'Pulling the ticket — MNT-20260425-0002 is in `waiting_parts` status. Replacement pump shipped from Surabaya, arrives ~May 8. Apologies for the delay; I''m escalating to the operations manager.', '[{"kind":"view_ticket","payload":{"ticketId":"1eda0b02-0000-0000-0000-000000000002"}}]'::jsonb, now() - interval '5 days' + interval '4 minutes'),
    ('1eda0e02-0000-0000-0000-000000030003', '1eda0e01-0000-0000-0000-000000000003', 'mgmt_staff',      NULL, 'Operations Mgr here — sorry for the delay. The intermittent pattern caused 2 SLA breaches in our internal tracker. I''ve given you a $200 credit on next month''s statement as a goodwill gesture.', NULL,                                                                                          now() - interval '4 days' - interval '2 hours'),
    ('1eda0e02-0000-0000-0000-000000030004', '1eda0e01-0000-0000-0000-000000000003', 'owner',           NULL, 'Appreciated. Please make sure the next-stay guest doesn''t arrive to a half-working pump.', NULL,                                                                                                            now() - interval '4 days' - interval '1 hour'),
    ('1eda0e02-0000-0000-0000-000000030005', '1eda0e01-0000-0000-0000-000000000003', 'mgmt_staff',      NULL, 'Agreed. We have the pump replacement scheduled for May 9; next guest checks in May 12. Buffer is comfortable.', NULL,                                                                                       now() - interval '4 days'),
    ('1eda0e02-0000-0000-0000-000000030006', '1eda0e01-0000-0000-0000-000000000003', 'system',          NULL, 'Thread escalated to operations director (auto: 2 SLA breaches in 14d window).', NULL,                                                                                                                       now() - interval '4 days' + interval '10 minutes'),
    ('1eda0e02-0000-0000-0000-000000030007', '1eda0e01-0000-0000-0000-000000000003', 'owner',           NULL, 'Thanks for the transparency. Let me know once it''s done.', NULL,                                                                                                                                            now() - interval '4 days' + interval '20 minutes'),
    ('1eda0e02-0000-0000-0000-000000030008', '1eda0e01-0000-0000-0000-000000000003', 'mgmt_staff',      NULL, 'Pump replaced May 9 — system tested 48h. All clear.', NULL,                                                                                                                                                 now() - interval '4 days' + interval '8 hours'),

    -- Thread 4: PHR certificate timing — archived (5 messages)
    ('1eda0e02-0000-0000-0000-000000040001', '1eda0e01-0000-0000-0000-000000000004', 'owner',           NULL, 'When do we get the FY 2025 PHR cert?', NULL,                                                                                                                                                                 now() - interval '30 days'),
    ('1eda0e02-0000-0000-0000-000000040002', '1eda0e01-0000-0000-0000-000000000004', 'concierge_agent', NULL, 'PHR certificates are issued by the tax office on a rolling basis after the FY closes. For FY 2025 (Jan-Dec) — expected delivery window is end of Feb through mid-April 2026.', NULL,                       now() - interval '30 days' + interval '6 minutes'),
    ('1eda0e02-0000-0000-0000-000000040003', '1eda0e01-0000-0000-0000-000000000004', 'mgmt_staff',      NULL, 'I''ll watch for it and upload as soon as it arrives. You''ll get an email when it''s in your portal.', NULL,                                                                                                now() - interval '29 days'),
    ('1eda0e02-0000-0000-0000-000000040004', '1eda0e01-0000-0000-0000-000000000004', 'mgmt_staff',      NULL, 'FY 2025 PHR certificate uploaded — see Documents > Tax.', NULL,                                                                                                                                              now() - interval '22 days'),
    ('1eda0e02-0000-0000-0000-000000040005', '1eda0e01-0000-0000-0000-000000000004', 'owner',           NULL, 'Got it, thanks.', NULL,                                                                                                                                                                                     now() - interval '21 days'),

    -- Thread 5: Q-review — archived (4 messages)
    ('1eda0e02-0000-0000-0000-000000050001', '1eda0e01-0000-0000-0000-000000000005', 'owner',           NULL, 'Can we schedule a Q1 walk-through for the portfolio?', NULL,                                                                                                                                                 now() - interval '70 days'),
    ('1eda0e02-0000-0000-0000-000000050002', '1eda0e01-0000-0000-0000-000000000005', 'mgmt_staff',      NULL, 'Of course — proposing Apr 8 at 14:00 ICT. Director will join.', NULL,                                                                                                                                        now() - interval '68 days'),
    ('1eda0e02-0000-0000-0000-000000050003', '1eda0e01-0000-0000-0000-000000000005', 'owner',           NULL, 'Confirmed.', NULL,                                                                                                                                                                                          now() - interval '67 days'),
    ('1eda0e02-0000-0000-0000-000000050004', '1eda0e01-0000-0000-0000-000000000005', 'mgmt_staff',      NULL, 'Q1 review materials sent + meeting completed Apr 8. Archive.', NULL,                                                                                                                                          now() - interval '60 days')
  ON CONFLICT (id) DO NOTHING;

  -- ===========================================================================
  -- 4. documents — 18 owner-visible documents (entity_type='owner')
  -- ===========================================================================
  -- 4 contracts + 8 statements + 3 tax + 3 maintenance reports.
  -- All visible_to_owner = true. Sample storage paths included so the
  -- /api/documents/<id>/download wiring resolves; the actual files are not
  -- staged in storage by this seed (a future seed step or the operator
  -- uploads them).

  INSERT INTO documents (id, title, document_type, entity_type, entity_id, storage_bucket, storage_path, file_name, mime_type, visibility, visible_to_owner, signed_at, expires_at, created_at) VALUES
    -- Contracts (4)
    ('1eda0e03-0000-0000-0000-000000000001', 'MSA — Whitmore × Arconique (2024)',                   'contract', 'owner', '1eda0003-0000-0000-0000-000000000001', 'demo-docs', 'owners/whitmore/msa-2024.pdf',         'msa-2024.pdf',          'application/pdf', 'owner', true, '2024-08-15 00:00:00+00', '2029-08-15 00:00:00+00', now() - interval '440 days'),
    ('1eda0e03-0000-0000-0000-000000000002', 'Annex 1 — Pool maintenance scope (2024)',             'contract', 'owner', '1eda0003-0000-0000-0000-000000000001', 'demo-docs', 'owners/whitmore/annex-1.pdf',          'annex-1.pdf',           'application/pdf', 'owner', true, '2024-09-01 00:00:00+00', NULL,                     now() - interval '420 days'),
    ('1eda0e03-0000-0000-0000-000000000003', 'MSA — Takeda FO × Arconique (2024)',                  'contract', 'owner', '1eda0003-0000-0000-0000-000000000002', 'demo-docs', 'owners/takeda/msa-2024.pdf',           'msa-2024.pdf',          'application/pdf', 'owner', true, '2024-08-20 00:00:00+00', '2029-08-20 00:00:00+00', now() - interval '435 days'),
    ('1eda0e03-0000-0000-0000-000000000004', 'POA — Sonoma Capital (2025)',                         'contract', 'owner', '1eda0003-0000-0000-0000-000000000003', 'demo-docs', 'owners/sonoma/poa-2025.pdf',           'poa-2025.pdf',          'application/pdf', 'owner', true, '2025-01-12 00:00:00+00', '2027-01-12 00:00:00+00', now() - interval '120 days'),

    -- Statements (8) — 1 per month per owner for Whitmore + Takeda
    ('1eda0e03-0000-0000-0000-000000000011', 'Statement — Jan 2026 (Whitmore)', 'statement', 'owner', '1eda0003-0000-0000-0000-000000000001', 'demo-docs', 'owners/whitmore/stmt-202601.pdf', 'stmt-202601.pdf', 'application/pdf', 'owner', true, '2026-02-05 00:00:00+00', NULL, '2026-02-03 00:00:00+00'),
    ('1eda0e03-0000-0000-0000-000000000012', 'Statement — Feb 2026 (Whitmore)', 'statement', 'owner', '1eda0003-0000-0000-0000-000000000001', 'demo-docs', 'owners/whitmore/stmt-202602.pdf', 'stmt-202602.pdf', 'application/pdf', 'owner', true, '2026-03-05 00:00:00+00', NULL, '2026-03-03 00:00:00+00'),
    ('1eda0e03-0000-0000-0000-000000000013', 'Statement — Mar 2026 (Whitmore)', 'statement', 'owner', '1eda0003-0000-0000-0000-000000000001', 'demo-docs', 'owners/whitmore/stmt-202603.pdf', 'stmt-202603.pdf', 'application/pdf', 'owner', true, '2026-04-05 00:00:00+00', NULL, '2026-04-03 00:00:00+00'),
    ('1eda0e03-0000-0000-0000-000000000014', 'Statement — Apr 2026 (Whitmore) — pending', 'statement', 'owner', '1eda0003-0000-0000-0000-000000000001', 'demo-docs', 'owners/whitmore/stmt-202604.pdf', 'stmt-202604.pdf', 'application/pdf', 'owner', true, NULL, NULL, now() - interval '2 days'),
    ('1eda0e03-0000-0000-0000-000000000015', 'Statement — Jan 2026 (Takeda)', 'statement', 'owner', '1eda0003-0000-0000-0000-000000000002', 'demo-docs', 'owners/takeda/stmt-202601.pdf', 'stmt-202601.pdf', 'application/pdf', 'owner', true, '2026-02-05 00:00:00+00', NULL, '2026-02-03 00:00:00+00'),
    ('1eda0e03-0000-0000-0000-000000000016', 'Statement — Feb 2026 (Takeda)', 'statement', 'owner', '1eda0003-0000-0000-0000-000000000002', 'demo-docs', 'owners/takeda/stmt-202602.pdf', 'stmt-202602.pdf', 'application/pdf', 'owner', true, '2026-03-05 00:00:00+00', NULL, '2026-03-03 00:00:00+00'),
    ('1eda0e03-0000-0000-0000-000000000017', 'Statement — Mar 2026 (Takeda)', 'statement', 'owner', '1eda0003-0000-0000-0000-000000000002', 'demo-docs', 'owners/takeda/stmt-202603.pdf', 'stmt-202603.pdf', 'application/pdf', 'owner', true, '2026-04-05 00:00:00+00', NULL, '2026-04-03 00:00:00+00'),
    ('1eda0e03-0000-0000-0000-000000000018', 'Statement — Apr 2026 (Takeda) — pending', 'statement', 'owner', '1eda0003-0000-0000-0000-000000000002', 'demo-docs', 'owners/takeda/stmt-202604.pdf', 'stmt-202604.pdf', 'application/pdf', 'owner', true, NULL, NULL, now() - interval '2 days'),

    -- Tax (3)
    ('1eda0e03-0000-0000-0000-000000000021', 'PHR certificate — FY 2025 (Whitmore)',  'certificate', 'owner', '1eda0003-0000-0000-0000-000000000001', 'demo-docs', 'owners/whitmore/phr-fy2025.pdf', 'phr-fy2025.pdf', 'application/pdf', 'owner', true, '2026-03-18 00:00:00+00', NULL, '2026-03-18 00:00:00+00'),
    ('1eda0e03-0000-0000-0000-000000000022', 'WHT statement — FY 2025 (Whitmore)',    'certificate', 'owner', '1eda0003-0000-0000-0000-000000000001', 'demo-docs', 'owners/whitmore/wht-fy2025.pdf', 'wht-fy2025.pdf', 'application/pdf', 'owner', true, '2026-03-20 00:00:00+00', NULL, '2026-03-20 00:00:00+00'),
    ('1eda0e03-0000-0000-0000-000000000023', 'PHR certificate — FY 2025 (Takeda FO)', 'certificate', 'owner', '1eda0003-0000-0000-0000-000000000002', 'demo-docs', 'owners/takeda/phr-fy2025.pdf',   'phr-fy2025.pdf', 'application/pdf', 'owner', true, '2026-03-18 00:00:00+00', NULL, '2026-03-18 00:00:00+00'),

    -- Maintenance reports (3)
    ('1eda0e03-0000-0000-0000-000000000031', 'Q1 maintenance summary — Ahau 02',  'other', 'owner', '1eda0003-0000-0000-0000-000000000001', 'demo-docs', 'owners/whitmore/maint-q1-2026.pdf',  'maint-q1-2026.pdf',  'application/pdf', 'owner', true, NULL, NULL, '2026-04-12 00:00:00+00'),
    ('1eda0e03-0000-0000-0000-000000000032', 'Q1 maintenance summary — Ahau 01',  'other', 'owner', '1eda0003-0000-0000-0000-000000000002', 'demo-docs', 'owners/takeda/maint-q1-2026.pdf',    'maint-q1-2026.pdf',  'application/pdf', 'owner', true, NULL, NULL, '2026-04-12 00:00:00+00'),
    ('1eda0e03-0000-0000-0000-000000000033', 'Annual building insurance cert 2026','policy', 'owner', '1eda0003-0000-0000-0000-000000000003', 'demo-docs', 'owners/sonoma/insurance-2026.pdf', 'insurance-2026.pdf', 'application/pdf', 'owner', true, '2026-01-15 00:00:00+00', '2027-01-15 00:00:00+00', '2026-01-15 00:00:00+00')
  ON CONFLICT (id) DO UPDATE SET
    title = EXCLUDED.title,
    visible_to_owner = EXCLUDED.visible_to_owner,
    signed_at = EXCLUDED.signed_at,
    expires_at = EXCLUDED.expires_at;

  RAISE NOTICE 'Phase 2 owner seed applied: 14 notification_prefs, 5 threads, 32 messages, 18 documents.';
END $$;
