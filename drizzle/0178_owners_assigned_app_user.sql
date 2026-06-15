-- =============================================================================
-- 0178 · OWNERS — relationship-manager assignment. Add owners.assigned_app_user_id
--        so the owners-list bulk "Assign to relationship manager" action can
--        PERSIST the assignee (it previously only logged an audit event).
--
-- The column is a nullable FK to app_users(id) ON DELETE SET NULL: an owner may
-- have no relationship manager, and if the assigned staff user is removed the
-- owner simply falls back to "Unassigned" rather than blocking the delete.
--
-- The composite index (organization_id, assigned_app_user_id) supports the
-- org-scoped "owners assigned to manager X" read (every owner query is already
-- AND-scoped on organization_id under the BYPASSRLS role — see migration 0173).
--
-- Idempotent: ADD COLUMN IF NOT EXISTS + CREATE INDEX IF NOT EXISTS. Safe to
-- re-run. No backfill (every owner starts unassigned).
-- =============================================================================

BEGIN;

ALTER TABLE owners
  ADD COLUMN IF NOT EXISTS assigned_app_user_id uuid
  REFERENCES app_users(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS owners_org_assigned_idx
  ON owners(organization_id, assigned_app_user_id);

COMMIT;
