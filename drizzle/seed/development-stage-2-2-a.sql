-- =============================================================================
-- Development OS · Stage 2.2.A demo seed
--
-- Seeds:
--   * Three lead sources (website form, Meta ads, agent referral)
--   * One agent + one agent contact
--   * Ten demo lead contacts spread across statuses and projects
--   * Initial interactions per lead (system note + first inbound message)
--
-- Idempotent. Apply order:
--   drizzle/seed.sql
--   drizzle/seed/development-stage-2-1.sql
--   drizzle/seed/development-stage-2-2-a.sql
-- =============================================================================

-- -----------------------------------------------------------------------------
-- One agent contact + agent record (deterministic UUIDs)
-- -----------------------------------------------------------------------------
INSERT INTO contacts (id, full_name, email, phone, preferred_language, acquisition_source, notes)
VALUES
  ('aaaaaaaa-0000-4000-8000-000000000001', 'Dimitri Volkov', 'dimitri@balipremiumagents.example',
    '+62 812 0000 0001', 'en', 'agent',
    'Premium Bali agent, network across HNW EU + APAC clients.')
ON CONFLICT (id) DO UPDATE SET
  full_name = EXCLUDED.full_name,
  email = EXCLUDED.email,
  phone = EXCLUDED.phone,
  acquisition_source = EXCLUDED.acquisition_source,
  notes = EXCLUDED.notes,
  updated_at = now();

INSERT INTO agents (id, contact_id, agency_name, default_commission_percent,
  default_commission_structure, agreement_status, is_preferred_partner, agreement_notes)
VALUES
  ('bbbbbbbb-0000-4000-8000-000000000001',
    'aaaaaaaa-0000-4000-8000-000000000001',
    'Bali Premium Agents',
    5.000,
    'percent_of_sale',
    'active',
    true,
    'Two closed deals on Eternal in Q4. Net 30 commission terms.')
ON CONFLICT (id) DO UPDATE SET
  agreement_status = EXCLUDED.agreement_status,
  default_commission_percent = EXCLUDED.default_commission_percent,
  is_preferred_partner = EXCLUDED.is_preferred_partner,
  agreement_notes = EXCLUDED.agreement_notes,
  updated_at = now();

-- -----------------------------------------------------------------------------
-- Lead sources
-- -----------------------------------------------------------------------------
INSERT INTO lead_sources (id, source_code, source_category, campaign_name, agent_id, is_active, notes)
VALUES
  ('cccccccc-0000-4000-8000-000000000001', 'website_form',         'website',  NULL,                 NULL, true, 'arconique.com contact form'),
  ('cccccccc-0000-4000-8000-000000000002', 'meta_ads_q4_2026',     'paid_ads', 'Eternal pre-launch', NULL, true, 'Meta Ads — Eternal carousel, Q4 2026'),
  ('cccccccc-0000-4000-8000-000000000003', 'agent_dimitri',        'agent',    NULL,                 'bbbbbbbb-0000-4000-8000-000000000001', true, 'Inbound via Dimitri'),
  ('cccccccc-0000-4000-8000-000000000004', 'instagram_organic',    'organic_social', 'IG organic',   NULL, true, 'IG bio link → contact form'),
  ('cccccccc-0000-4000-8000-000000000005', 'referral_existing_owner','referral', NULL,               NULL, true, 'Existing Eternal owner referral')
ON CONFLICT (source_code) DO UPDATE SET
  source_category = EXCLUDED.source_category,
  campaign_name = EXCLUDED.campaign_name,
  agent_id = EXCLUDED.agent_id,
  is_active = EXCLUDED.is_active,
  notes = EXCLUDED.notes;

-- -----------------------------------------------------------------------------
-- Ten demo lead contacts with realistic spread.
-- IDs use ddddddddd prefix so they're easy to find / clean up.
-- -----------------------------------------------------------------------------
INSERT INTO contacts (id, full_name, display_name, email, phone, preferred_language,
  preferred_communication_channel, country_of_residence, citizenship,
  acquisition_source, acquisition_source_detail)
VALUES
  ('dddddddd-0000-4000-8000-000000000001', 'Wei Wang',          'Wei',        'wei.wang@example.com',  '+86 138 0000 0001', 'en', 'whatsapp', 'CN', 'CN', 'meta_ads',  'Meta Ads — Eternal carousel'),
  ('dddddddd-0000-4000-8000-000000000002', 'Sophie Laurent',    'Sophie',     'sophie.l@example.com',  '+33 6 00 00 00 02', 'fr', 'email',    'FR', 'FR', 'website',   'arconique.com contact form'),
  ('dddddddd-0000-4000-8000-000000000003', 'Marcus Anderson',   'Marcus',     'marcus.a@example.com',  '+1 415 555 0103',   'en', 'email',    'US', 'US', 'agent',     'Referred by Dimitri'),
  ('dddddddd-0000-4000-8000-000000000004', 'Akari Tanaka',      'Akari',      'akari.t@example.com',   '+81 80 0000 0004',  'en', 'whatsapp', 'JP', 'JP', 'instagram', 'IG DM'),
  ('dddddddd-0000-4000-8000-000000000005', 'Pieter de Vries',   'Pieter',     'pieter.dv@example.com', '+31 6 0000 0005',   'en', 'email',    'NL', 'NL', 'referral',  'Referred by Eternal owner J. Mueller'),
  ('dddddddd-0000-4000-8000-000000000006', 'Sergey Ivanov',     'Sergey',     'sergey.i@example.com',  '+7 905 000 00 06',  'en', 'whatsapp', 'AE', 'RU', 'website',   'Specifically asked about Enso pooled model'),
  ('dddddddd-0000-4000-8000-000000000007', 'Aisha Khan',        'Aisha',      'aisha.k@example.com',   '+971 50 000 0007',  'en', 'phone',    'AE', 'PK', 'meta_ads',  'Meta Ads — Ahau carousel'),
  ('dddddddd-0000-4000-8000-000000000008', 'Lukas Müller',      'Lukas',      'lukas.m@example.com',   '+49 170 000 0008',  'en', 'email',    'DE', 'DE', 'website',   NULL),
  ('dddddddd-0000-4000-8000-000000000009', 'Priya Singh',       'Priya',      'priya.s@example.com',   '+65 8000 0009',     'en', 'whatsapp', 'SG', 'IN', 'agent',     'Referred by Dimitri'),
  ('dddddddd-0000-4000-8000-000000000010', 'Elena Rossi',       'Elena',      'elena.r@example.com',   '+39 333 000 0010',  'it', 'email',    'IT', 'IT', 'instagram', 'IG bio link → contact form')
ON CONFLICT (id) DO UPDATE SET
  full_name = EXCLUDED.full_name,
  email = EXCLUDED.email,
  phone = EXCLUDED.phone,
  preferred_language = EXCLUDED.preferred_language,
  preferred_communication_channel = EXCLUDED.preferred_communication_channel,
  country_of_residence = EXCLUDED.country_of_residence,
  citizenship = EXCLUDED.citizenship,
  acquisition_source = EXCLUDED.acquisition_source,
  acquisition_source_detail = EXCLUDED.acquisition_source_detail,
  updated_at = now();

-- -----------------------------------------------------------------------------
-- Lead roles — connect each contact to a project + status.
-- Status spread: 2 new, 2 contacted, 2 qualified, 1 viewing_scheduled,
--                1 negotiation, 1 reservation, 1 lost.
-- IDs use eeeeeeee prefix.
-- -----------------------------------------------------------------------------
INSERT INTO contact_roles (id, contact_id, role, scope, scope_project_id, status,
  started_at, source_id, agent_id, unit_type_interest_id, notes)
VALUES
  -- new
  ('eeeeeeee-0000-4000-8000-000000000001',
    'dddddddd-0000-4000-8000-000000000001', 'lead', 'project',
    '11111111-1111-4111-8111-111111111101', 'new',                '2026-04-28 09:00+00',
    'cccccccc-0000-4000-8000-000000000002', NULL,
    (SELECT id FROM unit_types WHERE name = 'Type Q' AND project_id = '11111111-1111-4111-8111-111111111101' LIMIT 1),
    NULL),
  ('eeeeeeee-0000-4000-8000-000000000002',
    'dddddddd-0000-4000-8000-000000000007', 'lead', 'project',
    '11111111-1111-4111-8111-111111111103', 'new',                '2026-04-29 14:20+00',
    'cccccccc-0000-4000-8000-000000000002', NULL, NULL, NULL),

  -- contacted
  ('eeeeeeee-0000-4000-8000-000000000003',
    'dddddddd-0000-4000-8000-000000000002', 'lead', 'project',
    '11111111-1111-4111-8111-111111111101', 'contacted',          '2026-04-22 10:00+00',
    'cccccccc-0000-4000-8000-000000000001', NULL,
    (SELECT id FROM unit_types WHERE name = 'Type L' AND project_id = '11111111-1111-4111-8111-111111111101' LIMIT 1),
    NULL),
  ('eeeeeeee-0000-4000-8000-000000000004',
    'dddddddd-0000-4000-8000-000000000004', 'lead', 'project',
    '11111111-1111-4111-8111-111111111102', 'contacted',          '2026-04-25 16:30+00',
    'cccccccc-0000-4000-8000-000000000004', NULL, NULL, NULL),

  -- qualified
  ('eeeeeeee-0000-4000-8000-000000000005',
    'dddddddd-0000-4000-8000-000000000003', 'lead', 'project',
    '11111111-1111-4111-8111-111111111101', 'qualified',          '2026-04-15 11:00+00',
    'cccccccc-0000-4000-8000-000000000003',
    'bbbbbbbb-0000-4000-8000-000000000001',
    (SELECT id FROM unit_types WHERE name = 'Type Q' AND project_id = '11111111-1111-4111-8111-111111111101' LIMIT 1),
    'Cash buyer, $1M+ budget, looking for ocean view.'),
  ('eeeeeeee-0000-4000-8000-000000000006',
    'dddddddd-0000-4000-8000-000000000005', 'lead', 'project',
    '11111111-1111-4111-8111-111111111101', 'qualified',          '2026-04-18 09:30+00',
    'cccccccc-0000-4000-8000-000000000005', NULL,
    (SELECT id FROM unit_types WHERE name = 'Type L' AND project_id = '11111111-1111-4111-8111-111111111101' LIMIT 1),
    'Existing-owner referral; warm.'),

  -- viewing_scheduled
  ('eeeeeeee-0000-4000-8000-000000000007',
    'dddddddd-0000-4000-8000-000000000006', 'lead', 'project',
    '11111111-1111-4111-8111-111111111102', 'viewing_scheduled',  '2026-04-10 15:45+00',
    'cccccccc-0000-4000-8000-000000000001', NULL,
    (SELECT id FROM unit_types WHERE name = 'Type V' AND project_id = '11111111-1111-4111-8111-111111111102' LIMIT 1),
    'Site visit booked 2026-05-12.'),

  -- negotiation
  ('eeeeeeee-0000-4000-8000-000000000008',
    'dddddddd-0000-4000-8000-000000000009', 'lead', 'project',
    '11111111-1111-4111-8111-111111111101', 'negotiation',        '2026-03-22 11:00+00',
    'cccccccc-0000-4000-8000-000000000003',
    'bbbbbbbb-0000-4000-8000-000000000001',
    (SELECT id FROM unit_types WHERE name = 'Type Q' AND project_id = '11111111-1111-4111-8111-111111111101' LIMIT 1),
    'Pricing discussion on EV-08; awaiting offer.'),

  -- reservation
  ('eeeeeeee-0000-4000-8000-000000000009',
    'dddddddd-0000-4000-8000-000000000008', 'lead', 'project',
    '11111111-1111-4111-8111-111111111102', 'reservation',        '2026-03-12 09:00+00',
    'cccccccc-0000-4000-8000-000000000001', NULL,
    (SELECT id FROM unit_types WHERE name = 'Type V' AND project_id = '11111111-1111-4111-8111-111111111102' LIMIT 1),
    'Holding reservation on ES-05; 7-day option.'),

  -- lost
  ('eeeeeeee-0000-4000-8000-000000000010',
    'dddddddd-0000-4000-8000-000000000010', 'lead', 'project',
    '11111111-1111-4111-8111-111111111103', 'lost',               '2026-03-01 13:00+00',
    'cccccccc-0000-4000-8000-000000000004', NULL, NULL,
    'Decided on a competitor in Uluwatu.')
ON CONFLICT (id) DO UPDATE SET
  status = EXCLUDED.status,
  scope_project_id = EXCLUDED.scope_project_id,
  source_id = EXCLUDED.source_id,
  agent_id = EXCLUDED.agent_id,
  unit_type_interest_id = EXCLUDED.unit_type_interest_id,
  notes = EXCLUDED.notes,
  updated_at = now();

-- For the lost lead, mark ended_at + end_reason.
UPDATE contact_roles
SET ended_at = '2026-04-08 17:00+00', end_reason = 'lost'
WHERE id = 'eeeeeeee-0000-4000-8000-000000000010'
  AND ended_at IS NULL;

-- -----------------------------------------------------------------------------
-- Initial inbound interactions per lead — short and realistic.
-- IDs use ffffffff prefix.
-- -----------------------------------------------------------------------------
INSERT INTO contact_interactions (id, contact_id, project_id, interaction_type, direction,
  occurred_at, subject, body, related_role_id, review_status)
VALUES
  ('ffffffff-0000-4000-8000-000000000001',
    'dddddddd-0000-4000-8000-000000000001', '11111111-1111-4111-8111-111111111101',
    'whatsapp_message', 'inbound', '2026-04-28 09:00+00',
    'Inquiry — Eternal Type Q',
    'Hi, saw the Eternal carousel on Meta. Interested in a 4BR with ocean view. What''s available?',
    'eeeeeeee-0000-4000-8000-000000000001', 'not_required'),

  ('ffffffff-0000-4000-8000-000000000003',
    'dddddddd-0000-4000-8000-000000000002', '11111111-1111-4111-8111-111111111101',
    'email_in', 'inbound', '2026-04-22 10:00+00',
    'Eternal Villas — pricing & availability',
    'Bonjour, I would like more details on Eternal Villas. Specifically Type L pricing, payment plan options, and availability for 2026 handover.',
    'eeeeeeee-0000-4000-8000-000000000003', 'not_required'),

  ('ffffffff-0000-4000-8000-000000000005',
    'dddddddd-0000-4000-8000-000000000003', '11111111-1111-4111-8111-111111111101',
    'note', 'internal_note', '2026-04-15 11:00+00',
    'Qualified lead from Dimitri',
    'Cash buyer relocating from Bay Area, $1M+ budget, ocean view priority. Wants to view May.',
    'eeeeeeee-0000-4000-8000-000000000005', 'not_required'),

  ('ffffffff-0000-4000-8000-000000000007',
    'dddddddd-0000-4000-8000-000000000006', '11111111-1111-4111-8111-111111111102',
    'site_meeting', 'outbound', '2026-04-10 15:45+00',
    'Site visit confirmed',
    'Confirmed site visit at Enso 2026-05-12, 11am. Sergey to fly in from Dubai.',
    'eeeeeeee-0000-4000-8000-000000000007', 'not_required'),

  ('ffffffff-0000-4000-8000-000000000008',
    'dddddddd-0000-4000-8000-000000000009', '11111111-1111-4111-8111-111111111101',
    'zoom_meeting', 'outbound', '2026-04-02 14:00+00',
    'Pricing call · EV-08',
    '60-min call on EV-08 with buyer & spouse. Discussed payment milestones, escalation rule, handover SLAs.',
    'eeeeeeee-0000-4000-8000-000000000008', 'not_required'),

  ('ffffffff-0000-4000-8000-000000000009',
    'dddddddd-0000-4000-8000-000000000008', '11111111-1111-4111-8111-111111111102',
    'email_out', 'outbound', '2026-03-12 09:00+00',
    'Reservation confirmed — ES-05',
    'Lukas, confirming reservation hold on ES-05 with 7-day option. Reservation deposit refundable until 2026-03-19.',
    'eeeeeeee-0000-4000-8000-000000000009', 'not_required'),

  ('ffffffff-0000-4000-8000-000000000010',
    'dddddddd-0000-4000-8000-000000000010', '11111111-1111-4111-8111-111111111103',
    'note', 'internal_note', '2026-04-08 17:00+00',
    'Lost — competitor',
    'Lead chose a competitor in Uluwatu. Closed file. Send seasonal touchpoint in Q4.',
    'eeeeeeee-0000-4000-8000-000000000010', 'not_required')
ON CONFLICT (id) DO UPDATE SET
  body = EXCLUDED.body,
  subject = EXCLUDED.subject,
  updated_at = now();
