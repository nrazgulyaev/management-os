-- 0148 · AI FOLLOW-ON (a) — give `ai_assistant_runs` an organization_id.
--
-- The per-agent "Logs" panel (listRunsForAgent) and the per-agent token /
-- cost breakdown in the AI usage view (getTokenUsageView) read straight off
-- `ai_assistant_runs` filtered ONLY by assistant_key — there was no org
-- column, so those reads were platform-wide: one tenant's agent activity
-- bled into another's logs + usage. This anchors each run to an org so the
-- app layer can scope the reads.
--
-- TENANCY policy: the column is NULLABLE (no DB NOT NULL). Existing rows are
-- backfilled to the single ARCONIQUE_DEFAULT seed org (the platform is
-- single-tenant today). New rows written by writers that LACK an org context
-- (the Development-OS AI engines, cron-triggered ops summaries) stay NULL —
-- the read layer treats NULL as an un-attributed / platform run that is
-- visible to every org, so no run is ever hidden. Idempotent.

ALTER TABLE ai_assistant_runs
  ADD COLUMN IF NOT EXISTS organization_id uuid
  REFERENCES organizations(id) ON DELETE SET NULL;

-- Anchor existing rows to the default org (organization_code is UNIQUE, so
-- there is exactly one match). No-op when the seed org is absent.
UPDATE ai_assistant_runs
   SET organization_id = (
     SELECT id FROM organizations
      WHERE organization_code = 'ARCONIQUE_DEFAULT'
      LIMIT 1
   )
 WHERE organization_id IS NULL;

-- Index for the org-scoped reads. Composite (org, assistant_key) backs the
-- per-agent Logs panel; plain (org) backs the usage roll-up.
CREATE INDEX IF NOT EXISTS ai_runs_org_idx
  ON ai_assistant_runs(organization_id);
CREATE INDEX IF NOT EXISTS ai_runs_org_assistant_idx
  ON ai_assistant_runs(organization_id, assistant_key);
