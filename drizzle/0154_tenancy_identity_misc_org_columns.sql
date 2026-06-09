-- =============================================================================
-- 0154 · TENANCY (Identity / Portal / Misc slice) — give the remaining org-less
--        IDENTITY, PORTAL, AI, SECURITY, WHATSAPP and MISC tables a nullable
--        `organization_id`, backfilled from their real parent + indexed.
--
-- SCOPE (this migration only): SCHEMA + BACKFILL + INDEX. It does NOT thread
-- organization_id into application queries and does NOT set the DB column to
-- NOT NULL. The column lands NULLABLE so the app layer can adopt it
-- incrementally (mirrors the NULLABLE tenancy style of 0150 / 0151 / 0152 —
-- general_ledger / owner_threads / guest_stay_tokens). Per
-- docs/DESIGN-SYSTEM-BUILD-PROMPT.md, unit `tenancy-rest-b`.
--
-- TABLES (verified org-less today; their parents already carry org):
--   access_grants ........ app_users_owners (app_user → app_users.org),
--                          app_users_investors (investor → investors.org)
--   ai_development ....... ai_construction_analyses (site_report → org),
--                          ai_investor_qa_drafts (investor → org),
--                          ai_distribution_suggestions (project → org),
--                          ai_document_extractions (document → org)
--   cabinet_definitions .. catalog-global table (NOT genuinely org-scoped — see
--                          note below); column added for schema uniformity and
--                          backfilled to ARCONIQUE_DEFAULT only.
--   company_structures ... project_company_structures (project → org),
--                          company_structure_shareholders (structure → ↑)
--   contacts ............. contacts (via contact_roles.scope_project → org),
--                          contact_roles (scope_project → org, else contact ↑),
--                          agents (contact → contacts.org), lead_sources (none),
--                          contact_interactions (project → org, else contact ↑)
--   ownership ............ ownership_shares (villa → project.org, else project)
--   guest_ai_concierge ... sessions (guest_stay_token → org), messages/runs
--                          (session ↑), handoffs (guest_stay_token → org),
--                          handoff_replies / reply_reads / reply_attachments
--                          (handoff ↑)
--   integrations ......... channel_calendar_feeds (villa → project.org),
--                          channel_calendar_events (feed ↑), booking_conflicts
--                          (villa → project.org), booking_automation_rules
--                          (project/villa → org), booking_automation_runs
--                          (booking → bookings.org), finance_material_usage_links
--                          (villa/project/booking → org)
--   onboarding_drafts .... director_user → app_users.org
--   owner_guest_preapprovals  villa → project.org (else owner share → org)
--   owner_intelligence ... guest_reviews (villa → project.org, else project),
--                          owner_calendar_preferences (owner share → org),
--                          villa_health_snapshots (villa → project.org, else
--                          project), owner_visible_events (villa/project/owner)
--   security ............. auth_mfa_factors / auth_mfa_recovery_codes (app_user
--                          → org), auth_login_attempts / auth_security_events
--                          (app_user → org where present), job_locks (infra)
--   whatsapp ............. whatsapp_phone_numbers (project → org), messages /
--                          templates / webhook_events (no clean local parent)
--   audit_events ......... actor_user → app_users.org
--
-- NOTE on cabinet_definitions: this is a PLATFORM-WIDE catalog (the schema
-- comment is explicit — every org sees the same cabinet set; visibility is by
-- role/plan, not tenant). It is not genuinely tenant-owned. We still add the
-- nullable column for schema uniformity per the unit spec, but it is only ever
-- backfilled to ARCONIQUE_DEFAULT and must NOT be threaded into reads.
--
-- NOTE on audit_events: the append-only audit log is mostly platform-global
-- (actor + entity span every tenant). We add the nullable column anyway —
-- backfilled from the actor's org — so future per-tenant audit filtering has a
-- local anchor; it is NOT threaded into writes/reads here.
--
-- NOTE on the security infra tables (auth_login_attempts, job_locks): these are
-- pre-auth / cron-coordination infrastructure that may legitimately carry no
-- org. Their column is added and backfilled best-effort (app_user org where a
-- user is known, else ARCONIQUE_DEFAULT); rows with no resolvable org simply
-- stay NULL.
--
-- BACKFILL: each table resolves its org from the real parent FK first, then any
-- row still NULL falls back to the single ARCONIQUE_DEFAULT seed org (the
-- platform is single-tenant today). If that org is absent (a bare env) the
-- column simply stays NULL — never fail.
--
-- Idempotent: ADD COLUMN IF NOT EXISTS + UPDATE … WHERE organization_id IS NULL
-- + CREATE INDEX IF NOT EXISTS. No NOT NULL anywhere. Safe to re-run.
-- =============================================================================

BEGIN;

-- ---------------------------------------------------------------------------
-- 1) ADD COLUMN (nullable, FK → organizations) on every target table.
-- ---------------------------------------------------------------------------

-- access_grants
ALTER TABLE app_users_owners               ADD COLUMN IF NOT EXISTS organization_id uuid REFERENCES organizations(id) ON DELETE RESTRICT;
ALTER TABLE app_users_investors            ADD COLUMN IF NOT EXISTS organization_id uuid REFERENCES organizations(id) ON DELETE RESTRICT;

-- ai_development
ALTER TABLE ai_construction_analyses       ADD COLUMN IF NOT EXISTS organization_id uuid REFERENCES organizations(id) ON DELETE RESTRICT;
ALTER TABLE ai_investor_qa_drafts          ADD COLUMN IF NOT EXISTS organization_id uuid REFERENCES organizations(id) ON DELETE RESTRICT;
ALTER TABLE ai_distribution_suggestions    ADD COLUMN IF NOT EXISTS organization_id uuid REFERENCES organizations(id) ON DELETE RESTRICT;
ALTER TABLE ai_document_extractions        ADD COLUMN IF NOT EXISTS organization_id uuid REFERENCES organizations(id) ON DELETE RESTRICT;

-- cabinet_definitions (catalog-global — column for uniformity only)
ALTER TABLE cabinet_definitions            ADD COLUMN IF NOT EXISTS organization_id uuid REFERENCES organizations(id) ON DELETE RESTRICT;

-- company_structures
ALTER TABLE project_company_structures     ADD COLUMN IF NOT EXISTS organization_id uuid REFERENCES organizations(id) ON DELETE RESTRICT;
ALTER TABLE company_structure_shareholders ADD COLUMN IF NOT EXISTS organization_id uuid REFERENCES organizations(id) ON DELETE RESTRICT;

-- contacts
ALTER TABLE contacts                       ADD COLUMN IF NOT EXISTS organization_id uuid REFERENCES organizations(id) ON DELETE RESTRICT;
ALTER TABLE contact_roles                  ADD COLUMN IF NOT EXISTS organization_id uuid REFERENCES organizations(id) ON DELETE RESTRICT;
ALTER TABLE agents                         ADD COLUMN IF NOT EXISTS organization_id uuid REFERENCES organizations(id) ON DELETE RESTRICT;
ALTER TABLE lead_sources                   ADD COLUMN IF NOT EXISTS organization_id uuid REFERENCES organizations(id) ON DELETE RESTRICT;
ALTER TABLE contact_interactions           ADD COLUMN IF NOT EXISTS organization_id uuid REFERENCES organizations(id) ON DELETE RESTRICT;

-- ownership
ALTER TABLE ownership_shares               ADD COLUMN IF NOT EXISTS organization_id uuid REFERENCES organizations(id) ON DELETE RESTRICT;

-- guest_ai_concierge
ALTER TABLE guest_ai_concierge_sessions          ADD COLUMN IF NOT EXISTS organization_id uuid REFERENCES organizations(id) ON DELETE RESTRICT;
ALTER TABLE guest_ai_concierge_messages          ADD COLUMN IF NOT EXISTS organization_id uuid REFERENCES organizations(id) ON DELETE RESTRICT;
ALTER TABLE guest_ai_concierge_runs              ADD COLUMN IF NOT EXISTS organization_id uuid REFERENCES organizations(id) ON DELETE RESTRICT;
ALTER TABLE guest_ai_handoffs                    ADD COLUMN IF NOT EXISTS organization_id uuid REFERENCES organizations(id) ON DELETE RESTRICT;
ALTER TABLE guest_ai_handoff_replies             ADD COLUMN IF NOT EXISTS organization_id uuid REFERENCES organizations(id) ON DELETE RESTRICT;
ALTER TABLE guest_ai_handoff_reply_reads         ADD COLUMN IF NOT EXISTS organization_id uuid REFERENCES organizations(id) ON DELETE RESTRICT;
ALTER TABLE guest_ai_handoff_reply_attachments   ADD COLUMN IF NOT EXISTS organization_id uuid REFERENCES organizations(id) ON DELETE RESTRICT;

-- integrations
ALTER TABLE channel_calendar_feeds         ADD COLUMN IF NOT EXISTS organization_id uuid REFERENCES organizations(id) ON DELETE RESTRICT;
ALTER TABLE channel_calendar_events        ADD COLUMN IF NOT EXISTS organization_id uuid REFERENCES organizations(id) ON DELETE RESTRICT;
ALTER TABLE booking_conflicts              ADD COLUMN IF NOT EXISTS organization_id uuid REFERENCES organizations(id) ON DELETE RESTRICT;
ALTER TABLE booking_automation_rules       ADD COLUMN IF NOT EXISTS organization_id uuid REFERENCES organizations(id) ON DELETE RESTRICT;
ALTER TABLE booking_automation_runs        ADD COLUMN IF NOT EXISTS organization_id uuid REFERENCES organizations(id) ON DELETE RESTRICT;
ALTER TABLE finance_material_usage_links   ADD COLUMN IF NOT EXISTS organization_id uuid REFERENCES organizations(id) ON DELETE RESTRICT;

-- onboarding_drafts
ALTER TABLE onboarding_drafts              ADD COLUMN IF NOT EXISTS organization_id uuid REFERENCES organizations(id) ON DELETE RESTRICT;

-- owner_guest_preapprovals
ALTER TABLE owner_guest_preapprovals       ADD COLUMN IF NOT EXISTS organization_id uuid REFERENCES organizations(id) ON DELETE RESTRICT;

-- owner_intelligence
ALTER TABLE guest_reviews                  ADD COLUMN IF NOT EXISTS organization_id uuid REFERENCES organizations(id) ON DELETE RESTRICT;
ALTER TABLE owner_calendar_preferences     ADD COLUMN IF NOT EXISTS organization_id uuid REFERENCES organizations(id) ON DELETE RESTRICT;
ALTER TABLE villa_health_snapshots         ADD COLUMN IF NOT EXISTS organization_id uuid REFERENCES organizations(id) ON DELETE RESTRICT;
ALTER TABLE owner_visible_events           ADD COLUMN IF NOT EXISTS organization_id uuid REFERENCES organizations(id) ON DELETE RESTRICT;

-- security
ALTER TABLE auth_mfa_factors               ADD COLUMN IF NOT EXISTS organization_id uuid REFERENCES organizations(id) ON DELETE RESTRICT;
ALTER TABLE auth_mfa_recovery_codes        ADD COLUMN IF NOT EXISTS organization_id uuid REFERENCES organizations(id) ON DELETE RESTRICT;
ALTER TABLE auth_login_attempts            ADD COLUMN IF NOT EXISTS organization_id uuid REFERENCES organizations(id) ON DELETE RESTRICT;
ALTER TABLE auth_security_events           ADD COLUMN IF NOT EXISTS organization_id uuid REFERENCES organizations(id) ON DELETE RESTRICT;
ALTER TABLE job_locks                      ADD COLUMN IF NOT EXISTS organization_id uuid REFERENCES organizations(id) ON DELETE RESTRICT;

-- whatsapp
ALTER TABLE whatsapp_phone_numbers         ADD COLUMN IF NOT EXISTS organization_id uuid REFERENCES organizations(id) ON DELETE RESTRICT;
ALTER TABLE whatsapp_messages              ADD COLUMN IF NOT EXISTS organization_id uuid REFERENCES organizations(id) ON DELETE RESTRICT;
ALTER TABLE whatsapp_message_templates     ADD COLUMN IF NOT EXISTS organization_id uuid REFERENCES organizations(id) ON DELETE RESTRICT;
ALTER TABLE whatsapp_webhook_events        ADD COLUMN IF NOT EXISTS organization_id uuid REFERENCES organizations(id) ON DELETE RESTRICT;

-- audit
ALTER TABLE audit_events                   ADD COLUMN IF NOT EXISTS organization_id uuid REFERENCES organizations(id) ON DELETE RESTRICT;

-- ---------------------------------------------------------------------------
-- 2) BACKFILL from the real parent FK (only rows still NULL).
-- ---------------------------------------------------------------------------

-- === access_grants =========================================================
-- app_users_owners → app_user.organization_id (app_user_id NOT NULL).
UPDATE app_users_owners t
   SET organization_id = au.organization_id
  FROM app_users au
 WHERE au.id = t.app_user_id
   AND t.organization_id IS NULL;

-- app_users_investors → investor.organization_id (investor_id NOT NULL).
UPDATE app_users_investors t
   SET organization_id = i.organization_id
  FROM investors i
 WHERE i.id = t.investor_id
   AND t.organization_id IS NULL;

-- === ai_development ========================================================
UPDATE ai_construction_analyses t
   SET organization_id = sr.organization_id
  FROM site_reports sr
 WHERE sr.id = t.site_report_id
   AND t.organization_id IS NULL;

UPDATE ai_investor_qa_drafts t
   SET organization_id = i.organization_id
  FROM investors i
 WHERE i.id = t.investor_id
   AND t.organization_id IS NULL;

UPDATE ai_distribution_suggestions t
   SET organization_id = p.organization_id
  FROM projects p
 WHERE p.id = t.project_id
   AND t.organization_id IS NULL;

UPDATE ai_document_extractions t
   SET organization_id = d.organization_id
  FROM documents d
 WHERE d.id = t.document_id
   AND t.organization_id IS NULL;

-- === company_structures ====================================================
UPDATE project_company_structures t
   SET organization_id = p.organization_id
  FROM projects p
 WHERE p.id = t.project_id
   AND t.organization_id IS NULL;

UPDATE company_structure_shareholders t
   SET organization_id = pcs.organization_id
  FROM project_company_structures pcs
 WHERE pcs.id = t.structure_id
   AND t.organization_id IS NULL;

-- === contacts ==============================================================
-- contact_roles first: a project-scoped role anchors directly on its project.
UPDATE contact_roles t
   SET organization_id = p.organization_id
  FROM projects p
 WHERE p.id = t.scope_project_id
   AND t.organization_id IS NULL;

-- contacts: resolve via any project-scoped role the contact holds (one org per
-- contact, deterministic). A contact with only global roles stays NULL → default.
WITH contact_org AS (
  SELECT DISTINCT ON (cr.contact_id)
         cr.contact_id,
         p.organization_id
    FROM contact_roles cr
    JOIN projects p ON p.id = cr.scope_project_id
   WHERE p.organization_id IS NOT NULL
   ORDER BY cr.contact_id, cr.created_at
)
UPDATE contacts t
   SET organization_id = co.organization_id
  FROM contact_org co
 WHERE co.contact_id = t.id
   AND t.organization_id IS NULL;

-- contact_roles still NULL (global-scope roles) → the contact's resolved org.
UPDATE contact_roles t
   SET organization_id = c.organization_id
  FROM contacts c
 WHERE c.id = t.contact_id
   AND t.organization_id IS NULL
   AND c.organization_id IS NOT NULL;

-- agents → contact.organization_id (contact_id NOT NULL, unique).
UPDATE agents t
   SET organization_id = c.organization_id
  FROM contacts c
 WHERE c.id = t.contact_id
   AND t.organization_id IS NULL
   AND c.organization_id IS NOT NULL;

-- contact_interactions → project first, else the contact's resolved org.
UPDATE contact_interactions t
   SET organization_id = p.organization_id
  FROM projects p
 WHERE p.id = t.project_id
   AND t.organization_id IS NULL;
UPDATE contact_interactions t
   SET organization_id = c.organization_id
  FROM contacts c
 WHERE c.id = t.contact_id
   AND t.organization_id IS NULL
   AND c.organization_id IS NOT NULL;

-- lead_sources: no tenant parent → handled by the default-org sweep below.

-- === ownership_shares ======================================================
-- villa → project.organization_id, else the share's own project_id.
UPDATE ownership_shares t
   SET organization_id = vp.organization_id
  FROM villas v
  JOIN projects vp ON vp.id = v.project_id
 WHERE v.id = t.villa_id
   AND t.organization_id IS NULL;
UPDATE ownership_shares t
   SET organization_id = p.organization_id
  FROM projects p
 WHERE p.id = t.project_id
   AND t.organization_id IS NULL;

-- === guest_ai_concierge ====================================================
-- sessions → guest_stay_token.organization_id.
UPDATE guest_ai_concierge_sessions t
   SET organization_id = gst.organization_id
  FROM guest_stay_tokens gst
 WHERE gst.id = t.guest_stay_token_id
   AND t.organization_id IS NULL;

-- messages / runs → session.organization_id.
UPDATE guest_ai_concierge_messages t
   SET organization_id = s.organization_id
  FROM guest_ai_concierge_sessions s
 WHERE s.id = t.session_id
   AND t.organization_id IS NULL;
UPDATE guest_ai_concierge_runs t
   SET organization_id = s.organization_id
  FROM guest_ai_concierge_sessions s
 WHERE s.id = t.session_id
   AND t.organization_id IS NULL;

-- handoffs → guest_stay_token.organization_id.
UPDATE guest_ai_handoffs t
   SET organization_id = gst.organization_id
  FROM guest_stay_tokens gst
 WHERE gst.id = t.guest_stay_token_id
   AND t.organization_id IS NULL;

-- replies / reads / attachments → handoff.organization_id.
UPDATE guest_ai_handoff_replies t
   SET organization_id = h.organization_id
  FROM guest_ai_handoffs h
 WHERE h.id = t.handoff_id
   AND t.organization_id IS NULL;
UPDATE guest_ai_handoff_reply_reads t
   SET organization_id = h.organization_id
  FROM guest_ai_handoffs h
 WHERE h.id = t.handoff_id
   AND t.organization_id IS NULL;
UPDATE guest_ai_handoff_reply_attachments t
   SET organization_id = h.organization_id
  FROM guest_ai_handoffs h
 WHERE h.id = t.handoff_id
   AND t.organization_id IS NULL;

-- === integrations ==========================================================
-- channel_calendar_feeds → villa → project.org (villa_id NOT NULL).
UPDATE channel_calendar_feeds t
   SET organization_id = vp.organization_id
  FROM villas v
  JOIN projects vp ON vp.id = v.project_id
 WHERE v.id = t.villa_id
   AND t.organization_id IS NULL;
-- fall back to the feed's own project_id where the villa join missed.
UPDATE channel_calendar_feeds t
   SET organization_id = p.organization_id
  FROM projects p
 WHERE p.id = t.project_id
   AND t.organization_id IS NULL;

-- channel_calendar_events → feed.organization_id.
UPDATE channel_calendar_events t
   SET organization_id = f.organization_id
  FROM channel_calendar_feeds f
 WHERE f.id = t.feed_id
   AND t.organization_id IS NULL;

-- booking_conflicts → villa → project.org (villa_id NOT NULL).
UPDATE booking_conflicts t
   SET organization_id = vp.organization_id
  FROM villas v
  JOIN projects vp ON vp.id = v.project_id
 WHERE v.id = t.villa_id
   AND t.organization_id IS NULL;

-- booking_automation_rules → project_id first, else villa → project.
UPDATE booking_automation_rules t
   SET organization_id = p.organization_id
  FROM projects p
 WHERE p.id = t.project_id
   AND t.organization_id IS NULL;
UPDATE booking_automation_rules t
   SET organization_id = vp.organization_id
  FROM villas v
  JOIN projects vp ON vp.id = v.project_id
 WHERE v.id = t.villa_id
   AND t.organization_id IS NULL;

-- booking_automation_runs → booking.organization_id (booking_id NOT NULL).
UPDATE booking_automation_runs t
   SET organization_id = b.organization_id
  FROM bookings b
 WHERE b.id = t.booking_id
   AND t.organization_id IS NULL
   AND b.organization_id IS NOT NULL;

-- finance_material_usage_links → villa → project, else project, else booking.
UPDATE finance_material_usage_links t
   SET organization_id = vp.organization_id
  FROM villas v
  JOIN projects vp ON vp.id = v.project_id
 WHERE v.id = t.villa_id
   AND t.organization_id IS NULL;
UPDATE finance_material_usage_links t
   SET organization_id = p.organization_id
  FROM projects p
 WHERE p.id = t.project_id
   AND t.organization_id IS NULL;
UPDATE finance_material_usage_links t
   SET organization_id = b.organization_id
  FROM bookings b
 WHERE b.id = t.booking_id
   AND t.organization_id IS NULL
   AND b.organization_id IS NOT NULL;

-- === onboarding_drafts =====================================================
UPDATE onboarding_drafts t
   SET organization_id = au.organization_id
  FROM app_users au
 WHERE au.id = t.director_user_id
   AND t.organization_id IS NULL;

-- === owner_guest_preapprovals ==============================================
-- villa → project.org (villa_id NOT NULL); else the owner's share org.
UPDATE owner_guest_preapprovals t
   SET organization_id = vp.organization_id
  FROM villas v
  JOIN projects vp ON vp.id = v.project_id
 WHERE v.id = t.villa_id
   AND t.organization_id IS NULL;
WITH owner_org AS (
  SELECT DISTINCT ON (os.owner_id)
         os.owner_id,
         COALESCE(vp.organization_id, pp.organization_id) AS organization_id
    FROM ownership_shares os
    LEFT JOIN villas   v  ON v.id  = os.villa_id
    LEFT JOIN projects vp ON vp.id = v.project_id
    LEFT JOIN projects pp ON pp.id = os.project_id
   WHERE COALESCE(vp.organization_id, pp.organization_id) IS NOT NULL
   ORDER BY os.owner_id, os.created_at
)
UPDATE owner_guest_preapprovals t
   SET organization_id = oo.organization_id
  FROM owner_org oo
 WHERE oo.owner_id = t.owner_id
   AND t.organization_id IS NULL;

-- === owner_intelligence ====================================================
-- guest_reviews → villa → project.org, else direct project_id.
UPDATE guest_reviews t
   SET organization_id = vp.organization_id
  FROM villas v
  JOIN projects vp ON vp.id = v.project_id
 WHERE v.id = t.villa_id
   AND t.organization_id IS NULL;
UPDATE guest_reviews t
   SET organization_id = p.organization_id
  FROM projects p
 WHERE p.id = t.project_id
   AND t.organization_id IS NULL;

-- owner_calendar_preferences → owner's share org (owner_id NOT NULL).
WITH owner_org AS (
  SELECT DISTINCT ON (os.owner_id)
         os.owner_id,
         COALESCE(vp.organization_id, pp.organization_id) AS organization_id
    FROM ownership_shares os
    LEFT JOIN villas   v  ON v.id  = os.villa_id
    LEFT JOIN projects vp ON vp.id = v.project_id
    LEFT JOIN projects pp ON pp.id = os.project_id
   WHERE COALESCE(vp.organization_id, pp.organization_id) IS NOT NULL
   ORDER BY os.owner_id, os.created_at
)
UPDATE owner_calendar_preferences t
   SET organization_id = oo.organization_id
  FROM owner_org oo
 WHERE oo.owner_id = t.owner_id
   AND t.organization_id IS NULL;

-- villa_health_snapshots → villa → project.org, else direct project_id.
UPDATE villa_health_snapshots t
   SET organization_id = vp.organization_id
  FROM villas v
  JOIN projects vp ON vp.id = v.project_id
 WHERE v.id = t.villa_id
   AND t.organization_id IS NULL;
UPDATE villa_health_snapshots t
   SET organization_id = p.organization_id
  FROM projects p
 WHERE p.id = t.project_id
   AND t.organization_id IS NULL;

-- owner_visible_events → villa → project.org, else project_id, else owner share.
UPDATE owner_visible_events t
   SET organization_id = vp.organization_id
  FROM villas v
  JOIN projects vp ON vp.id = v.project_id
 WHERE v.id = t.villa_id
   AND t.organization_id IS NULL;
UPDATE owner_visible_events t
   SET organization_id = p.organization_id
  FROM projects p
 WHERE p.id = t.project_id
   AND t.organization_id IS NULL;
WITH owner_org AS (
  SELECT DISTINCT ON (os.owner_id)
         os.owner_id,
         COALESCE(vp.organization_id, pp.organization_id) AS organization_id
    FROM ownership_shares os
    LEFT JOIN villas   v  ON v.id  = os.villa_id
    LEFT JOIN projects vp ON vp.id = v.project_id
    LEFT JOIN projects pp ON pp.id = os.project_id
   WHERE COALESCE(vp.organization_id, pp.organization_id) IS NOT NULL
   ORDER BY os.owner_id, os.created_at
)
UPDATE owner_visible_events t
   SET organization_id = oo.organization_id
  FROM owner_org oo
 WHERE oo.owner_id = t.owner_id
   AND t.organization_id IS NULL;

-- === security ==============================================================
-- MFA tables → app_user.organization_id (app_user_id NOT NULL).
UPDATE auth_mfa_factors t
   SET organization_id = au.organization_id
  FROM app_users au
 WHERE au.id = t.app_user_id
   AND t.organization_id IS NULL;
UPDATE auth_mfa_recovery_codes t
   SET organization_id = au.organization_id
  FROM app_users au
 WHERE au.id = t.app_user_id
   AND t.organization_id IS NULL;

-- login attempts / security events → app_user org WHERE a user is known.
UPDATE auth_login_attempts t
   SET organization_id = au.organization_id
  FROM app_users au
 WHERE au.id = t.app_user_id
   AND t.organization_id IS NULL;
UPDATE auth_security_events t
   SET organization_id = au.organization_id
  FROM app_users au
 WHERE au.id = t.app_user_id
   AND t.organization_id IS NULL;
-- job_locks: pure cron infra → only the default-org sweep below.

-- === whatsapp ==============================================================
-- whatsapp_phone_numbers → project.organization_id where a project is linked.
UPDATE whatsapp_phone_numbers t
   SET organization_id = p.organization_id
  FROM projects p
 WHERE p.id = t.project_id
   AND t.organization_id IS NULL;
-- whatsapp_messages / templates / webhook_events have no clean local parent →
-- default-org sweep below.

-- === audit_events ==========================================================
-- actor_user → app_users.organization_id where an actor is recorded.
UPDATE audit_events t
   SET organization_id = au.organization_id
  FROM app_users au
 WHERE au.id = t.actor_user_id
   AND t.organization_id IS NULL;

-- ---------------------------------------------------------------------------
-- 3) DEFAULT-ORG sweep — anything the parent chain could not resolve (global
--    contacts, lead_sources, job_locks, parentless whatsapp rows, an env whose
--    parents predate org tenancy, cabinet_definitions) → ARCONIQUE_DEFAULT.
--    If that org is absent the column simply stays NULL (never fail).
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  default_org_id uuid;
BEGIN
  SELECT id INTO default_org_id
    FROM organizations
   WHERE organization_code = 'ARCONIQUE_DEFAULT'
   LIMIT 1;

  IF default_org_id IS NOT NULL THEN
    UPDATE app_users_owners                    SET organization_id = default_org_id WHERE organization_id IS NULL;
    UPDATE app_users_investors                 SET organization_id = default_org_id WHERE organization_id IS NULL;
    UPDATE ai_construction_analyses            SET organization_id = default_org_id WHERE organization_id IS NULL;
    UPDATE ai_investor_qa_drafts               SET organization_id = default_org_id WHERE organization_id IS NULL;
    UPDATE ai_distribution_suggestions         SET organization_id = default_org_id WHERE organization_id IS NULL;
    UPDATE ai_document_extractions             SET organization_id = default_org_id WHERE organization_id IS NULL;
    UPDATE cabinet_definitions                 SET organization_id = default_org_id WHERE organization_id IS NULL;
    UPDATE project_company_structures          SET organization_id = default_org_id WHERE organization_id IS NULL;
    UPDATE company_structure_shareholders      SET organization_id = default_org_id WHERE organization_id IS NULL;
    UPDATE contacts                            SET organization_id = default_org_id WHERE organization_id IS NULL;
    UPDATE contact_roles                       SET organization_id = default_org_id WHERE organization_id IS NULL;
    UPDATE agents                              SET organization_id = default_org_id WHERE organization_id IS NULL;
    UPDATE lead_sources                        SET organization_id = default_org_id WHERE organization_id IS NULL;
    UPDATE contact_interactions                SET organization_id = default_org_id WHERE organization_id IS NULL;
    UPDATE ownership_shares                    SET organization_id = default_org_id WHERE organization_id IS NULL;
    UPDATE guest_ai_concierge_sessions         SET organization_id = default_org_id WHERE organization_id IS NULL;
    UPDATE guest_ai_concierge_messages         SET organization_id = default_org_id WHERE organization_id IS NULL;
    UPDATE guest_ai_concierge_runs             SET organization_id = default_org_id WHERE organization_id IS NULL;
    UPDATE guest_ai_handoffs                   SET organization_id = default_org_id WHERE organization_id IS NULL;
    UPDATE guest_ai_handoff_replies            SET organization_id = default_org_id WHERE organization_id IS NULL;
    UPDATE guest_ai_handoff_reply_reads        SET organization_id = default_org_id WHERE organization_id IS NULL;
    UPDATE guest_ai_handoff_reply_attachments  SET organization_id = default_org_id WHERE organization_id IS NULL;
    UPDATE channel_calendar_feeds              SET organization_id = default_org_id WHERE organization_id IS NULL;
    UPDATE channel_calendar_events             SET organization_id = default_org_id WHERE organization_id IS NULL;
    UPDATE booking_conflicts                   SET organization_id = default_org_id WHERE organization_id IS NULL;
    UPDATE booking_automation_rules            SET organization_id = default_org_id WHERE organization_id IS NULL;
    UPDATE booking_automation_runs             SET organization_id = default_org_id WHERE organization_id IS NULL;
    UPDATE finance_material_usage_links        SET organization_id = default_org_id WHERE organization_id IS NULL;
    UPDATE onboarding_drafts                   SET organization_id = default_org_id WHERE organization_id IS NULL;
    UPDATE owner_guest_preapprovals            SET organization_id = default_org_id WHERE organization_id IS NULL;
    UPDATE guest_reviews                       SET organization_id = default_org_id WHERE organization_id IS NULL;
    UPDATE owner_calendar_preferences          SET organization_id = default_org_id WHERE organization_id IS NULL;
    UPDATE villa_health_snapshots              SET organization_id = default_org_id WHERE organization_id IS NULL;
    UPDATE owner_visible_events                SET organization_id = default_org_id WHERE organization_id IS NULL;
    UPDATE auth_mfa_factors                    SET organization_id = default_org_id WHERE organization_id IS NULL;
    UPDATE auth_mfa_recovery_codes             SET organization_id = default_org_id WHERE organization_id IS NULL;
    UPDATE auth_login_attempts                 SET organization_id = default_org_id WHERE organization_id IS NULL;
    UPDATE auth_security_events                SET organization_id = default_org_id WHERE organization_id IS NULL;
    UPDATE job_locks                           SET organization_id = default_org_id WHERE organization_id IS NULL;
    UPDATE whatsapp_phone_numbers              SET organization_id = default_org_id WHERE organization_id IS NULL;
    UPDATE whatsapp_messages                   SET organization_id = default_org_id WHERE organization_id IS NULL;
    UPDATE whatsapp_message_templates          SET organization_id = default_org_id WHERE organization_id IS NULL;
    UPDATE whatsapp_webhook_events             SET organization_id = default_org_id WHERE organization_id IS NULL;
    UPDATE audit_events                        SET organization_id = default_org_id WHERE organization_id IS NULL;
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- 4) INDEXES — one per table, names match the schema-file index definitions.
-- ---------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS app_users_owners_organization_idx                    ON app_users_owners(organization_id);
CREATE INDEX IF NOT EXISTS app_users_investors_organization_idx                 ON app_users_investors(organization_id);
CREATE INDEX IF NOT EXISTS ai_construction_analyses_organization_idx            ON ai_construction_analyses(organization_id);
CREATE INDEX IF NOT EXISTS ai_investor_qa_drafts_organization_idx               ON ai_investor_qa_drafts(organization_id);
CREATE INDEX IF NOT EXISTS ai_distribution_suggestions_organization_idx         ON ai_distribution_suggestions(organization_id);
CREATE INDEX IF NOT EXISTS ai_document_extractions_organization_idx             ON ai_document_extractions(organization_id);
CREATE INDEX IF NOT EXISTS cabinet_definitions_organization_idx                 ON cabinet_definitions(organization_id);
CREATE INDEX IF NOT EXISTS project_company_structures_organization_idx          ON project_company_structures(organization_id);
CREATE INDEX IF NOT EXISTS company_structure_shareholders_organization_idx      ON company_structure_shareholders(organization_id);
CREATE INDEX IF NOT EXISTS contacts_organization_idx                            ON contacts(organization_id);
CREATE INDEX IF NOT EXISTS contact_roles_organization_idx                       ON contact_roles(organization_id);
CREATE INDEX IF NOT EXISTS agents_organization_idx                              ON agents(organization_id);
CREATE INDEX IF NOT EXISTS lead_sources_organization_idx                        ON lead_sources(organization_id);
CREATE INDEX IF NOT EXISTS contact_interactions_organization_idx                ON contact_interactions(organization_id);
CREATE INDEX IF NOT EXISTS ownership_shares_organization_idx                    ON ownership_shares(organization_id);
CREATE INDEX IF NOT EXISTS guest_ai_concierge_sessions_organization_idx         ON guest_ai_concierge_sessions(organization_id);
CREATE INDEX IF NOT EXISTS guest_ai_concierge_messages_organization_idx         ON guest_ai_concierge_messages(organization_id);
CREATE INDEX IF NOT EXISTS guest_ai_concierge_runs_organization_idx             ON guest_ai_concierge_runs(organization_id);
CREATE INDEX IF NOT EXISTS guest_ai_handoffs_organization_idx                   ON guest_ai_handoffs(organization_id);
CREATE INDEX IF NOT EXISTS guest_ai_handoff_replies_organization_idx            ON guest_ai_handoff_replies(organization_id);
CREATE INDEX IF NOT EXISTS guest_ai_handoff_reply_reads_organization_idx        ON guest_ai_handoff_reply_reads(organization_id);
CREATE INDEX IF NOT EXISTS guest_ai_handoff_reply_attachments_organization_idx  ON guest_ai_handoff_reply_attachments(organization_id);
CREATE INDEX IF NOT EXISTS channel_calendar_feeds_organization_idx              ON channel_calendar_feeds(organization_id);
CREATE INDEX IF NOT EXISTS channel_calendar_events_organization_idx             ON channel_calendar_events(organization_id);
CREATE INDEX IF NOT EXISTS booking_conflicts_organization_idx                   ON booking_conflicts(organization_id);
CREATE INDEX IF NOT EXISTS booking_automation_rules_organization_idx            ON booking_automation_rules(organization_id);
CREATE INDEX IF NOT EXISTS booking_automation_runs_organization_idx             ON booking_automation_runs(organization_id);
CREATE INDEX IF NOT EXISTS finance_material_usage_links_organization_idx        ON finance_material_usage_links(organization_id);
CREATE INDEX IF NOT EXISTS onboarding_drafts_organization_idx                   ON onboarding_drafts(organization_id);
CREATE INDEX IF NOT EXISTS owner_guest_preapprovals_organization_idx            ON owner_guest_preapprovals(organization_id);
CREATE INDEX IF NOT EXISTS guest_reviews_organization_idx                       ON guest_reviews(organization_id);
CREATE INDEX IF NOT EXISTS owner_calendar_preferences_organization_idx          ON owner_calendar_preferences(organization_id);
CREATE INDEX IF NOT EXISTS villa_health_snapshots_organization_idx              ON villa_health_snapshots(organization_id);
CREATE INDEX IF NOT EXISTS owner_visible_events_organization_idx                ON owner_visible_events(organization_id);
CREATE INDEX IF NOT EXISTS auth_mfa_factors_organization_idx                    ON auth_mfa_factors(organization_id);
CREATE INDEX IF NOT EXISTS auth_mfa_recovery_codes_organization_idx             ON auth_mfa_recovery_codes(organization_id);
CREATE INDEX IF NOT EXISTS auth_login_attempts_organization_idx                 ON auth_login_attempts(organization_id);
CREATE INDEX IF NOT EXISTS auth_security_events_organization_idx                ON auth_security_events(organization_id);
CREATE INDEX IF NOT EXISTS job_locks_organization_idx                           ON job_locks(organization_id);
CREATE INDEX IF NOT EXISTS whatsapp_phone_numbers_organization_idx              ON whatsapp_phone_numbers(organization_id);
CREATE INDEX IF NOT EXISTS whatsapp_messages_organization_idx                   ON whatsapp_messages(organization_id);
CREATE INDEX IF NOT EXISTS whatsapp_message_templates_organization_idx          ON whatsapp_message_templates(organization_id);
CREATE INDEX IF NOT EXISTS whatsapp_webhook_events_organization_idx             ON whatsapp_webhook_events(organization_id);
CREATE INDEX IF NOT EXISTS audit_events_organization_idx                        ON audit_events(organization_id);

COMMIT;
