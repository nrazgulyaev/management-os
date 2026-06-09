-- Migration 0144 — crm_activities
--
-- CRM ACTIVITY TIMELINE (#169) — the Attio/Salesforce relationship-layer spine.
--
-- A single, unified, chronological activity stream for every CRM subject in the
-- platform: owners, contacts, leads, buyers. Previously each surface hand-rolled
-- its own timeline (owner detail synthesised shares+grants; the sales lead detail
-- read `contact_interactions`), and there was no one place to read "everything
-- that ever happened to this relationship". This table is that place — other CRM
-- units (sequences, tasks, notes, comms) write into it and read from it.
--
-- DISTINCT from `audit_events` (system-of-record, who-mutated-what, internal) and
-- from `owner_activity_log` (owner-PORTAL-facing, narrative, owner-only). This is
-- the internal CRM operator timeline: notes, status changes, calls, emails,
-- messages, tasks — keyed by a polymorphic (subject_type, subject_id) pair.
--
-- TENANCY: organization_id is NULLABLE here (per migration policy for tenancy on
-- a brand-new table that an existing-tenant backfill cannot reach — there is no
-- legacy data, but we keep it nullable + indexed and let the action thread the
-- org in at write time via requireOrgId, rather than forcing a DB NOT NULL).
--
-- No money columns. Append-mostly (activities are not edited; a correction is a
-- new activity). Idempotent.

CREATE TABLE IF NOT EXISTS crm_activities (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  -- Multi-tenant scope. Nullable per tenancy migration policy (new table, no
  -- legacy rows to backfill); the writer threads it in via requireOrgId().
  organization_id uuid,
  -- Polymorphic subject. subject_type is one of: owner | contact | lead | buyer.
  -- subject_id is a soft reference (no FK) to keep this module import-cycle-free
  -- across the owners / contacts / sales packages.
  subject_type text NOT NULL,
  subject_id uuid NOT NULL,
  -- Activity kind: note | message | status_change | call | task | email.
  kind text NOT NULL,
  -- Short headline (e.g. "Status → contract_signed", "Logged a call").
  title text NOT NULL,
  -- Optional longer free-text body (note content, call summary, message excerpt).
  body text,
  -- Who performed it (soft link to app_users; null for system-generated events).
  actor_app_user_id uuid,
  -- Cached display name so the feed renders without a join when the user is gone.
  actor_name text,
  -- Free-form structured payload: { fromStatus, toStatus }, { channel }, etc.
  metadata jsonb,
  -- When the activity actually happened (defaults to insert time; callers may
  -- backdate for imported history).
  occurred_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Primary read path: "all activities for this subject, newest first".
CREATE INDEX IF NOT EXISTS crm_activities_subject_idx
  ON crm_activities (subject_type, subject_id, occurred_at DESC);

-- Org-scoped sweeps (tenant feed / retention jobs).
CREATE INDEX IF NOT EXISTS crm_activities_org_idx
  ON crm_activities (organization_id, occurred_at DESC);

-- Filter a subject's feed by kind (e.g. only calls, only status changes).
CREATE INDEX IF NOT EXISTS crm_activities_kind_idx
  ON crm_activities (subject_type, subject_id, kind);
