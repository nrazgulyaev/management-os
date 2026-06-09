-- 0158 · TENANCY (thread-portal) — flip organization_id to NOT NULL on the
-- PORTAL/GUEST tables whose every insert path now sets the org anchor.
--
-- The column + backfill landed in 0152 (nullable). The thread-portal app
-- unit then threaded organization_id through every INSERT for these tables
-- (operator inserts via requireOrgId(); owner-portal inserts via
-- getOwnerOrgId(ownerId) → owner → ownership_shares → project.org; child
-- rows copy the parent's org; the check-in seed resolves booking → villa →
-- project). With tsc green on the .notNull() schema flip, the cutover below
-- promotes the DB constraint to match.
--
-- GUARDED + IDEMPOTENT: each table flips ONLY when (a) the column exists and
-- (b) no NULL rows remain (0152's backfill + the default-org fallback should
-- have populated every existing row). On a bare env where the column is
-- absent, or a row is somehow still NULL, the guard is a silent no-op rather
-- than a hard failure — so `migrate.ts --force` stays safe to re-run.
--
-- NOT INCLUDED: villa_photos. It has NO application insert path (rows arrive
-- only via seed/import), so the thread-portal unit could not guarantee org
-- coverage on every write. Its column stays NULLABLE until an insert path
-- exists to anchor.

DO $$ BEGIN IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='owner_threads' AND column_name='organization_id') AND NOT EXISTS (SELECT 1 FROM owner_threads WHERE organization_id IS NULL) THEN ALTER TABLE owner_threads ALTER COLUMN organization_id SET NOT NULL; END IF; END $$;

DO $$ BEGIN IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='owner_stay_requests' AND column_name='organization_id') AND NOT EXISTS (SELECT 1 FROM owner_stay_requests WHERE organization_id IS NULL) THEN ALTER TABLE owner_stay_requests ALTER COLUMN organization_id SET NOT NULL; END IF; END $$;

DO $$ BEGIN IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='owner_stay_finance_links' AND column_name='organization_id') AND NOT EXISTS (SELECT 1 FROM owner_stay_finance_links WHERE organization_id IS NULL) THEN ALTER TABLE owner_stay_finance_links ALTER COLUMN organization_id SET NOT NULL; END IF; END $$;

DO $$ BEGIN IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='owner_notification_prefs' AND column_name='organization_id') AND NOT EXISTS (SELECT 1 FROM owner_notification_prefs WHERE organization_id IS NULL) THEN ALTER TABLE owner_notification_prefs ALTER COLUMN organization_id SET NOT NULL; END IF; END $$;

DO $$ BEGIN IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='owner_activity_log' AND column_name='organization_id') AND NOT EXISTS (SELECT 1 FROM owner_activity_log WHERE organization_id IS NULL) THEN ALTER TABLE owner_activity_log ALTER COLUMN organization_id SET NOT NULL; END IF; END $$;

DO $$ BEGIN IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='owner_insights' AND column_name='organization_id') AND NOT EXISTS (SELECT 1 FROM owner_insights WHERE organization_id IS NULL) THEN ALTER TABLE owner_insights ALTER COLUMN organization_id SET NOT NULL; END IF; END $$;

DO $$ BEGIN IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='guest_stay_tokens' AND column_name='organization_id') AND NOT EXISTS (SELECT 1 FROM guest_stay_tokens WHERE organization_id IS NULL) THEN ALTER TABLE guest_stay_tokens ALTER COLUMN organization_id SET NOT NULL; END IF; END $$;

DO $$ BEGIN IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='guest_services' AND column_name='organization_id') AND NOT EXISTS (SELECT 1 FROM guest_services WHERE organization_id IS NULL) THEN ALTER TABLE guest_services ALTER COLUMN organization_id SET NOT NULL; END IF; END $$;

DO $$ BEGIN IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='guest_journey_rules' AND column_name='organization_id') AND NOT EXISTS (SELECT 1 FROM guest_journey_rules WHERE organization_id IS NULL) THEN ALTER TABLE guest_journey_rules ALTER COLUMN organization_id SET NOT NULL; END IF; END $$;

DO $$ BEGIN IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='villa_guide_sections' AND column_name='organization_id') AND NOT EXISTS (SELECT 1 FROM villa_guide_sections WHERE organization_id IS NULL) THEN ALTER TABLE villa_guide_sections ALTER COLUMN organization_id SET NOT NULL; END IF; END $$;

DO $$ BEGIN IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='capital_calls' AND column_name='organization_id') AND NOT EXISTS (SELECT 1 FROM capital_calls WHERE organization_id IS NULL) THEN ALTER TABLE capital_calls ALTER COLUMN organization_id SET NOT NULL; END IF; END $$;

DO $$ BEGIN IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='waterfall_rules' AND column_name='organization_id') AND NOT EXISTS (SELECT 1 FROM waterfall_rules WHERE organization_id IS NULL) THEN ALTER TABLE waterfall_rules ALTER COLUMN organization_id SET NOT NULL; END IF; END $$;

DO $$ BEGIN IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='contract_group_remind_prefs' AND column_name='organization_id') AND NOT EXISTS (SELECT 1 FROM contract_group_remind_prefs WHERE organization_id IS NULL) THEN ALTER TABLE contract_group_remind_prefs ALTER COLUMN organization_id SET NOT NULL; END IF; END $$;
