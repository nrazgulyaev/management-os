-- Packet C PR 1 — owner-data layer 2.
--
-- 2 net-new tables (audit listed 3; owner_stays is REUSED — the existing
-- owner_stay_requests in owner-stays.ts is a richer model with allowance
-- accounting + relocation + finance bridge. Wire get-calendar / get-home
-- against that table directly).
--
-- Per packet-c-handoff/prompts/01-owner-data-l2.md.

BEGIN;

-- =============================================================================
-- 1. villa_photos — photo metadata for the Owner Portal villa gallery
-- =============================================================================

CREATE TABLE IF NOT EXISTS villa_photos (
  id                       uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  villa_id                 uuid        NOT NULL REFERENCES villas(id) ON DELETE CASCADE,
  url                      text        NOT NULL,
  caption                  text,
  -- Enum: hero | gallery | floorplan | aerial | room | outside
  kind                     text        NOT NULL DEFAULT 'hero',
  position                 integer     NOT NULL DEFAULT 0,
  width                    integer,
  height                   integer,
  uploaded_by_user_id      uuid        REFERENCES app_users(id) ON DELETE SET NULL,
  visible_to_owner         boolean     NOT NULL DEFAULT true,
  created_at               timestamptz NOT NULL DEFAULT now(),
  updated_at               timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS villa_photos_villa_kind_position_idx
  ON villa_photos (villa_id, kind, position);
CREATE INDEX IF NOT EXISTS villa_photos_villa_created_idx
  ON villa_photos (villa_id, created_at);

-- =============================================================================
-- 2. owner_activity_log — owner-facing event stream (NOT auditEvents — that
--                         one is platform/internal)
-- =============================================================================

CREATE TABLE IF NOT EXISTS owner_activity_log (
  id                    uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id              uuid        NOT NULL REFERENCES owners(id) ON DELETE CASCADE,
  -- Enum: statement_issued | statement_paid | booking_confirmed |
  --   maintenance_closed | personal_stay_confirmed | document_uploaded |
  --   message_received | q_review_scheduled | tax_doc_ready | other
  kind                  text        NOT NULL,
  related_entity_type   text,
  related_entity_id     uuid,
  subject               text        NOT NULL,
  body                  text,
  link_url              text,
  occurred_at           timestamptz NOT NULL DEFAULT now(),
  read_by_owner_at      timestamptz
);

CREATE INDEX IF NOT EXISTS owner_activity_log_owner_occurred_idx
  ON owner_activity_log (owner_id, occurred_at);
CREATE INDEX IF NOT EXISTS owner_activity_log_owner_read_idx
  ON owner_activity_log (owner_id, read_by_owner_at);

COMMIT;
