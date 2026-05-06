-- =============================================================================
-- Prompt 111 — Security Baseline & Operational Hardening.
--
-- Five new tables (MFA factors, MFA recovery codes, login attempts,
-- security events, job locks) + a generic `record_sensitive_audit_event`
-- trigger function attached to a curated list of finance / auth tables.
-- All tables are RLS-forced internal-only; there is no public read /
-- write surface.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1) auth_mfa_factors
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS "auth_mfa_factors" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "app_user_id" uuid NOT NULL REFERENCES "app_users"("id") ON DELETE CASCADE,
  "factor_type" text NOT NULL DEFAULT 'totp',
  "status" text NOT NULL DEFAULT 'pending',
  "issuer" text NOT NULL DEFAULT 'Arconique',
  "label" text,
  "secret_ciphertext" text NOT NULL,
  "secret_key_version" integer NOT NULL DEFAULT 1,
  "verified_at" timestamptz,
  "disabled_at" timestamptz,
  "revoked_at" timestamptz,
  "last_used_at" timestamptz,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now()
);

DO $$ BEGIN
  ALTER TABLE "auth_mfa_factors"
    ADD CONSTRAINT auth_mfa_factors_status_check
    CHECK ("status" IN ('pending', 'verified', 'disabled', 'revoked'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "auth_mfa_factors"
    ADD CONSTRAINT auth_mfa_factors_factor_type_check
    CHECK ("factor_type" IN ('totp'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE INDEX IF NOT EXISTS "auth_mfa_factors_user_idx"
  ON "auth_mfa_factors" ("app_user_id");
CREATE INDEX IF NOT EXISTS "auth_mfa_factors_status_idx"
  ON "auth_mfa_factors" ("status");

-- One active TOTP factor per user (either pending or verified).
CREATE UNIQUE INDEX IF NOT EXISTS "auth_mfa_factors_active_unique"
  ON "auth_mfa_factors" ("app_user_id")
  WHERE "factor_type" = 'totp'
    AND "status" IN ('pending', 'verified');

-- -----------------------------------------------------------------------------
-- 2) auth_mfa_recovery_codes
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS "auth_mfa_recovery_codes" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "app_user_id" uuid NOT NULL REFERENCES "app_users"("id") ON DELETE CASCADE,
  "code_hash" text NOT NULL UNIQUE,
  "status" text NOT NULL DEFAULT 'active',
  "used_at" timestamptz,
  "created_at" timestamptz NOT NULL DEFAULT now()
);

DO $$ BEGIN
  ALTER TABLE "auth_mfa_recovery_codes"
    ADD CONSTRAINT auth_mfa_recovery_codes_status_check
    CHECK ("status" IN ('active', 'used', 'revoked'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE INDEX IF NOT EXISTS "auth_mfa_recovery_codes_user_idx"
  ON "auth_mfa_recovery_codes" ("app_user_id");

-- -----------------------------------------------------------------------------
-- 3) auth_login_attempts
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS "auth_login_attempts" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "email_normalized" text,
  "app_user_id" uuid REFERENCES "app_users"("id") ON DELETE SET NULL,
  "ip_hash" text,
  "user_agent_hash" text,
  "succeeded" boolean NOT NULL DEFAULT false,
  "failure_reason" text,
  "locked_until" timestamptz,
  "created_at" timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "auth_login_attempts_email_idx"
  ON "auth_login_attempts" ("email_normalized", "created_at" DESC);
CREATE INDEX IF NOT EXISTS "auth_login_attempts_ip_idx"
  ON "auth_login_attempts" ("ip_hash", "created_at" DESC);
CREATE INDEX IF NOT EXISTS "auth_login_attempts_user_idx"
  ON "auth_login_attempts" ("app_user_id", "created_at" DESC);

-- -----------------------------------------------------------------------------
-- 4) auth_security_events
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS "auth_security_events" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "app_user_id" uuid REFERENCES "app_users"("id") ON DELETE SET NULL,
  "event_type" text NOT NULL,
  "severity" text NOT NULL DEFAULT 'info',
  "ip_hash" text,
  "user_agent_hash" text,
  "metadata" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "created_at" timestamptz NOT NULL DEFAULT now()
);

DO $$ BEGIN
  ALTER TABLE "auth_security_events"
    ADD CONSTRAINT auth_security_events_severity_check
    CHECK ("severity" IN ('info', 'warning', 'critical'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE INDEX IF NOT EXISTS "auth_security_events_user_idx"
  ON "auth_security_events" ("app_user_id", "created_at" DESC);
CREATE INDEX IF NOT EXISTS "auth_security_events_type_idx"
  ON "auth_security_events" ("event_type", "created_at" DESC);
CREATE INDEX IF NOT EXISTS "auth_security_events_severity_idx"
  ON "auth_security_events" ("severity", "created_at" DESC);

-- -----------------------------------------------------------------------------
-- 5) job_locks
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS "job_locks" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "job_key" text NOT NULL UNIQUE,
  "status" text NOT NULL DEFAULT 'locked',
  "locked_by" text NOT NULL,
  "locked_at" timestamptz NOT NULL DEFAULT now(),
  "expires_at" timestamptz NOT NULL,
  "released_at" timestamptz,
  "metadata" jsonb NOT NULL DEFAULT '{}'::jsonb
);

DO $$ BEGIN
  ALTER TABLE "job_locks"
    ADD CONSTRAINT job_locks_status_check
    CHECK ("status" IN ('locked', 'released', 'expired'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE INDEX IF NOT EXISTS "job_locks_status_idx"
  ON "job_locks" ("status");
CREATE INDEX IF NOT EXISTS "job_locks_expires_idx"
  ON "job_locks" ("expires_at");

-- =============================================================================
-- RLS — internal-only on every new table.
-- =============================================================================
DO $$
DECLARE t text;
BEGIN
  FOR t IN
    SELECT unnest(ARRAY[
      'auth_mfa_factors',
      'auth_mfa_recovery_codes',
      'auth_login_attempts',
      'auth_security_events',
      'job_locks'
    ])
  LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY;', t);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY;', t);
    EXECUTE format(
      'DROP POLICY IF EXISTS internal_read ON %I; '
      'CREATE POLICY internal_read ON %I FOR SELECT '
      'USING (public.is_internal_user());',
      t, t
    );
    EXECUTE format(
      'DROP POLICY IF EXISTS internal_write ON %I; '
      'CREATE POLICY internal_write ON %I FOR ALL '
      'USING (public.is_internal_user()) '
      'WITH CHECK (public.is_internal_user());',
      t, t
    );
  END LOOP;
END $$;

-- =============================================================================
-- Audit trigger — record_sensitive_audit_event().
--
-- A single trigger function that writes to `audit_events` for every
-- INSERT / UPDATE / DELETE on the curated sensitive tables below.  We
-- use to_jsonb(NEW)/to_jsonb(OLD) instead of column-by-column lookup so
-- the function does not need to know each table's exact shape.
--
-- The function deliberately swallows audit-write failures — if
-- audit_events is unavailable mid-migration the underlying mutation
-- must still succeed.  Production calls write through `recordAuditEvent`
-- in app code; this trigger is a defence-in-depth safety net for
-- direct-SQL mutations (admin scripts, restore drills, etc).
--
-- The function NEVER attaches to `audit_events` itself — that would
-- recurse and is explicitly excluded from the attach loop.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.record_sensitive_audit_event()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_action text;
  v_entity_id uuid := NULL;
  v_old_jsonb jsonb := '{}'::jsonb;
  v_new_jsonb jsonb := '{}'::jsonb;
  v_metadata jsonb;
  v_changed_keys text[] := ARRAY[]::text[];
  v_old_status text;
  v_new_status text;
BEGIN
  -- Refuse to record audit events for the audit_events table itself —
  -- defence in depth in case someone attaches the trigger by mistake.
  IF TG_TABLE_NAME = 'audit_events' THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  v_action := 'db.audit.' || TG_TABLE_NAME || '.' || lower(TG_OP);

  IF TG_OP = 'INSERT' THEN
    v_new_jsonb := to_jsonb(NEW);
    BEGIN v_entity_id := (v_new_jsonb->>'id')::uuid; EXCEPTION WHEN OTHERS THEN v_entity_id := NULL; END;
    BEGIN v_new_status := v_new_jsonb->>'status'; EXCEPTION WHEN OTHERS THEN v_new_status := NULL; END;
  ELSIF TG_OP = 'UPDATE' THEN
    v_old_jsonb := to_jsonb(OLD);
    v_new_jsonb := to_jsonb(NEW);
    BEGIN v_entity_id := (v_new_jsonb->>'id')::uuid; EXCEPTION WHEN OTHERS THEN v_entity_id := NULL; END;
    BEGIN v_old_status := v_old_jsonb->>'status'; EXCEPTION WHEN OTHERS THEN v_old_status := NULL; END;
    BEGIN v_new_status := v_new_jsonb->>'status'; EXCEPTION WHEN OTHERS THEN v_new_status := NULL; END;
    -- Compute changed keys via key-set diff.  Cheap enough for the
    -- low-volume sensitive tables we attach this trigger to.
    BEGIN
      SELECT array_agg(k)
        INTO v_changed_keys
        FROM (
          SELECT k FROM jsonb_object_keys(v_new_jsonb) k
          WHERE v_new_jsonb->>k IS DISTINCT FROM v_old_jsonb->>k
        ) s;
    EXCEPTION WHEN OTHERS THEN
      v_changed_keys := ARRAY[]::text[];
    END;
  ELSIF TG_OP = 'DELETE' THEN
    v_old_jsonb := to_jsonb(OLD);
    BEGIN v_entity_id := (v_old_jsonb->>'id')::uuid; EXCEPTION WHEN OTHERS THEN v_entity_id := NULL; END;
    BEGIN v_old_status := v_old_jsonb->>'status'; EXCEPTION WHEN OTHERS THEN v_old_status := NULL; END;
  END IF;

  v_metadata := jsonb_build_object(
    'table', TG_TABLE_NAME,
    'op', TG_OP,
    'row_id', v_entity_id,
    'changed_keys', to_jsonb(v_changed_keys),
    'old_status', v_old_status,
    'new_status', v_new_status,
    'created_at', now()
  );

  BEGIN
    INSERT INTO public.audit_events
      (actor_user_id, action, entity_type, entity_id, "before", "after", metadata)
    VALUES
      (NULL, v_action, TG_TABLE_NAME, v_entity_id, v_old_jsonb, v_new_jsonb, v_metadata);
  EXCEPTION WHEN OTHERS THEN
    -- Audit write failed — do not block the underlying mutation.
    NULL;
  END;

  RETURN COALESCE(NEW, OLD);
END;
$$;

-- =============================================================================
-- Attach the trigger to the curated list of sensitive tables.
--
-- The list is intentionally narrow: auth tables that change rarely
-- and finance tables where every row matters.  audit_events is
-- explicitly excluded.
-- =============================================================================
DO $$
DECLARE t text;
BEGIN
  FOR t IN
    SELECT unnest(ARRAY[
      'user_roles',
      'app_users_owners',
      'auth_mfa_factors',
      'auth_mfa_recovery_codes',
      'owner_statements',
      'statement_lines',
      'payout_lines',
      'management_fee_lines',
      'revenue_lines',
      'expense_lines',
      'direct_booking_finance_links',
      'owner_stay_finance_links',
      'statement_source_groups',
      'statement_reconciliation_warnings'
    ])
  LOOP
    -- Skip if the table doesn't exist in this environment (e.g.
    -- legacy DBs that haven't been brought forward).
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.tables
       WHERE table_schema = 'public' AND table_name = t
    ) THEN
      RAISE NOTICE 'Skipping audit trigger attach — table % missing', t;
      CONTINUE;
    END IF;
    -- Idempotent: drop + create.
    EXECUTE format(
      'DROP TRIGGER IF EXISTS trg_audit_sensitive ON %I;', t
    );
    EXECUTE format(
      'CREATE TRIGGER trg_audit_sensitive
         AFTER INSERT OR UPDATE OR DELETE ON %I
         FOR EACH ROW EXECUTE FUNCTION public.record_sensitive_audit_event();',
      t
    );
  END LOOP;
END $$;
