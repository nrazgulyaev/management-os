-- Arconique Management OS — Initial migration
-- Generated for Drizzle (drizzle-kit-compatible plain SQL).
-- Apply with: psql "$DIRECT_URL" -f drizzle/0000_initial.sql
-- Or via Supabase SQL editor.

-- =============================================================================
-- Extensions
-- =============================================================================
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- =============================================================================
-- Identity
-- =============================================================================
CREATE TABLE IF NOT EXISTS "app_users" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "auth_user_id" uuid UNIQUE,
  "email" text NOT NULL UNIQUE,
  "full_name" text NOT NULL,
  "phone" text,
  "avatar_url" text,
  "status" text NOT NULL DEFAULT 'active',
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "app_users_email_lower_idx" ON "app_users" (lower("email"));

CREATE TABLE IF NOT EXISTS "roles" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "key" text NOT NULL UNIQUE,
  "name" text NOT NULL,
  "description" text,
  "is_system" boolean NOT NULL DEFAULT false,
  "created_at" timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS "permissions" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "key" text NOT NULL UNIQUE,
  "name" text NOT NULL,
  "description" text,
  "created_at" timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS "user_roles" (
  "user_id" uuid NOT NULL REFERENCES "app_users"("id") ON DELETE CASCADE,
  "role_id" uuid NOT NULL REFERENCES "roles"("id") ON DELETE CASCADE,
  "scope_type" text,
  "scope_id" uuid,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY ("user_id", "role_id", "scope_type", "scope_id")
);
CREATE INDEX IF NOT EXISTS "user_roles_user_idx" ON "user_roles" ("user_id");
CREATE INDEX IF NOT EXISTS "user_roles_scope_idx" ON "user_roles" ("scope_type", "scope_id");

CREATE TABLE IF NOT EXISTS "role_permissions" (
  "role_id" uuid NOT NULL REFERENCES "roles"("id") ON DELETE CASCADE,
  "permission_id" uuid NOT NULL REFERENCES "permissions"("id") ON DELETE CASCADE,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY ("role_id", "permission_id")
);

-- =============================================================================
-- Projects · Villas
-- =============================================================================
CREATE TABLE IF NOT EXISTS "projects" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "slug" text NOT NULL UNIQUE,
  "name" text NOT NULL,
  "concept" text,
  "location" text NOT NULL,
  "area" text,
  "description" text,
  "status" text NOT NULL DEFAULT 'development'
    CHECK ("status" IN ('development','soft_open','live','archived')),
  "management_status" text NOT NULL DEFAULT 'managed'
    CHECK ("management_status" IN ('lead','onboarding','managed','paused','exited')),
  "hero_image_url" text,
  "total_villas" integer,
  "target_handover_date" date,
  "leasehold_until" date,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "projects_status_idx" ON "projects" ("status");

CREATE TABLE IF NOT EXISTS "villas" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "project_id" uuid NOT NULL REFERENCES "projects"("id") ON DELETE RESTRICT,
  "slug" text NOT NULL,
  "unit_code" text NOT NULL,
  "name" text,
  "status" text NOT NULL DEFAULT 'ready'
    CHECK ("status" IN ('occupied','checkout_pending','cleaning','inspection','ready','maintenance_blocked','owner_stay','out_of_service')),
  "bedrooms" integer NOT NULL DEFAULT 0,
  "bathrooms" numeric(4,1),
  "built_area_sqm" numeric(10,2),
  "land_area_sqm" numeric(10,2),
  "pool_area_sqm" numeric(10,2),
  "view_type" text,
  "management_model" text NOT NULL DEFAULT 'individual'
    CHECK ("management_model" IN ('individual','pooled','hybrid')),
  "current_nightly_rate_usd" numeric(10,2),
  "owner_visible" boolean NOT NULL DEFAULT true,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now(),
  UNIQUE ("project_id","unit_code")
);
CREATE INDEX IF NOT EXISTS "villas_project_idx" ON "villas" ("project_id");
CREATE INDEX IF NOT EXISTS "villas_status_idx" ON "villas" ("status");

CREATE TABLE IF NOT EXISTS "villa_status_events" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "villa_id" uuid NOT NULL REFERENCES "villas"("id") ON DELETE CASCADE,
  "status" text NOT NULL,
  "source" text NOT NULL DEFAULT 'manual',
  "note" text,
  "created_by" uuid REFERENCES "app_users"("id") ON DELETE SET NULL,
  "created_at" timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "villa_status_events_villa_idx" ON "villa_status_events" ("villa_id");
CREATE INDEX IF NOT EXISTS "villa_status_events_at_idx" ON "villa_status_events" ("created_at");

-- =============================================================================
-- Ownership
-- =============================================================================
CREATE TABLE IF NOT EXISTS "owners" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "type" text NOT NULL DEFAULT 'individual'
    CHECK ("type" IN ('individual','company','family_office')),
  "display_name" text NOT NULL,
  "legal_name" text,
  "email" text,
  "phone" text,
  "nationality" text,
  "tax_residency" text,
  "status" text NOT NULL DEFAULT 'active'
    CHECK ("status" IN ('active','onboarding','archived')),
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "owners_status_idx" ON "owners" ("status");

CREATE TABLE IF NOT EXISTS "ownership_shares" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "owner_id" uuid NOT NULL REFERENCES "owners"("id") ON DELETE RESTRICT,
  "villa_id" uuid REFERENCES "villas"("id") ON DELETE RESTRICT,
  "project_id" uuid REFERENCES "projects"("id") ON DELETE RESTRICT,
  "share_percent" numeric(9,6) NOT NULL CHECK ("share_percent" >= 0 AND "share_percent" <= 100),
  "model" text NOT NULL DEFAULT 'individual'
    CHECK ("model" IN ('individual','pooled','hybrid')),
  "starts_on" date NOT NULL,
  "ends_on" date,
  "status" text NOT NULL DEFAULT 'active'
    CHECK ("status" IN ('active','scheduled','ended')),
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now(),
  CHECK ("villa_id" IS NOT NULL OR "project_id" IS NOT NULL)
);
CREATE INDEX IF NOT EXISTS "ownership_shares_owner_idx" ON "ownership_shares" ("owner_id");
CREATE INDEX IF NOT EXISTS "ownership_shares_villa_idx" ON "ownership_shares" ("villa_id");
CREATE INDEX IF NOT EXISTS "ownership_shares_project_idx" ON "ownership_shares" ("project_id");

CREATE TABLE IF NOT EXISTS "payout_methods" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "owner_id" uuid NOT NULL REFERENCES "owners"("id") ON DELETE CASCADE,
  "method_type" text NOT NULL
    CHECK ("method_type" IN ('bank_idr','bank_intl','wise','crypto')),
  "currency" text NOT NULL DEFAULT 'IDR',
  "account_label" text NOT NULL,
  "bank_name" text,
  "account_last4" text,
  "wise_email" text,
  "crypto_network" text,
  "crypto_wallet_last6" text,
  "is_default" boolean NOT NULL DEFAULT false,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "payout_methods_owner_idx" ON "payout_methods" ("owner_id");

-- =============================================================================
-- Booking channels · Guests · Bookings
-- =============================================================================
CREATE TABLE IF NOT EXISTS "booking_channels" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "key" text NOT NULL UNIQUE,
  "name" text NOT NULL,
  "type" text NOT NULL DEFAULT 'ota'
    CHECK ("type" IN ('ota','direct','agent','social','corporate')),
  "commission_model" text CHECK ("commission_model" IS NULL OR "commission_model" IN ('percent','fixed','tiered','none')),
  "default_commission_pct" numeric(6,3),
  "status" text NOT NULL DEFAULT 'active' CHECK ("status" IN ('active','paused','archived')),
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS "guests" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "full_name" text NOT NULL,
  "email" text,
  "phone" text,
  "nationality" text,
  "preferred_language" text,
  "whatsapp" text,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "guests_email_idx" ON "guests" ("email");

CREATE TABLE IF NOT EXISTS "bookings" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "villa_id" uuid NOT NULL REFERENCES "villas"("id") ON DELETE RESTRICT,
  "guest_id" uuid REFERENCES "guests"("id") ON DELETE SET NULL,
  "channel_id" uuid REFERENCES "booking_channels"("id") ON DELETE SET NULL,
  "booking_code" text NOT NULL UNIQUE,
  "source_reference" text,
  "status" text NOT NULL DEFAULT 'confirmed'
    CHECK ("status" IN ('inquiry','tentative','confirmed','checked_in','checked_out','cancelled','no_show')),
  "check_in" date NOT NULL,
  "check_out" date NOT NULL CHECK ("check_out" > "check_in"),
  "nights" integer NOT NULL CHECK ("nights" > 0),
  "adults" integer,
  "children" integer,
  "currency" text NOT NULL DEFAULT 'USD',
  "gross_amount" numeric(14,2) NOT NULL CHECK ("gross_amount" >= 0),
  "cleaning_fee_amount" numeric(14,2) NOT NULL DEFAULT 0,
  "channel_fee_amount" numeric(14,2) NOT NULL DEFAULT 0,
  "payment_fee_amount" numeric(14,2) NOT NULL DEFAULT 0,
  "net_expected_amount" numeric(14,2),
  "notes" text,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "bookings_villa_idx" ON "bookings" ("villa_id","check_in");
CREATE INDEX IF NOT EXISTS "bookings_status_idx" ON "bookings" ("status");
CREATE INDEX IF NOT EXISTS "bookings_channel_idx" ON "bookings" ("channel_id");

-- =============================================================================
-- Documents · Audit
-- =============================================================================
CREATE TABLE IF NOT EXISTS "documents" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "title" text NOT NULL,
  "document_type" text NOT NULL,
  "entity_type" text NOT NULL,
  "entity_id" uuid NOT NULL,
  "storage_bucket" text,
  "storage_path" text,
  "file_name" text,
  "mime_type" text,
  "size_bytes" integer,
  "visibility" text NOT NULL DEFAULT 'internal'
    CHECK ("visibility" IN ('internal','owner','guest','public')),
  "uploaded_by" uuid REFERENCES "app_users"("id") ON DELETE SET NULL,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "documents_entity_idx" ON "documents" ("entity_type","entity_id");
CREATE INDEX IF NOT EXISTS "documents_type_idx" ON "documents" ("document_type");

CREATE TABLE IF NOT EXISTS "audit_events" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "actor_user_id" uuid REFERENCES "app_users"("id") ON DELETE SET NULL,
  "action" text NOT NULL,
  "entity_type" text NOT NULL,
  "entity_id" uuid,
  "before" jsonb,
  "after" jsonb,
  "metadata" jsonb,
  "ip_address" text,
  "user_agent" text,
  "created_at" timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "audit_events_entity_idx" ON "audit_events" ("entity_type","entity_id");
CREATE INDEX IF NOT EXISTS "audit_events_actor_idx" ON "audit_events" ("actor_user_id","created_at");
CREATE INDEX IF NOT EXISTS "audit_events_action_idx" ON "audit_events" ("action");

-- =============================================================================
-- updated_at triggers
-- =============================================================================
CREATE OR REPLACE FUNCTION set_updated_at() RETURNS trigger AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END
$$ LANGUAGE plpgsql;

DO $$
DECLARE t text;
BEGIN
  FOR t IN
    SELECT unnest(ARRAY[
      'app_users','projects','villas','owners','ownership_shares',
      'payout_methods','booking_channels','guests','bookings','documents'
    ])
  LOOP
    EXECUTE format(
      'DROP TRIGGER IF EXISTS trg_set_updated_at ON %I; '
      'CREATE TRIGGER trg_set_updated_at BEFORE UPDATE ON %I '
      'FOR EACH ROW EXECUTE FUNCTION set_updated_at();',
      t, t
    );
  END LOOP;
END $$;

-- =============================================================================
-- Row-Level Security — initial enablement + policy skeletons.
--
-- Strategy summary:
--   * Every tenant-scoped table has RLS enabled.
--   * v2 ships ONLY with explicit policies; absent a matching policy the
--     query is denied. The Supabase service-role bypasses RLS automatically
--     and is used by trusted server actions and migration tooling.
--   * `is_internal_user()` checks for any non-archived staff role on the
--     current auth.uid(). Owner / investor / guest scoping arrives in
--     subsequent migrations as those surfaces light up.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.is_internal_user() RETURNS boolean
LANGUAGE plpgsql STABLE SECURITY DEFINER AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1
      FROM public.app_users u
      JOIN public.user_roles ur ON ur.user_id = u.id
      JOIN public.roles r ON r.id = ur.role_id
     WHERE u.auth_user_id = auth.uid()
       AND u.status = 'active'
       AND r.key IN (
         'super_admin','director','operations_manager','property_manager',
         'finance_manager','accountant','concierge','housekeeping_supervisor',
         'procurement_manager','sales_manager'
       )
  );
EXCEPTION WHEN undefined_function THEN
  -- auth.uid() is unavailable outside a Supabase session (e.g. migrations).
  RETURN false;
END
$$;

DO $$
DECLARE t text;
BEGIN
  FOR t IN
    SELECT unnest(ARRAY[
      'app_users','roles','permissions','user_roles','role_permissions',
      'projects','villas','villa_status_events',
      'owners','ownership_shares','payout_methods',
      'booking_channels','guests','bookings',
      'documents','audit_events'
    ])
  LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY;', t);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY;', t);
  END LOOP;
END $$;

-- Internal staff: read-only baseline for now. Mutations go through the
-- service-role from server actions until owner/guest policies are authored.
DO $$
DECLARE t text;
BEGIN
  FOR t IN
    SELECT unnest(ARRAY[
      'projects','villas','villa_status_events',
      'owners','ownership_shares','payout_methods',
      'booking_channels','guests','bookings',
      'documents','audit_events'
    ])
  LOOP
    EXECUTE format(
      'DROP POLICY IF EXISTS internal_read ON %I; '
      'CREATE POLICY internal_read ON %I FOR SELECT '
      'USING (public.is_internal_user());',
      t, t
    );
  END LOOP;
END $$;

-- Identity tables: only Super Admin / Director can read directly. Everything
-- else goes through privileged server actions. Skeleton — refined later.
DROP POLICY IF EXISTS app_users_self_select ON app_users;
CREATE POLICY app_users_self_select ON app_users FOR SELECT
USING (auth_user_id = auth.uid() OR public.is_internal_user());

-- TODO(v3+):
--   * Owner / investor SELECT policies on projects, villas, ownership_shares,
--     bookings (PII redacted), payout_methods, documents (visibility='owner'),
--     scoped via ownership_shares.
--   * Guest SELECT policies via signed booking token.
--   * Per-action UPDATE / INSERT policies (currently routed via service-role).
--
-- Until those are in place, never grant the anon or authenticated roles
-- write access to these tables outside server actions.
