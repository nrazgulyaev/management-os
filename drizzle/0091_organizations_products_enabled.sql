-- Stage 10.H — Per-product (Mgmt OS / Dev OS) tenant access
-- ============================================================================
--
-- Adds `organizations.products_enabled text[]` to track which product
-- surfaces each tenant has access to. Two values today:
--   - 'mgmt' → /dashboard/* (Management OS)
--   - 'dev'  → /development-os/* (Development OS)
--
-- Default `'{mgmt,dev}'` mirrors today's behaviour: every existing
-- tenant has access to BOTH products, so this migration is fully
-- backward-compatible — no UI behaviour changes until 10.H Part 4
-- ships the per-product middleware that consumes this column.
--
-- Why text[] not jsonb:
--   - We already use `enabledModules jsonb` for finer-grained module
--     toggles within each product. Products are a flatter axis (2-3
--     values for the foreseeable future); a text[] keeps GIN-index
--     containment queries (`@>`) terse and lets us add a CHECK
--     constraint on allowed values down the line if needed.
--
-- Index strategy:
--   GIN index on the column to support the future "find every org
--   that has access to product X" admin filters and the per-request
--   middleware containment check (`products_enabled @> ARRAY['mgmt']`).
--
-- Rollback:
--   DROP INDEX IF EXISTS organizations_products_enabled_idx;
--   ALTER TABLE organizations DROP COLUMN products_enabled;

ALTER TABLE organizations
  ADD COLUMN products_enabled text[] NOT NULL DEFAULT ARRAY['mgmt', 'dev'];

CREATE INDEX IF NOT EXISTS organizations_products_enabled_idx
  ON organizations USING GIN (products_enabled);

COMMENT ON COLUMN organizations.products_enabled IS
  'Which product surfaces this tenant can reach. Allowed values: mgmt, dev. Stage 10.H. See src/lib/products.ts for the runtime enum.';
