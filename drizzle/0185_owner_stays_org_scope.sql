-- =============================================================================
-- 0185 · ORG-SCOPE owner_stay_policies + villa_equivalence_groups
--
-- These two tables had NO organization_id, and their readers
-- (listOwnerStayPolicies / getApplicableOwnerStayPolicy / listEquivalenceGroups
-- / listEquivalenceMembers) returned "global" rows — project_id IS NULL AND
-- villa_id IS NULL (policies), or project_id IS NULL (equivalence groups) —
-- to EVERY tenant (BYPASSRLS, no row-level security). The project-/villa-
-- anchored branches were already org-scoped; only the global branch leaked.
--
-- Add organization_id, backfill from the FK chain (villa→project→org, then
-- project→org), and fall back to ARCONIQUE_DEFAULT for genuinely-global rows.
-- Left nullable for now (stamp-on-insert in the create actions + an eq(org)
-- read filter close the leak); a follow-up can SET NOT NULL once verified.
-- Same shape as migrations 0152 / 0173.
-- =============================================================================

ALTER TABLE owner_stay_policies
  ADD COLUMN IF NOT EXISTS organization_id uuid REFERENCES organizations(id) ON DELETE RESTRICT;
ALTER TABLE villa_equivalence_groups
  ADD COLUMN IF NOT EXISTS organization_id uuid REFERENCES organizations(id) ON DELETE RESTRICT;

-- owner_stay_policies: villa→project→org, then project→org, then default-org.
UPDATE owner_stay_policies t
   SET organization_id = vp.organization_id
  FROM villas v
  JOIN projects vp ON vp.id = v.project_id
 WHERE v.id = t.villa_id AND t.organization_id IS NULL;

UPDATE owner_stay_policies t
   SET organization_id = p.organization_id
  FROM projects p
 WHERE p.id = t.project_id AND t.organization_id IS NULL;

UPDATE owner_stay_policies t
   SET organization_id = o.id
  FROM organizations o
 WHERE o.organization_code = 'ARCONIQUE_DEFAULT' AND t.organization_id IS NULL;

-- villa_equivalence_groups: project→org, then default-org.
UPDATE villa_equivalence_groups t
   SET organization_id = p.organization_id
  FROM projects p
 WHERE p.id = t.project_id AND t.organization_id IS NULL;

UPDATE villa_equivalence_groups t
   SET organization_id = o.id
  FROM organizations o
 WHERE o.organization_code = 'ARCONIQUE_DEFAULT' AND t.organization_id IS NULL;

CREATE INDEX IF NOT EXISTS owner_stay_policies_organization_idx
  ON owner_stay_policies(organization_id);
CREATE INDEX IF NOT EXISTS villa_equivalence_groups_organization_idx
  ON villa_equivalence_groups(organization_id);
