-- =============================================================================
-- 0036 — Development OS · Stage 2.2.B
--   Pricing rules + price snapshots, reservations, hierarchical contracts
--   (groups + child contracts), sales schemes + milestones, contract milestones,
--   invoices, late fee rules + accruals, discount authorizations + per-buyer
--   discounts, notification rules + templates + delivery log.
--
-- 18 new tables. All money in BIGINT minor units of an explicit currency,
-- mirroring the existing finance ledger pattern. Every table ENABLE+FORCE
-- RLS with internal_read/internal_write policies via public.is_internal_user().
--
-- Idempotent: every CREATE uses IF NOT EXISTS, every constraint wrapped in
-- DO $$ ... EXCEPTION WHEN duplicate_object. Wrapped in BEGIN; ... COMMIT;.
--
-- See docs/development-os-architecture.md for the full schema contract and
-- the architectural decisions behind these tables.
-- =============================================================================

BEGIN;

-- -----------------------------------------------------------------------------
-- 1) pricing_rules — one rule per project
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS "pricing_rules" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "project_id" uuid NOT NULL UNIQUE REFERENCES "projects"("id") ON DELETE CASCADE,
  "rule_type" text NOT NULL DEFAULT 'manual',
  "base_price_usd_minor" bigint NOT NULL,
  "escalation_percent" numeric(8, 4) NOT NULL DEFAULT 0,
  "escalation_frequency" text,
  "escalation_start_trigger" text NOT NULL DEFAULT 'sales_start',
  "escalation_start_value" date,
  "ceiling_price_usd_minor" bigint,
  "is_active" boolean NOT NULL DEFAULT true,
  "notes" text,
  "created_by" uuid REFERENCES "app_users"("id") ON DELETE SET NULL,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now()
);

DO $$ BEGIN
  ALTER TABLE "pricing_rules"
    ADD CONSTRAINT pricing_rules_rule_type_check
    CHECK ("rule_type" IN ('time_based','progress_based','manual'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "pricing_rules"
    ADD CONSTRAINT pricing_rules_escalation_frequency_check
    CHECK ("escalation_frequency" IS NULL OR "escalation_frequency" IN
      ('monthly','per_5_progress_pct','per_10_progress_pct','per_milestone'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "pricing_rules"
    ADD CONSTRAINT pricing_rules_start_trigger_check
    CHECK ("escalation_start_trigger" IN ('sales_start','construction_start','fixed_date'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- -----------------------------------------------------------------------------
-- 2) unit_price_snapshots
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS "unit_price_snapshots" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "villa_id" uuid NOT NULL REFERENCES "villas"("id") ON DELETE CASCADE,
  "snapshot_date" timestamptz NOT NULL DEFAULT now(),
  "price_usd_minor" bigint NOT NULL,
  "price_idr_minor" bigint NOT NULL,
  "fx_rate_usd_to_idr" numeric(18, 9) NOT NULL,
  "price_basis" text NOT NULL,
  "triggered_by" text NOT NULL,
  "triggered_by_id" uuid,
  "change_amount_usd_minor" bigint,
  "change_percent" numeric(8, 4),
  "notes" text,
  "created_at" timestamptz NOT NULL DEFAULT now()
);

DO $$ BEGIN
  ALTER TABLE "unit_price_snapshots"
    ADD CONSTRAINT unit_price_snapshots_basis_check
    CHECK ("price_basis" IN
      ('rule_calculated','manual_override','contract_locked','discount_applied'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "unit_price_snapshots"
    ADD CONSTRAINT unit_price_snapshots_trigger_check
    CHECK ("triggered_by" IN
      ('progress_change','time_elapsed','manual','contract_signed','discount_authorized'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE INDEX IF NOT EXISTS "unit_price_snapshots_villa_date_idx"
  ON "unit_price_snapshots" ("villa_id", "snapshot_date" DESC);

-- -----------------------------------------------------------------------------
-- 3) reservations
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS "reservations" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "contact_id" uuid NOT NULL REFERENCES "contacts"("id") ON DELETE RESTRICT,
  "villa_id" uuid NOT NULL REFERENCES "villas"("id") ON DELETE RESTRICT,
  "project_id" uuid NOT NULL REFERENCES "projects"("id") ON DELETE RESTRICT,
  "contact_role_id" uuid REFERENCES "contact_roles"("id") ON DELETE SET NULL,
  "reservation_fee_usd_minor" bigint NOT NULL,
  "reservation_fee_idr_minor" bigint NOT NULL,
  "fx_rate_at_reservation" numeric(18, 9) NOT NULL,
  "payment_method" text NOT NULL,
  "payment_reference" text,
  "paid_at" timestamptz,
  "status" text NOT NULL DEFAULT 'pending_payment',
  "expires_at" timestamptz,
  "price_locked_usd_minor" bigint NOT NULL,
  "price_locked_snapshot_id" uuid REFERENCES "unit_price_snapshots"("id") ON DELETE SET NULL,
  "notes" text,
  "created_by" uuid REFERENCES "app_users"("id") ON DELETE SET NULL,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now(),
  "cancelled_at" timestamptz,
  "cancelled_reason" text,
  "refunded_amount_usd_minor" bigint,
  "refunded_at" timestamptz
);

DO $$ BEGIN
  ALTER TABLE "reservations"
    ADD CONSTRAINT reservations_payment_method_check
    CHECK ("payment_method" IN ('bank_transfer','crypto_usdt','crypto_other','cash','card'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "reservations"
    ADD CONSTRAINT reservations_status_check
    CHECK ("status" IN
      ('pending_payment','active','expired','converted_to_contract','cancelled','refunded'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE INDEX IF NOT EXISTS "reservations_villa_status_idx"
  ON "reservations" ("villa_id", "status");
CREATE INDEX IF NOT EXISTS "reservations_contact_idx"
  ON "reservations" ("contact_id");
CREATE INDEX IF NOT EXISTS "reservations_project_status_idx"
  ON "reservations" ("project_id", "status");

-- Only one active reservation per villa.
CREATE UNIQUE INDEX IF NOT EXISTS "reservations_villa_active_unique"
  ON "reservations" ("villa_id")
  WHERE "status" IN ('pending_payment', 'active');

-- -----------------------------------------------------------------------------
-- 4) contract_templates
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS "contract_templates" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "name" text NOT NULL UNIQUE,
  "description" text,
  "applicable_to" text NOT NULL DEFAULT 'both',
  "is_active" boolean NOT NULL DEFAULT true,
  "created_by" uuid REFERENCES "app_users"("id") ON DELETE SET NULL,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now()
);

DO $$ BEGIN
  ALTER TABLE "contract_templates"
    ADD CONSTRAINT contract_templates_applicable_to_check
    CHECK ("applicable_to" IN ('off_plan','completed_villa','both'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- -----------------------------------------------------------------------------
-- 5) contract_template_components
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS "contract_template_components" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "template_id" uuid NOT NULL REFERENCES "contract_templates"("id") ON DELETE CASCADE,
  "sequence" integer NOT NULL,
  "component_type" text NOT NULL,
  "component_name" text NOT NULL,
  "default_amount_formula" text NOT NULL,
  "default_percent_value" numeric(8, 4),
  "default_flat_amount_usd_minor" bigint,
  "default_tax_rate" numeric(6, 3) NOT NULL DEFAULT 0,
  "default_tax_bearer" text NOT NULL DEFAULT 'buyer',
  "default_split_percent" numeric(6, 3),
  "description" text
);

DO $$ BEGIN
  ALTER TABLE "contract_template_components"
    ADD CONSTRAINT ctc_component_type_check
    CHECK ("component_type" IN
      ('leasehold_agreement','construction_management','service_fee','completed_leasehold','vat'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "contract_template_components"
    ADD CONSTRAINT ctc_amount_formula_check
    CHECK ("default_amount_formula" IN ('percent_of_total','flat_amount','computed_remainder'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "contract_template_components"
    ADD CONSTRAINT ctc_tax_bearer_check
    CHECK ("default_tax_bearer" IN ('buyer','seller','split'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE INDEX IF NOT EXISTS "ctc_template_seq_idx"
  ON "contract_template_components" ("template_id", "sequence");

-- -----------------------------------------------------------------------------
-- 6) sales_schemes (template payment cadences)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS "sales_schemes" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "project_id" uuid REFERENCES "projects"("id") ON DELETE CASCADE,
  "name" text NOT NULL,
  "description" text,
  "is_active" boolean NOT NULL DEFAULT true,
  "is_locked" boolean NOT NULL DEFAULT false,
  "created_by" uuid REFERENCES "app_users"("id") ON DELETE SET NULL,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "sales_schemes_project_idx" ON "sales_schemes" ("project_id");

-- -----------------------------------------------------------------------------
-- 7) sales_scheme_milestones
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS "sales_scheme_milestones" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "sales_scheme_id" uuid NOT NULL REFERENCES "sales_schemes"("id") ON DELETE CASCADE,
  "sequence" integer NOT NULL,
  "name" text NOT NULL,
  "trigger_type" text NOT NULL,
  "trigger_value" numeric(10, 4),
  "collection_percent" numeric(8, 4) NOT NULL,
  "pre_invoice_days_before_trigger" integer NOT NULL DEFAULT 7,
  "due_days_after_invoice" integer NOT NULL DEFAULT 14,
  "is_final_payment" boolean NOT NULL DEFAULT false,
  "description" text
);

DO $$ BEGIN
  ALTER TABLE "sales_scheme_milestones"
    ADD CONSTRAINT ssm_trigger_type_check
    CHECK ("trigger_type" IN
      ('on_signing','construction_progress_pct','days_after_previous',
       'days_after_signing','fixed_date_offset','on_handover','days_after_handover'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE INDEX IF NOT EXISTS "ssm_scheme_seq_idx"
  ON "sales_scheme_milestones" ("sales_scheme_id", "sequence");

-- -----------------------------------------------------------------------------
-- 8) contract_groups (parent of N child contracts)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS "contract_groups" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "contact_id" uuid NOT NULL REFERENCES "contacts"("id") ON DELETE RESTRICT,
  "villa_id" uuid NOT NULL REFERENCES "villas"("id") ON DELETE RESTRICT,
  "project_id" uuid NOT NULL REFERENCES "projects"("id") ON DELETE RESTRICT,
  "template_id" uuid NOT NULL REFERENCES "contract_templates"("id") ON DELETE RESTRICT,
  "reservation_id" uuid REFERENCES "reservations"("id") ON DELETE SET NULL,
  "group_type" text NOT NULL,
  "total_contract_value_usd_minor" bigint NOT NULL,
  "total_contract_value_idr_minor" bigint NOT NULL,
  "fx_rate_at_signing" numeric(18, 9) NOT NULL,
  "sales_scheme_id" uuid REFERENCES "sales_schemes"("id") ON DELETE SET NULL,
  "status" text NOT NULL DEFAULT 'draft',
  "discount_applied_id" uuid,
  "market_price_at_signing_usd_minor" bigint NOT NULL,
  "price_snapshot_id" uuid REFERENCES "unit_price_snapshots"("id") ON DELETE SET NULL,
  "contract_date" date NOT NULL,
  "first_signed_at" timestamptz,
  "fully_signed_at" timestamptz,
  "completed_at" timestamptz,
  "cancelled_at" timestamptz,
  "cancelled_reason" text,
  "notes" text,
  "created_by" uuid REFERENCES "app_users"("id") ON DELETE SET NULL,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now()
);

DO $$ BEGIN
  ALTER TABLE "contract_groups"
    ADD CONSTRAINT contract_groups_group_type_check
    CHECK ("group_type" IN ('off_plan_three_part','completed_leasehold'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "contract_groups"
    ADD CONSTRAINT contract_groups_status_check
    CHECK ("status" IN
      ('draft','pending_signature','partial_signed','fully_signed','in_payment',
       'completed','cancelled','breached'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE INDEX IF NOT EXISTS "contract_groups_villa_idx" ON "contract_groups" ("villa_id");
CREATE INDEX IF NOT EXISTS "contract_groups_contact_idx" ON "contract_groups" ("contact_id");
CREATE INDEX IF NOT EXISTS "contract_groups_project_status_idx"
  ON "contract_groups" ("project_id", "status");
CREATE INDEX IF NOT EXISTS "contract_groups_reservation_idx"
  ON "contract_groups" ("reservation_id");

-- -----------------------------------------------------------------------------
-- 9) contracts (individual child documents)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS "contracts" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "contract_group_id" uuid NOT NULL REFERENCES "contract_groups"("id") ON DELETE CASCADE,
  "sequence" integer NOT NULL,
  "component_type" text NOT NULL,
  "component_name" text NOT NULL,
  "amount_usd_minor" bigint NOT NULL,
  "amount_idr_minor" bigint NOT NULL,
  "fx_rate" numeric(18, 9) NOT NULL,
  "tax_rate" numeric(6, 3) NOT NULL DEFAULT 0,
  "tax_bearer" text NOT NULL DEFAULT 'buyer',
  "tax_amount_usd_minor" bigint NOT NULL DEFAULT 0,
  "net_received_by_seller_usd_minor" bigint NOT NULL,
  "status" text NOT NULL DEFAULT 'draft',
  "signed_at" timestamptz,
  "signed_document_id" uuid REFERENCES "documents"("id") ON DELETE SET NULL,
  "generated_draft_document_id" uuid REFERENCES "documents"("id") ON DELETE SET NULL,
  "notes" text,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now()
);

DO $$ BEGIN
  ALTER TABLE "contracts"
    ADD CONSTRAINT contracts_component_type_check
    CHECK ("component_type" IN
      ('leasehold_agreement','construction_management','service_fee','completed_leasehold','vat'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "contracts"
    ADD CONSTRAINT contracts_status_check
    CHECK ("status" IN ('draft','pending_signature','signed','cancelled'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "contracts"
    ADD CONSTRAINT contracts_tax_bearer_check
    CHECK ("tax_bearer" IN ('buyer','seller','split'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE INDEX IF NOT EXISTS "contracts_group_seq_idx"
  ON "contracts" ("contract_group_id", "sequence");

-- -----------------------------------------------------------------------------
-- 10) contract_milestones
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS "contract_milestones" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "contract_group_id" uuid NOT NULL REFERENCES "contract_groups"("id") ON DELETE CASCADE,
  "source_milestone_id" uuid REFERENCES "sales_scheme_milestones"("id") ON DELETE SET NULL,
  "sequence" integer NOT NULL,
  "name" text NOT NULL,
  "trigger_type" text NOT NULL,
  "trigger_value" numeric(10, 4),
  "collection_percent" numeric(8, 4) NOT NULL,
  "expected_amount_usd_minor" bigint NOT NULL,
  "expected_amount_idr_minor" bigint NOT NULL,
  "fx_rate_expected" numeric(18, 9) NOT NULL,
  "expected_due_date" date,
  "pre_invoice_date" date,
  "status" text NOT NULL DEFAULT 'pending',
  "pre_invoiced_at" timestamptz,
  "invoiced_at" timestamptz,
  "paid_amount_usd_minor" bigint NOT NULL DEFAULT 0,
  "paid_at" timestamptz,
  "overdue_at" timestamptz,
  "late_fee_accrual_usd_minor" bigint NOT NULL DEFAULT 0,
  "notes" text,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now()
);

DO $$ BEGIN
  ALTER TABLE "contract_milestones"
    ADD CONSTRAINT contract_milestones_status_check
    CHECK ("status" IN
      ('pending','pre_invoiced','invoiced','partially_paid','paid','overdue','waived','cancelled'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE INDEX IF NOT EXISTS "contract_milestones_group_seq_idx"
  ON "contract_milestones" ("contract_group_id", "sequence");
CREATE INDEX IF NOT EXISTS "contract_milestones_status_due_idx"
  ON "contract_milestones" ("status", "expected_due_date");

-- -----------------------------------------------------------------------------
-- 11) invoices
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS "invoices" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "contract_milestone_id" uuid NOT NULL REFERENCES "contract_milestones"("id") ON DELETE CASCADE,
  "contract_group_id" uuid NOT NULL REFERENCES "contract_groups"("id") ON DELETE CASCADE,
  "contact_id" uuid NOT NULL REFERENCES "contacts"("id") ON DELETE RESTRICT,
  "invoice_number" text NOT NULL UNIQUE,
  "invoice_type" text NOT NULL,
  "issued_at" timestamptz NOT NULL DEFAULT now(),
  "due_date" date NOT NULL,
  "amount_usd_minor" bigint NOT NULL,
  "amount_idr_minor" bigint NOT NULL,
  "fx_rate" numeric(18, 9) NOT NULL,
  "currency" text NOT NULL DEFAULT 'USD',
  "language" text NOT NULL DEFAULT 'en',
  "document_id" uuid REFERENCES "documents"("id") ON DELETE SET NULL,
  "status" text NOT NULL DEFAULT 'draft',
  "sent_at" timestamptz,
  "sent_to" text,
  "sent_by" uuid REFERENCES "app_users"("id") ON DELETE SET NULL,
  "viewed_at" timestamptz,
  "paid_at" timestamptz,
  "voided_at" timestamptz,
  "voided_reason" text,
  "notes" text,
  "created_by" uuid REFERENCES "app_users"("id") ON DELETE SET NULL,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now()
);

DO $$ BEGIN
  ALTER TABLE "invoices"
    ADD CONSTRAINT invoices_type_check
    CHECK ("invoice_type" IN
      ('pre_invoice','standard_invoice','final_invoice','late_fee_invoice','credit_note'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "invoices"
    ADD CONSTRAINT invoices_status_check
    CHECK ("status" IN ('draft','sent','viewed','paid','overdue','void'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "invoices"
    ADD CONSTRAINT invoices_language_check
    CHECK ("language" IN ('en','ru','id'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE INDEX IF NOT EXISTS "invoices_milestone_idx" ON "invoices" ("contract_milestone_id");
CREATE INDEX IF NOT EXISTS "invoices_contact_status_idx" ON "invoices" ("contact_id", "status");

-- -----------------------------------------------------------------------------
-- 12) late_fee_rules
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS "late_fee_rules" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "project_id" uuid NOT NULL REFERENCES "projects"("id") ON DELETE CASCADE,
  "grace_period_days" integer NOT NULL DEFAULT 0,
  "fee_type" text NOT NULL,
  "fee_value" numeric(12, 4) NOT NULL,
  "fee_currency" text NOT NULL DEFAULT 'USD',
  "max_fee_usd_minor" bigint,
  "is_active" boolean NOT NULL DEFAULT true,
  "notes" text,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now()
);

DO $$ BEGIN
  ALTER TABLE "late_fee_rules"
    ADD CONSTRAINT late_fee_rules_fee_type_check
    CHECK ("fee_type" IN ('flat_fee','percent_per_day','percent_per_month','tiered'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE INDEX IF NOT EXISTS "late_fee_rules_project_idx" ON "late_fee_rules" ("project_id");

-- -----------------------------------------------------------------------------
-- 13) late_fee_accruals
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS "late_fee_accruals" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "contract_milestone_id" uuid NOT NULL REFERENCES "contract_milestones"("id") ON DELETE CASCADE,
  "rule_id" uuid NOT NULL REFERENCES "late_fee_rules"("id") ON DELETE RESTRICT,
  "accrued_at" timestamptz NOT NULL DEFAULT now(),
  "days_overdue" integer NOT NULL,
  "fee_amount_usd_minor" bigint NOT NULL,
  "fee_amount_idr_minor" bigint NOT NULL,
  "fx_rate" numeric(18, 9) NOT NULL,
  "status" text NOT NULL DEFAULT 'accrued',
  "notes" text,
  "created_at" timestamptz NOT NULL DEFAULT now()
);

DO $$ BEGIN
  ALTER TABLE "late_fee_accruals"
    ADD CONSTRAINT late_fee_accruals_status_check
    CHECK ("status" IN ('accrued','invoiced','paid','waived'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE INDEX IF NOT EXISTS "late_fee_accruals_milestone_at_idx"
  ON "late_fee_accruals" ("contract_milestone_id", "accrued_at" DESC);

-- One accrual per (milestone, day) — guards against double-billing.
-- Anchored to UTC: `date_trunc('day', timestamptz)` is NOT immutable (the
-- result depends on the session's timezone), so Postgres refuses to use
-- it in an index expression. Casting to UTC first is immutable and
-- preserves the per-day uniqueness semantics.
CREATE UNIQUE INDEX IF NOT EXISTS "late_fee_accruals_unique_per_day"
  ON "late_fee_accruals" (
    "contract_milestone_id",
    (date_trunc('day', "accrued_at" AT TIME ZONE 'UTC'))
  );

-- -----------------------------------------------------------------------------
-- 14) discount_authorizations
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS "discount_authorizations" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "role_key" text NOT NULL UNIQUE,
  "max_percent_value" numeric(8, 4),
  "max_absolute_usd_minor" bigint,
  "requires_escalation_above_percent" numeric(8, 4),
  "escalate_to_role_key" text,
  "notes" text,
  "is_active" boolean NOT NULL DEFAULT true,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now()
);

-- -----------------------------------------------------------------------------
-- 15) unit_discounts
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS "unit_discounts" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "villa_id" uuid NOT NULL REFERENCES "villas"("id") ON DELETE RESTRICT,
  "contact_id" uuid NOT NULL REFERENCES "contacts"("id") ON DELETE RESTRICT,
  "contract_group_id" uuid REFERENCES "contract_groups"("id") ON DELETE SET NULL,
  "discount_type" text NOT NULL,
  "discount_percent" numeric(8, 4),
  "discount_amount_usd_minor" bigint,
  "applied_to_original_price_usd_minor" bigint NOT NULL,
  "final_price_usd_minor" bigint NOT NULL,
  "reason" text NOT NULL,
  "reason_note" text,
  "proposed_by" uuid REFERENCES "app_users"("id") ON DELETE SET NULL,
  "proposed_at" timestamptz NOT NULL DEFAULT now(),
  "authorized_by" uuid REFERENCES "app_users"("id") ON DELETE SET NULL,
  "authorized_at" timestamptz,
  "status" text NOT NULL DEFAULT 'proposed',
  "escalation_required" boolean NOT NULL DEFAULT false,
  "escalated_to" uuid REFERENCES "app_users"("id") ON DELETE SET NULL,
  "escalated_at" timestamptz,
  "approved_by" uuid REFERENCES "app_users"("id") ON DELETE SET NULL,
  "approved_at" timestamptz,
  "rejected_reason" text,
  "applied_at" timestamptz,
  "notes" text,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now()
);

DO $$ BEGIN
  ALTER TABLE "unit_discounts"
    ADD CONSTRAINT unit_discounts_type_check
    CHECK ("discount_type" IN ('percent','fixed_amount'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "unit_discounts"
    ADD CONSTRAINT unit_discounts_reason_check
    CHECK ("reason" IN
      ('early_bird','family_friend','cash_payment','bulk','agent_negotiation',
       'returning_buyer','investor_relationship','other'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "unit_discounts"
    ADD CONSTRAINT unit_discounts_status_check
    CHECK ("status" IN ('proposed','pending_approval','approved','rejected','applied','reverted'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE INDEX IF NOT EXISTS "unit_discounts_villa_idx" ON "unit_discounts" ("villa_id");
CREATE INDEX IF NOT EXISTS "unit_discounts_contact_idx" ON "unit_discounts" ("contact_id");
CREATE INDEX IF NOT EXISTS "unit_discounts_status_idx" ON "unit_discounts" ("status");
CREATE INDEX IF NOT EXISTS "unit_discounts_contract_idx"
  ON "unit_discounts" ("contract_group_id");

-- Late binding: contract_groups.discount_applied_id → unit_discounts.id
DO $$ BEGIN
  ALTER TABLE "contract_groups"
    ADD CONSTRAINT contract_groups_discount_fk
    FOREIGN KEY ("discount_applied_id") REFERENCES "unit_discounts"("id")
    ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- -----------------------------------------------------------------------------
-- 16) notification_rules
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS "dev_notification_rules" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "rule_name" text NOT NULL,
  "description" text,
  "trigger_event" text NOT NULL,
  "trigger_offset_days" integer NOT NULL DEFAULT 0,
  "recipient_type" text NOT NULL,
  "recipient_role_key" text,
  "recipient_user_id" uuid REFERENCES "app_users"("id") ON DELETE SET NULL,
  "channel" text NOT NULL,
  "template_name" text NOT NULL,
  "is_active" boolean NOT NULL DEFAULT true,
  "created_by" uuid REFERENCES "app_users"("id") ON DELETE SET NULL,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now()
);

DO $$ BEGIN
  ALTER TABLE "dev_notification_rules"
    ADD CONSTRAINT notification_rules_trigger_check
    CHECK ("trigger_event" IN
      ('milestone_pre_invoice_due','milestone_invoice_due','milestone_overdue',
       'milestone_overdue_critical','reservation_expiring','contract_pending_signature',
       'late_fee_accrued','discount_pending_approval','system_event'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "dev_notification_rules"
    ADD CONSTRAINT notification_rules_recipient_check
    CHECK ("recipient_type" IN
      ('buyer','sales_manager','project_manager','admin','specific_role','specific_user'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "dev_notification_rules"
    ADD CONSTRAINT notification_rules_channel_check
    CHECK ("channel" IN ('email','whatsapp','sms','in_app'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE INDEX IF NOT EXISTS "notification_rules_trigger_idx"
  ON "dev_notification_rules" ("trigger_event")
  WHERE "is_active" = true;

-- -----------------------------------------------------------------------------
-- 17) notification_templates
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS "dev_notification_templates" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "template_name" text NOT NULL UNIQUE,
  "subject" text NOT NULL,
  "body_html" text NOT NULL,
  "body_text" text NOT NULL,
  "language" text NOT NULL DEFAULT 'en',
  "description" text,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now()
);

-- -----------------------------------------------------------------------------
-- 18) notification_delivery_log
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS "dev_notification_delivery_log" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "rule_id" uuid REFERENCES "dev_notification_rules"("id") ON DELETE SET NULL,
  "trigger_entity_type" text NOT NULL,
  "trigger_entity_id" uuid NOT NULL,
  "recipient_contact_id" uuid REFERENCES "contacts"("id") ON DELETE SET NULL,
  "recipient_user_id" uuid REFERENCES "app_users"("id") ON DELETE SET NULL,
  "recipient_address" text,
  "channel" text NOT NULL,
  "template_name" text NOT NULL,
  "subject" text NOT NULL,
  "body" text NOT NULL,
  "status" text NOT NULL DEFAULT 'queued',
  "sent_at" timestamptz,
  "delivered_at" timestamptz,
  "error_reason" text,
  "external_message_id" text,
  "created_at" timestamptz NOT NULL DEFAULT now()
);

DO $$ BEGIN
  ALTER TABLE "dev_notification_delivery_log"
    ADD CONSTRAINT notification_delivery_status_check
    CHECK ("status" IN ('queued','sent','delivered','bounced','failed'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "dev_notification_delivery_log"
    ADD CONSTRAINT notification_delivery_channel_check
    CHECK ("channel" IN ('email','whatsapp','sms','in_app'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE INDEX IF NOT EXISTS "notification_delivery_entity_idx"
  ON "dev_notification_delivery_log" ("trigger_entity_type", "trigger_entity_id");
CREATE INDEX IF NOT EXISTS "notification_delivery_status_at_idx"
  ON "dev_notification_delivery_log" ("status", "created_at" DESC);

-- =============================================================================
-- RLS — internal-only read/write for every new table.
-- =============================================================================
DO $$
DECLARE t text;
BEGIN
  FOR t IN
    SELECT unnest(ARRAY[
      'pricing_rules',
      'unit_price_snapshots',
      'reservations',
      'contract_templates',
      'contract_template_components',
      'sales_schemes',
      'sales_scheme_milestones',
      'contract_groups',
      'contracts',
      'contract_milestones',
      'invoices',
      'late_fee_rules',
      'late_fee_accruals',
      'discount_authorizations',
      'unit_discounts',
      'dev_notification_rules',
      'dev_notification_templates',
      'dev_notification_delivery_log'
    ])
  LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY;', t);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY;', t);
    EXECUTE format(
      'DROP POLICY IF EXISTS internal_read ON %I; '
      'CREATE POLICY internal_read ON %I FOR SELECT '
      'USING (public.is_internal_user());',
      t, t
    );
    EXECUTE format(
      'DROP POLICY IF EXISTS internal_write ON %I; '
      'CREATE POLICY internal_write ON %I FOR ALL '
      'USING (public.is_internal_user()) '
      'WITH CHECK (public.is_internal_user());',
      t, t
    );
  END LOOP;
END $$;

COMMIT;
