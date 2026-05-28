-- =============================================================================
-- Development OS · Stage 2.2.B demo seed
--
-- - 12 sales / contracts / invoices / discounts / notifications permission keys
-- - 4 new roles (sales_manager, contracts_manager, director, ceo)
-- - 3 default discount-authorization tiers (5% / 15% / unlimited)
-- - 1 contract template ("Off-plan three-part standard") with 3 components
-- - 1 sales scheme ("Scheme 1: 30/40/25/5") with 4 milestones
-- - 1 late-fee rule per project (0.05% per day, 30-day grace, capped at $5k)
-- - 4 notification templates (EN/RU/ID variants for milestone-due + overdue)
-- - 1 sample notification rule (milestone_invoice_due → buyer email · EN)
--
-- Apply order:
--   drizzle/seed.sql
--   drizzle/seed/development-stage-2-1.sql
--   drizzle/seed/development-stage-2-2-a.sql
--   drizzle/seed/development-stage-2-2-b.sql
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Permission keys (idempotent insert)
-- -----------------------------------------------------------------------------
INSERT INTO permissions (key, name, description) VALUES
  ('dev_os_sales_view',          'Dev OS · Sales · view',           'Read leads, pipeline, interactions for assigned projects.'),
  ('dev_os_sales_manage',        'Dev OS · Sales · manage',         'Create / update leads, log interactions, approve AI drafts.'),
  ('dev_os_sales_admin',         'Dev OS · Sales · admin',          'Full control over sales pipeline, agents, sources.'),
  ('dev_os_contracts_view',      'Dev OS · Contracts · view',       'Read contracts, groups, milestones.'),
  ('dev_os_contracts_manage',    'Dev OS · Contracts · manage',     'Create / sign / cancel contracts and groups.'),
  ('dev_os_invoices_view',       'Dev OS · Invoices · view',        'Read invoices and PDF artifacts.'),
  ('dev_os_invoices_send',       'Dev OS · Invoices · send',        'Send invoices to buyers via email.'),
  ('dev_os_discounts_view',      'Dev OS · Discounts · view',       'Read all discount proposals and approvals.'),
  ('dev_os_discounts_authorize_low',       'Dev OS · Discounts · low tier',  'Authorize discounts up to 5%.'),
  ('dev_os_discounts_authorize_high',      'Dev OS · Discounts · high tier', 'Authorize discounts up to 15%.'),
  ('dev_os_discounts_authorize_unlimited', 'Dev OS · Discounts · unlimited', 'Authorize discounts of any size.'),
  ('dev_os_notifications_admin', 'Dev OS · Notifications · admin',  'Manage notification rules and templates.')
ON CONFLICT (key) DO UPDATE SET
  name = EXCLUDED.name,
  description = EXCLUDED.description;

-- -----------------------------------------------------------------------------
-- Roles for the discount tiers (idempotent)
-- -----------------------------------------------------------------------------
INSERT INTO roles (key, name, description, is_system) VALUES
  ('dev_os_sales_manager',    'Dev OS · Sales Manager',     'Front-line sales authority — manages leads, pipeline, low-tier discounts.', true),
  ('dev_os_contracts_manager','Dev OS · Contracts Manager', 'Owns contract lifecycle from signing to payment.',                            true),
  ('dev_os_director',         'Dev OS · Director',          'Mid-tier authority for high-value discounts and contract overrides.',         true),
  ('dev_os_ceo',              'Dev OS · CEO',               'Unlimited discount authority and emergency override.',                        true)
ON CONFLICT (key) DO UPDATE SET
  name = EXCLUDED.name,
  description = EXCLUDED.description;

-- -----------------------------------------------------------------------------
-- Discount authorization tiers
-- -----------------------------------------------------------------------------
INSERT INTO discount_authorizations (
  role_key, max_percent_value, max_absolute_usd_minor,
  requires_escalation_above_percent, escalate_to_role_key, notes, is_active
) VALUES
  ('dev_os_sales_manager', 5,    NULL, 5,    'dev_os_director', 'Sales Manager · up to 5%', true),
  ('dev_os_director',      15,   NULL, 15,   'dev_os_ceo',      'Director · up to 15%',     true),
  ('dev_os_ceo',           NULL, NULL, NULL, NULL,              'CEO · unlimited',          true),
  ('dev_os_admin',         NULL, NULL, NULL, NULL,              'Admin · unlimited',        true)
ON CONFLICT (role_key) DO UPDATE SET
  max_percent_value = EXCLUDED.max_percent_value,
  requires_escalation_above_percent = EXCLUDED.requires_escalation_above_percent,
  escalate_to_role_key = EXCLUDED.escalate_to_role_key,
  notes = EXCLUDED.notes,
  is_active = EXCLUDED.is_active,
  updated_at = now();

-- -----------------------------------------------------------------------------
-- Contract template: Off-plan three-part standard (deterministic UUIDs)
-- -----------------------------------------------------------------------------
INSERT INTO contract_templates (id, name, description, applicable_to, is_active) VALUES
  ('aaaaaaaa-2200-4b00-8000-000000000001',
    'Off-plan three-part standard',
    'Standard Indonesian off-plan structure: leasehold + construction management + service fee.',
    'off_plan',
    true)
ON CONFLICT (name) DO UPDATE SET
  description = EXCLUDED.description,
  applicable_to = EXCLUDED.applicable_to,
  is_active = EXCLUDED.is_active,
  updated_at = now();

-- The template's three components (run a clean replace).
DELETE FROM contract_template_components
  WHERE template_id = 'aaaaaaaa-2200-4b00-8000-000000000001';

INSERT INTO contract_template_components (
  template_id, sequence, component_type, component_name,
  default_amount_formula, default_percent_value,
  default_tax_rate, default_tax_bearer, default_split_percent, description
) VALUES
  ('aaaaaaaa-2200-4b00-8000-000000000001', 1, 'leasehold_agreement', 'Leasehold agreement',
    'percent_of_total', 10.0, 10.0, 'buyer', NULL,
    'Land rights for the lease tenure.'),
  ('aaaaaaaa-2200-4b00-8000-000000000001', 2, 'construction_management', 'Construction management',
    'percent_of_total', 60.0, 11.0, 'seller', NULL,
    'Construction execution including PPN seller-borne.'),
  ('aaaaaaaa-2200-4b00-8000-000000000001', 3, 'service_fee', 'Service fee',
    'computed_remainder', NULL, 10.0, 'split', 50.0,
    'Pre-handover concierge / activation service. Remainder of total.');

-- Completed-villa template (single component) for completed-leasehold deals.
INSERT INTO contract_templates (id, name, description, applicable_to, is_active) VALUES
  ('aaaaaaaa-2200-4b00-8000-000000000002',
    'Completed leasehold standard',
    'Single-document leasehold transfer for completed villas.',
    'completed_villa',
    true)
ON CONFLICT (name) DO UPDATE SET
  applicable_to = EXCLUDED.applicable_to,
  updated_at = now();

DELETE FROM contract_template_components
  WHERE template_id = 'aaaaaaaa-2200-4b00-8000-000000000002';
INSERT INTO contract_template_components (
  template_id, sequence, component_type, component_name,
  default_amount_formula, default_percent_value,
  default_tax_rate, default_tax_bearer, description
) VALUES
  ('aaaaaaaa-2200-4b00-8000-000000000002', 1, 'completed_leasehold', 'Completed leasehold',
    'percent_of_total', 100.0, 10.0, 'buyer',
    'Single-component transfer of leasehold rights at handover.');

-- -----------------------------------------------------------------------------
-- Sales scheme: "Scheme 1: 30/40/25/5"
-- -----------------------------------------------------------------------------
INSERT INTO sales_schemes (id, project_id, name, description, is_active, is_locked) VALUES
  ('bbbbbbbb-2200-4b00-8000-000000000001',
    NULL, -- global
    'Scheme 1 · 30/40/25/5',
    '30% on signing · 40% at 60% construction · 25% pre-handover · 5% on handover.',
    true, false)
ON CONFLICT (id) DO UPDATE SET
  description = EXCLUDED.description,
  is_active = EXCLUDED.is_active,
  updated_at = now();

DELETE FROM sales_scheme_milestones
  WHERE sales_scheme_id = 'bbbbbbbb-2200-4b00-8000-000000000001';
INSERT INTO sales_scheme_milestones (
  sales_scheme_id, sequence, name, trigger_type, trigger_value,
  collection_percent, pre_invoice_days_before_trigger, due_days_after_invoice,
  is_final_payment, description
) VALUES
  ('bbbbbbbb-2200-4b00-8000-000000000001', 1, 'On signing',         'on_signing',                  NULL, 30.0, 7, 14, false, 'Down payment on contract sign.'),
  ('bbbbbbbb-2200-4b00-8000-000000000001', 2, '60% construction',   'construction_progress_pct',   60,   40.0, 7, 14, false, 'Mid-construction milestone.'),
  ('bbbbbbbb-2200-4b00-8000-000000000001', 3, 'Pre-handover',       'days_after_signing',          365,  25.0, 7, 14, false, 'Settled before keys exchange.'),
  ('bbbbbbbb-2200-4b00-8000-000000000001', 4, 'On handover',        'on_handover',                 NULL, 5.0,  7, 7,  true,  'Final balance + handover.');

-- -----------------------------------------------------------------------------
-- Late-fee rule per project (0.05% per day, 30-day grace, capped at $5k).
-- -----------------------------------------------------------------------------
INSERT INTO late_fee_rules (project_id, grace_period_days, fee_type, fee_value, fee_currency, max_fee_usd_minor, is_active, notes)
SELECT
  p.id,
  30,
  'percent_per_day',
  0.05,
  'USD',
  500000,  -- $5,000 in minor
  true,
  'Default Stage 2.2.B late-fee policy.'
FROM projects p
WHERE NOT EXISTS (
  SELECT 1 FROM late_fee_rules r WHERE r.project_id = p.id
);

-- -----------------------------------------------------------------------------
-- Notification templates (English defaults; RU/ID variants kept here for reuse)
-- -----------------------------------------------------------------------------
INSERT INTO dev_notification_templates (
  template_name, subject, body_html, body_text, language, description
) VALUES
  ('milestone_invoice_due_en',
    'Invoice due on {{dueDate}} — {{invoiceNumber}}',
    '<p>Dear {{buyerName}},</p><p>This is a friendly reminder that invoice <strong>{{invoiceNumber}}</strong> for {{milestoneName}} is due on <strong>{{dueDate}}</strong>.</p><p>Amount: <strong>{{amountUSD}} USD</strong> ({{amountIDR}} IDR).</p><p>Project: {{projectName}} · Unit {{unitCode}}.</p><p>Bank details and payment instructions are attached.</p><p>Warm regards,<br/>Arconique</p>',
    'Dear {{buyerName}}, this is a friendly reminder that invoice {{invoiceNumber}} for {{milestoneName}} is due on {{dueDate}}. Amount: {{amountUSD}} USD ({{amountIDR}} IDR). Project: {{projectName}} · Unit {{unitCode}}.',
    'en',
    'Standard invoice-due reminder, English.'),
  ('milestone_overdue_en',
    'Action required: invoice {{invoiceNumber}} is overdue',
    '<p>Dear {{buyerName}},</p><p>Invoice <strong>{{invoiceNumber}}</strong> for {{milestoneName}} was due on {{dueDate}} and is now {{daysOverdue}} days past due.</p><p>Late fees of {{lateFeeUSD}} USD have accrued.</p><p>Please contact us if you need to discuss payment timing.</p><p>Warm regards,<br/>Arconique</p>',
    'Dear {{buyerName}}, invoice {{invoiceNumber}} for {{milestoneName}} was due on {{dueDate}} and is now {{daysOverdue}} days past due. Late fees of {{lateFeeUSD}} USD have accrued. Please contact us if you need to discuss payment timing.',
    'en',
    'Overdue payment reminder, English.'),
  ('contract_pending_signature_en',
    'Your contract is ready for signature — {{projectName}}',
    '<p>Dear {{buyerName}},</p><p>Your contract for unit {{unitCode}} at {{projectName}} is ready for signature.</p><p>Total contract value: <strong>{{totalUSD}} USD</strong>.</p><p>The contract pack contains three documents — leasehold agreement, construction management, and service fee — please sign each.</p>',
    'Dear {{buyerName}}, your contract for unit {{unitCode}} at {{projectName}} is ready for signature. Total contract value: {{totalUSD}} USD. The contract pack contains three documents — leasehold agreement, construction management, and service fee — please sign each.',
    'en',
    'Contract ready for signature, English.'),
  ('reservation_expiring_en',
    'Your reservation for {{unitCode}} expires soon',
    '<p>Dear {{buyerName}},</p><p>Your reservation for unit {{unitCode}} at {{projectName}} expires on {{expiresAt}}.</p><p>Please complete the reservation deposit or contact us to extend.</p>',
    'Dear {{buyerName}}, your reservation for unit {{unitCode}} at {{projectName}} expires on {{expiresAt}}. Please complete the reservation deposit or contact us to extend.',
    'en',
    'Reservation expiry reminder, English.')
ON CONFLICT (template_name) DO UPDATE SET
  subject = EXCLUDED.subject,
  body_html = EXCLUDED.body_html,
  body_text = EXCLUDED.body_text,
  language = EXCLUDED.language,
  description = EXCLUDED.description,
  updated_at = now();

-- -----------------------------------------------------------------------------
-- Sample notification rule: invoice_due → buyer · email · EN.
-- -----------------------------------------------------------------------------
INSERT INTO dev_notification_rules (
  rule_name, description, trigger_event, trigger_offset_days,
  recipient_type, channel, template_name, is_active
) VALUES
  ('Default · invoice due reminder',
    'Sends an English reminder to the buyer the day the invoice is due.',
    'milestone_invoice_due', 0,
    'buyer', 'email', 'milestone_invoice_due_en', true),
  ('Default · overdue alert',
    'Sends an overdue alert to the buyer the day a payment becomes overdue.',
    'milestone_overdue', 0,
    'buyer', 'email', 'milestone_overdue_en', true),
  ('Default · reservation expiring',
    'Reminds the buyer 3 days before their reservation expires.',
    'reservation_expiring', -3,
    'buyer', 'email', 'reservation_expiring_en', true)
ON CONFLICT DO NOTHING;

-- -----------------------------------------------------------------------------
-- Pricing rules — one per demo project. Manual mode for Ahau (still permitting).
-- -----------------------------------------------------------------------------
INSERT INTO pricing_rules (project_id, rule_type, base_price_usd_minor,
  escalation_percent, escalation_frequency, escalation_start_trigger,
  escalation_start_value, ceiling_price_usd_minor, is_active, notes)
VALUES
  ('1eda0001-0000-0000-0000-000000000001', 'time_based',
    78000000, 1.5000, 'monthly', 'sales_start', '2025-03-15', 110000000, true,
    'Eternal Villas — 1.5%/month from sales start, capped at $1.1M.'),
  ('1eda0001-0000-0000-0000-000000000002', 'progress_based',
    88000000, 2.0000, 'per_10_progress_pct', 'construction_start',
    '2025-09-22', 130000000, true,
    'Enso Villas — +2% per 10% construction progress.'),
  ('1eda0001-0000-0000-0000-000000000003', 'manual',
    52000000, 0.0000, NULL, 'sales_start', NULL, 70000000, true,
    'Ahau Gardens — manual snapshots only until permits clear.')
ON CONFLICT (project_id) DO UPDATE SET
  rule_type = EXCLUDED.rule_type,
  base_price_usd_minor = EXCLUDED.base_price_usd_minor,
  escalation_percent = EXCLUDED.escalation_percent,
  escalation_frequency = EXCLUDED.escalation_frequency,
  escalation_start_trigger = EXCLUDED.escalation_start_trigger,
  escalation_start_value = EXCLUDED.escalation_start_value,
  ceiling_price_usd_minor = EXCLUDED.ceiling_price_usd_minor,
  notes = EXCLUDED.notes,
  updated_at = now();
