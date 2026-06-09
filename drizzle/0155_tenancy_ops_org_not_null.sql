-- 0155 · TENANCY (thread-ops) — NOT NULL cutover for the OPERATIONS domain
-- tables whose organization_id is now set by EVERY insert path.
--
-- 0149 added the nullable organization_id column + backfilled it through each
-- table's real parent chain (booking -> villa -> project, utility_account, etc.)
-- and indexed it. The thread-ops unit then threaded organization_id through
-- every `.insert(<table>)` site (operator inserts use requireOrgId(); child
-- rows copy the parent row's org; portal/guest paths resolve via the stay
-- token / booking) and scoped the primary list + detail READs to the caller's
-- org. With every insert covered + tsc green on the `.notNull()` Drizzle flip,
-- we can finally pin the column NOT NULL at the DB.
--
-- ONLY the FULLY-COVERED tables are cut over here. Tables whose inserts can
-- still legitimately produce a NULL org (platform-wide CRON that has no
-- session, derived owner-portal projections that resolve org via villa ->
-- project and may miss, best-effort guest security logging, or tables with no
-- live insert at all) are deliberately LEFT NULLABLE — see the trailing note.
--
-- Each cutover is GUARDED: it only fires when (a) the column exists and (b) no
-- NULL rows remain, so it is a no-op safety-net on environments where 0149's
-- backfill could not resolve every row (e.g. no ARCONIQUE_DEFAULT seed org).
-- Fully idempotent + safe to re-run.

-- bookings — every insert (manual create, by-type, direct-booking convert,
-- channel-manager projection, calendar-feed import, demo seeds) sets org.
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='bookings' AND column_name='organization_id')
     AND NOT EXISTS (SELECT 1 FROM bookings WHERE organization_id IS NULL) THEN
    ALTER TABLE bookings ALTER COLUMN organization_id SET NOT NULL;
  END IF;
END $$;

-- booking_guests — child of bookings (copies parent org).
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='booking_guests' AND column_name='organization_id')
     AND NOT EXISTS (SELECT 1 FROM booking_guests WHERE organization_id IS NULL) THEN
    ALTER TABLE booking_guests ALTER COLUMN organization_id SET NOT NULL;
  END IF;
END $$;

-- booking_charges — child of bookings (copies parent org).
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='booking_charges' AND column_name='organization_id')
     AND NOT EXISTS (SELECT 1 FROM booking_charges WHERE organization_id IS NULL) THEN
    ALTER TABLE booking_charges ALTER COLUMN organization_id SET NOT NULL;
  END IF;
END $$;

-- booking_checkin_flow — child of bookings (copies parent org on upsert).
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='booking_checkin_flow' AND column_name='organization_id')
     AND NOT EXISTS (SELECT 1 FROM booking_checkin_flow WHERE organization_id IS NULL) THEN
    ALTER TABLE booking_checkin_flow ALTER COLUMN organization_id SET NOT NULL;
  END IF;
END $$;

-- booking_stay_events — child of bookings (copies parent org).
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='booking_stay_events' AND column_name='organization_id')
     AND NOT EXISTS (SELECT 1 FROM booking_stay_events WHERE organization_id IS NULL) THEN
    ALTER TABLE booking_stay_events ALTER COLUMN organization_id SET NOT NULL;
  END IF;
END $$;

-- checkin_checkout_requests — child of bookings (copies parent org).
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='checkin_checkout_requests' AND column_name='organization_id')
     AND NOT EXISTS (SELECT 1 FROM checkin_checkout_requests WHERE organization_id IS NULL) THEN
    ALTER TABLE checkin_checkout_requests ALTER COLUMN organization_id SET NOT NULL;
  END IF;
END $$;

-- user_responsibility_scopes — operator insert via requireOrgId().
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='user_responsibility_scopes' AND column_name='organization_id')
     AND NOT EXISTS (SELECT 1 FROM user_responsibility_scopes WHERE organization_id IS NULL) THEN
    ALTER TABLE user_responsibility_scopes ALTER COLUMN organization_id SET NOT NULL;
  END IF;
END $$;

-- security_camera_devices — operator insert via requireOrgId().
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='security_camera_devices' AND column_name='organization_id')
     AND NOT EXISTS (SELECT 1 FROM security_camera_devices WHERE organization_id IS NULL) THEN
    ALTER TABLE security_camera_devices ALTER COLUMN organization_id SET NOT NULL;
  END IF;
END $$;

-- villa_maintenance_plans — operator insert via requireOrgId().
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='villa_maintenance_plans' AND column_name='organization_id')
     AND NOT EXISTS (SELECT 1 FROM villa_maintenance_plans WHERE organization_id IS NULL) THEN
    ALTER TABLE villa_maintenance_plans ALTER COLUMN organization_id SET NOT NULL;
  END IF;
END $$;

-- maintenance_window_suggestions — child of villa_maintenance_plans (copies org).
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='maintenance_window_suggestions' AND column_name='organization_id')
     AND NOT EXISTS (SELECT 1 FROM maintenance_window_suggestions WHERE organization_id IS NULL) THEN
    ALTER TABLE maintenance_window_suggestions ALTER COLUMN organization_id SET NOT NULL;
  END IF;
END $$;

-- utility_accounts — operator insert via requireOrgId().
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='utility_accounts' AND column_name='organization_id')
     AND NOT EXISTS (SELECT 1 FROM utility_accounts WHERE organization_id IS NULL) THEN
    ALTER TABLE utility_accounts ALTER COLUMN organization_id SET NOT NULL;
  END IF;
END $$;

-- utility_readings — child of utility_accounts (copies parent org).
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='utility_readings' AND column_name='organization_id')
     AND NOT EXISTS (SELECT 1 FROM utility_readings WHERE organization_id IS NULL) THEN
    ALTER TABLE utility_readings ALTER COLUMN organization_id SET NOT NULL;
  END IF;
END $$;

-- utility_payment_reminders — child of utility_accounts (copies parent org).
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='utility_payment_reminders' AND column_name='organization_id')
     AND NOT EXISTS (SELECT 1 FROM utility_payment_reminders WHERE organization_id IS NULL) THEN
    ALTER TABLE utility_payment_reminders ALTER COLUMN organization_id SET NOT NULL;
  END IF;
END $$;

-- =========================================================================
-- DELIBERATELY LEFT NULLABLE (insert paths can still legitimately produce a
-- NULL org, or have no live insert; flipping would risk a runtime insert
-- failure). Revisit when the noted path is hardened:
--
--   booking_payments / booking_meta
--       No live application insert (seeded only). Nothing to cover yet.
--   operation_tasks
--       The preventive-tasks CRON job runs platform-wide with no session and
--       resolves org via the schedule's project/villa chain, which can be
--       NULL for an org-less schedule.
--   villa_calendar_blocks
--       The direct-booking internal-hold path resolves org via villa ->
--       project and can fall back to NULL.
--   villa_readiness_states
--       Auto-set from task transitions / readiness hooks resolve org via
--       villa -> project and can be NULL.
--   maintenance_risk_events
--       The platform-wide risk scanner opens events from sources (repeated
--       tickets, etc.) whose org may not resolve.
--   owner_booking_summaries / owner_booking_revenue_breakdowns /
--   owner_revenue_source_monthly
--       Derived owner-portal projections; org resolved via villa -> project
--       and may miss. Idempotent rebuild, never a system of record.
--   guest_stay_security_events
--       Best-effort append-only guest/public security log; org resolved via
--       stay token / booking and intentionally swallows failures.
-- =========================================================================
