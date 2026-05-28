-- Phase 2 data-wiring PR 3 — Owner slice.
--
-- 3 net-new tables (audit listed 4; owner_concierge_agent_runs is
-- NOT created — agent_runs (agents.ts) is platform-agent-config
-- shaped + per-org, NOT per-thread; per the handoff prompt's NOTE,
-- skipped here and surfaced as a follow-up scope gap).
--
-- 1 ALTER on documents: +4 columns (signed_at, signed_hash,
-- expires_at, visible_to_owner) + 1 new index. The audit also
-- proposed `owner_id` + extending `kind` — skipped because the
-- existing entity_type='owner' + entity_id pattern already
-- expresses owner-document linkage, and document_type already
-- carries the relevant values.
--
-- 1 FK backfill on owner_statements.dispute_thread_id, deferred
-- from PR 1 (migration 0112) when owner_threads didn't yet exist.
--
-- Per docs/audits/2026-05-27-phase-2-data-wiring-scope.md § Owner
-- Portal and phase-2-data-wiring-handoff/prompts/03-owner.md.

BEGIN;

-- =============================================================================
-- 1. owner_threads — one row per owner ↔ Mgmt / concierge conversation
-- =============================================================================

CREATE TABLE IF NOT EXISTS owner_threads (
  id                     uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id               uuid        NOT NULL REFERENCES owners(id) ON DELETE CASCADE,
  subject                text        NOT NULL,
  -- Enum: general | dispute | personal_stay_request | maintenance_question
  --     | tax_question | onboarding | offboarding | other
  kind                   text        NOT NULL DEFAULT 'general',
  -- Soft references — no FK because the linked entity can be statement /
  -- booking / maintenance_ticket / etc.
  related_entity_type    text,
  related_entity_id      uuid,
  last_message_at        timestamptz NOT NULL DEFAULT now(),
  -- Denormalised; owner_messages insert path increments.
  unread_count           integer     NOT NULL DEFAULT 0,
  -- Enum: open | resolved | escalated | archived
  status                 text        NOT NULL DEFAULT 'open',
  created_at             timestamptz NOT NULL DEFAULT now(),
  updated_at             timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS owner_threads_owner_last_msg_idx
  ON owner_threads (owner_id, last_message_at);
CREATE INDEX IF NOT EXISTS owner_threads_status_last_msg_idx
  ON owner_threads (status, last_message_at);

-- =============================================================================
-- 2. owner_messages — per-thread message stream
-- =============================================================================

CREATE TABLE IF NOT EXISTS owner_messages (
  id                  uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  thread_id           uuid        NOT NULL REFERENCES owner_threads(id) ON DELETE CASCADE,
  -- Enum: owner | mgmt_staff | concierge_agent | system
  actor_kind          text        NOT NULL,
  -- app_users.id for owner/staff messages; null for agent/system.
  actor_id            uuid,
  body                text        NOT NULL,
  -- Structured agent actions: [{ kind, payload }]
  inline_actions      jsonb,
  -- File refs (PDFs, photos, etc.)
  attachments         jsonb,
  sent_at             timestamptz NOT NULL DEFAULT now(),
  read_by_owner_at    timestamptz
);

CREATE INDEX IF NOT EXISTS owner_messages_thread_sent_idx
  ON owner_messages (thread_id, sent_at);
CREATE INDEX IF NOT EXISTS owner_messages_actor_kind_sent_idx
  ON owner_messages (actor_kind, sent_at);

-- =============================================================================
-- 3. owner_notification_prefs — one row per owner, 6 toggles
-- =============================================================================

CREATE TABLE IF NOT EXISTS owner_notification_prefs (
  id                     uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id               uuid        NOT NULL REFERENCES owners(id) ON DELETE CASCADE,
  statement_ready        boolean     NOT NULL DEFAULT true,
  maintenance_updates    boolean     NOT NULL DEFAULT true,
  q_review_reminder      boolean     NOT NULL DEFAULT true,
  -- Opt-in per audit
  arrival_alerts         boolean     NOT NULL DEFAULT false,
  -- Opt-in per audit
  marketing_updates      boolean     NOT NULL DEFAULT false,
  tax_doc_ready          boolean     NOT NULL DEFAULT true,
  created_at             timestamptz NOT NULL DEFAULT now(),
  updated_at             timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT owner_notification_prefs_owner_uniq UNIQUE (owner_id)
);

-- =============================================================================
-- 4. ALTER documents — +4 columns + 1 new index for owner-portal cabinet
-- =============================================================================

ALTER TABLE documents
  ADD COLUMN IF NOT EXISTS signed_at         timestamptz,
  ADD COLUMN IF NOT EXISTS signed_hash       text,
  ADD COLUMN IF NOT EXISTS expires_at        timestamptz,
  ADD COLUMN IF NOT EXISTS visible_to_owner  boolean NOT NULL DEFAULT false;

-- Backfill: anything with existing `visibility = 'owner'` should be
-- visible to the owner. Idempotent.
UPDATE documents
   SET visible_to_owner = true
 WHERE visibility = 'owner'
   AND visible_to_owner = false;

CREATE INDEX IF NOT EXISTS documents_owner_kind_created_idx
  ON documents (entity_type, entity_id, document_type, created_at);

-- =============================================================================
-- 5. FK backfill on owner_statements.dispute_thread_id (deferred from PR 1)
-- =============================================================================

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.table_constraints
    WHERE constraint_name = 'owner_statements_dispute_thread_id_fkey'
      AND table_name = 'owner_statements'
  ) THEN
    ALTER TABLE owner_statements
      ADD CONSTRAINT owner_statements_dispute_thread_id_fkey
      FOREIGN KEY (dispute_thread_id) REFERENCES owner_threads(id)
      ON DELETE SET NULL;
  END IF;
END $$;

COMMIT;
