-- Phase 2 data-wiring PR 1 — Mgmt slice.
--
-- 4 new tables + 1 ALTER on owner_statements.
--
-- Per docs/audits/2026-05-27-phase-2-data-wiring-scope.md § Mgmt P1.
-- Drizzle TS schema landed in 2f67d19; this is the hand-written SQL
-- because drizzle-kit generate hits a pre-existing BigInt serialization
-- bug on this codebase's `bigint` columns. Inspect against the schema
-- TS files (statement-anomalies.ts / owner-insights.ts /
-- onboarding-drafts.ts / sla-breaches.ts) before applying.

BEGIN;

-- =============================================================================
-- 1. statement_anomalies — append-only flags from statement-anomaly-detector
-- =============================================================================

CREATE TABLE IF NOT EXISTS statement_anomalies (
  id                    uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  statement_id          uuid        NOT NULL REFERENCES owner_statements(id) ON DELETE CASCADE,
  -- Enum: supplier_cost_spike | occupancy_drop | channel_mix_shift | one_off_charge | tax_anomaly | other
  kind                  text        NOT NULL,
  -- Enum: info | warn | critical
  severity              text        NOT NULL,
  payload               jsonb       NOT NULL,
  fired_at              timestamptz NOT NULL DEFAULT now(),
  resolved_at           timestamptz,
  resolved_by_user_id   uuid        REFERENCES app_users(id) ON DELETE SET NULL,
  resolution_note       text
);

CREATE INDEX IF NOT EXISTS statement_anomalies_statement_fired_idx
  ON statement_anomalies (statement_id, fired_at);
CREATE INDEX IF NOT EXISTS statement_anomalies_kind_severity_fired_idx
  ON statement_anomalies (kind, severity, fired_at);

-- =============================================================================
-- 2. owner_insights — surfaces on Owners cabinet risk-ring + Owner Portal home
-- =============================================================================

CREATE TABLE IF NOT EXISTS owner_insights (
  id                    uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id              uuid        NOT NULL REFERENCES owners(id) ON DELETE CASCADE,
  -- Enum: occupancy_trend | adr_trend | maintenance_cost | guest_satisfaction
  --     | renewal_window | contract_milestone | other
  kind                  text        NOT NULL,
  -- Enum: info | watch | act
  level                 text        NOT NULL,
  payload               jsonb       NOT NULL,
  fired_at              timestamptz NOT NULL DEFAULT now(),
  dismissed_at          timestamptz,
  dismissed_by_user_id  uuid        REFERENCES app_users(id) ON DELETE SET NULL,
  -- Enum: acted | not_relevant | will_review | other
  dismissed_reason      text
);

CREATE INDEX IF NOT EXISTS owner_insights_owner_fired_idx
  ON owner_insights (owner_id, fired_at);
CREATE INDEX IF NOT EXISTS owner_insights_level_fired_idx
  ON owner_insights (level, fired_at);

-- =============================================================================
-- 3. onboarding_drafts — 3-step new-owner modal state, 14d TTL
-- =============================================================================

CREATE TABLE IF NOT EXISTS onboarding_drafts (
  id                    uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  director_user_id      uuid        NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
  step                  integer     NOT NULL DEFAULT 1,
  data                  jsonb       NOT NULL DEFAULT '{}'::jsonb,
  expires_at            timestamptz NOT NULL DEFAULT (now() + interval '14 days'),
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS onboarding_drafts_director_updated_idx
  ON onboarding_drafts (director_user_id, updated_at);
CREATE INDEX IF NOT EXISTS onboarding_drafts_expires_idx
  ON onboarding_drafts (expires_at);

-- =============================================================================
-- 4. sla_breaches — maintenance-ticket SLA breach log (append-only)
-- =============================================================================

CREATE TABLE IF NOT EXISTS sla_breaches (
  id                    uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id             uuid        NOT NULL REFERENCES maintenance_tickets(id) ON DELETE CASCADE,
  breached_at           timestamptz NOT NULL,
  resolved_at           timestamptz,
  breach_minutes        integer     NOT NULL
);

CREATE INDEX IF NOT EXISTS sla_breaches_ticket_idx
  ON sla_breaches (ticket_id);
CREATE INDEX IF NOT EXISTS sla_breaches_breached_at_idx
  ON sla_breaches (breached_at);

-- =============================================================================
-- 5. ALTER owner_statements — +7 columns for the owner-side state machine
-- =============================================================================
--
-- Independent of mgmt-side `status`. The auto-ack scheduler reads
-- (owner_state, auto_ack_at) to flip pending → auto_acknowledged after
-- the TTL.
--
-- `dispute_thread_id` is left UNREFERENCED here on purpose: it FKs to
-- `owner_threads(id)` which lands in PR 3 (Owner slice). PR 3 adds the
-- constraint via ALTER … ADD CONSTRAINT.

ALTER TABLE owner_statements
  ADD COLUMN IF NOT EXISTS owner_state          text        NOT NULL DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS owner_viewed_at      timestamptz,
  ADD COLUMN IF NOT EXISTS owner_acked_at       timestamptz,
  ADD COLUMN IF NOT EXISTS owner_disputed_at    timestamptz,
  ADD COLUMN IF NOT EXISTS auto_ack_at          timestamptz,
  ADD COLUMN IF NOT EXISTS dispute_reason_kind  text,
  ADD COLUMN IF NOT EXISTS dispute_thread_id    uuid;

CREATE INDEX IF NOT EXISTS owner_statements_owner_state_auto_ack_idx
  ON owner_statements (owner_state, auto_ack_at);

COMMIT;
