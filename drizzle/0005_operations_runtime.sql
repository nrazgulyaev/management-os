-- Arconique Management OS — Migration 0005
-- Operations Runtime: tasks, checklists, maintenance tickets, preventive
-- schedules, attachments metadata, damage reports, service requests.
-- Idempotent on re-run.

BEGIN;

-- =============================================================================
-- 1) operation_task_types — catalog of operational task templates
-- =============================================================================
CREATE TABLE IF NOT EXISTS "operation_task_types" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "key" text NOT NULL UNIQUE,
  "name" text NOT NULL,
  "category" text NOT NULL
    CHECK ("category" IN ('housekeeping','maintenance','inspection','guest_request','procurement','admin')),
  "description" text,
  "default_priority" text NOT NULL DEFAULT 'normal'
    CHECK ("default_priority" IN ('low','normal','high','urgent')),
  "default_sla_minutes" integer,
  "is_system" boolean NOT NULL DEFAULT false,
  "status" text NOT NULL DEFAULT 'active'
    CHECK ("status" IN ('active','archived')),
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now()
);

DROP TRIGGER IF EXISTS trg_set_updated_at ON "operation_task_types";
CREATE TRIGGER trg_set_updated_at BEFORE UPDATE ON "operation_task_types"
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- =============================================================================
-- 2) operation_tasks — the unified task ledger
-- =============================================================================
CREATE TABLE IF NOT EXISTS "operation_tasks" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "task_code" text NOT NULL UNIQUE,
  "task_type_id" uuid REFERENCES "operation_task_types"("id") ON DELETE SET NULL,
  "villa_id" uuid REFERENCES "villas"("id") ON DELETE SET NULL,
  "project_id" uuid REFERENCES "projects"("id") ON DELETE SET NULL,
  "booking_id" uuid REFERENCES "bookings"("id") ON DELETE SET NULL,
  "guest_id" uuid REFERENCES "guests"("id") ON DELETE SET NULL,
  "title" text NOT NULL,
  "description" text,
  "category" text NOT NULL
    CHECK ("category" IN ('housekeeping','maintenance','inspection','guest_request','procurement','admin')),
  "priority" text NOT NULL DEFAULT 'normal'
    CHECK ("priority" IN ('low','normal','high','urgent')),
  "status" text NOT NULL DEFAULT 'open'
    CHECK ("status" IN ('open','scheduled','in_progress','blocked','completed','cancelled','needs_review','approved')),
  "source" text NOT NULL DEFAULT 'manual'
    CHECK ("source" IN ('manual','booking','guest','preventive','inspection','system')),
  "due_at" timestamptz,
  "scheduled_for" date,
  "started_at" timestamptz,
  "completed_at" timestamptz,
  "approved_at" timestamptz,
  "cancelled_at" timestamptz,
  "created_by" uuid REFERENCES "app_users"("id") ON DELETE SET NULL,
  "assigned_to" uuid REFERENCES "app_users"("id") ON DELETE SET NULL,
  "approved_by" uuid REFERENCES "app_users"("id") ON DELETE SET NULL,
  "estimated_minutes" integer,
  "actual_minutes" integer,
  "internal_notes" text,
  "owner_visible" boolean NOT NULL DEFAULT false,
  "guest_visible" boolean NOT NULL DEFAULT false,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "operation_tasks_status_idx"        ON "operation_tasks" ("status");
CREATE INDEX IF NOT EXISTS "operation_tasks_category_idx"      ON "operation_tasks" ("category");
CREATE INDEX IF NOT EXISTS "operation_tasks_villa_idx"         ON "operation_tasks" ("villa_id");
CREATE INDEX IF NOT EXISTS "operation_tasks_project_idx"       ON "operation_tasks" ("project_id");
CREATE INDEX IF NOT EXISTS "operation_tasks_assigned_idx"      ON "operation_tasks" ("assigned_to");
CREATE INDEX IF NOT EXISTS "operation_tasks_scheduled_idx"     ON "operation_tasks" ("scheduled_for");
CREATE INDEX IF NOT EXISTS "operation_tasks_due_idx"           ON "operation_tasks" ("due_at");
CREATE INDEX IF NOT EXISTS "operation_tasks_priority_idx"      ON "operation_tasks" ("priority");

DROP TRIGGER IF EXISTS trg_set_updated_at ON "operation_tasks";
CREATE TRIGGER trg_set_updated_at BEFORE UPDATE ON "operation_tasks"
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- =============================================================================
-- 3) checklist_templates + checklist_template_items
-- =============================================================================
CREATE TABLE IF NOT EXISTS "checklist_templates" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "key" text NOT NULL UNIQUE,
  "name" text NOT NULL,
  "category" text NOT NULL,
  "description" text,
  "villa_type" text,
  "status" text NOT NULL DEFAULT 'active'
    CHECK ("status" IN ('active','archived')),
  "is_system" boolean NOT NULL DEFAULT false,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now()
);

DROP TRIGGER IF EXISTS trg_set_updated_at ON "checklist_templates";
CREATE TRIGGER trg_set_updated_at BEFORE UPDATE ON "checklist_templates"
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE IF NOT EXISTS "checklist_template_items" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "template_id" uuid NOT NULL REFERENCES "checklist_templates"("id") ON DELETE CASCADE,
  "section" text NOT NULL,
  "label" text NOT NULL,
  "description" text,
  "item_type" text NOT NULL DEFAULT 'checkbox'
    CHECK ("item_type" IN ('checkbox','photo_required','number','text','pass_fail')),
  "is_required" boolean NOT NULL DEFAULT true,
  "sort_order" integer NOT NULL DEFAULT 0,
  "created_at" timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "checklist_template_items_template_idx"
  ON "checklist_template_items" ("template_id", "sort_order");

-- =============================================================================
-- 4) task_checklists + task_checklist_items (instantiated per task)
-- =============================================================================
CREATE TABLE IF NOT EXISTS "task_checklists" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "task_id" uuid NOT NULL REFERENCES "operation_tasks"("id") ON DELETE CASCADE,
  "template_id" uuid REFERENCES "checklist_templates"("id") ON DELETE SET NULL,
  "status" text NOT NULL DEFAULT 'open'
    CHECK ("status" IN ('open','in_progress','completed','approved')),
  "completed_by" uuid REFERENCES "app_users"("id") ON DELETE SET NULL,
  "completed_at" timestamptz,
  "approved_by" uuid REFERENCES "app_users"("id") ON DELETE SET NULL,
  "approved_at" timestamptz,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "task_checklists_task_idx"   ON "task_checklists" ("task_id");
CREATE INDEX IF NOT EXISTS "task_checklists_status_idx" ON "task_checklists" ("status");

DROP TRIGGER IF EXISTS trg_set_updated_at ON "task_checklists";
CREATE TRIGGER trg_set_updated_at BEFORE UPDATE ON "task_checklists"
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE IF NOT EXISTS "task_checklist_items" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "checklist_id" uuid NOT NULL REFERENCES "task_checklists"("id") ON DELETE CASCADE,
  "template_item_id" uuid REFERENCES "checklist_template_items"("id") ON DELETE SET NULL,
  "section" text NOT NULL,
  "label" text NOT NULL,
  "item_type" text NOT NULL DEFAULT 'checkbox'
    CHECK ("item_type" IN ('checkbox','photo_required','number','text','pass_fail')),
  "is_required" boolean NOT NULL DEFAULT true,
  "sort_order" integer NOT NULL DEFAULT 0,
  "status" text NOT NULL DEFAULT 'pending'
    CHECK ("status" IN ('pending','done','failed','skipped','not_applicable')),
  "value_text" text,
  "value_number" numeric,
  "photo_required" boolean NOT NULL DEFAULT false,
  "completed_by" uuid REFERENCES "app_users"("id") ON DELETE SET NULL,
  "completed_at" timestamptz,
  "notes" text,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "task_checklist_items_checklist_idx"
  ON "task_checklist_items" ("checklist_id", "sort_order");
CREATE INDEX IF NOT EXISTS "task_checklist_items_status_idx"
  ON "task_checklist_items" ("status");

DROP TRIGGER IF EXISTS trg_set_updated_at ON "task_checklist_items";
CREATE TRIGGER trg_set_updated_at BEFORE UPDATE ON "task_checklist_items"
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- =============================================================================
-- 5) maintenance_tickets
-- =============================================================================
CREATE TABLE IF NOT EXISTS "maintenance_tickets" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "ticket_code" text NOT NULL UNIQUE,
  "task_id" uuid REFERENCES "operation_tasks"("id") ON DELETE SET NULL,
  "villa_id" uuid REFERENCES "villas"("id") ON DELETE SET NULL,
  "project_id" uuid REFERENCES "projects"("id") ON DELETE SET NULL,
  "booking_id" uuid REFERENCES "bookings"("id") ON DELETE SET NULL,
  "reported_by" uuid REFERENCES "app_users"("id") ON DELETE SET NULL,
  "reported_by_guest_id" uuid REFERENCES "guests"("id") ON DELETE SET NULL,
  "title" text NOT NULL,
  "description" text,
  "issue_category" text NOT NULL
    CHECK ("issue_category" IN ('electrical','plumbing','ac','pool','internet','furniture','appliance','structural','landscaping','pest','other')),
  "severity" text NOT NULL DEFAULT 'normal'
    CHECK ("severity" IN ('low','normal','high','urgent')),
  "status" text NOT NULL DEFAULT 'open'
    CHECK ("status" IN ('open','triaged','scheduled','in_progress','waiting_parts','resolved','closed','cancelled')),
  "owner_chargeable" boolean NOT NULL DEFAULT true,
  "estimated_cost_minor" bigint,
  "actual_cost_minor" bigint,
  "currency" text,
  "reported_at" timestamptz NOT NULL DEFAULT now(),
  "resolved_at" timestamptz,
  "closed_at" timestamptz,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "maintenance_tickets_status_idx"   ON "maintenance_tickets" ("status");
CREATE INDEX IF NOT EXISTS "maintenance_tickets_villa_idx"    ON "maintenance_tickets" ("villa_id");
CREATE INDEX IF NOT EXISTS "maintenance_tickets_severity_idx" ON "maintenance_tickets" ("severity");

DROP TRIGGER IF EXISTS trg_set_updated_at ON "maintenance_tickets";
CREATE TRIGGER trg_set_updated_at BEFORE UPDATE ON "maintenance_tickets"
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- =============================================================================
-- 6) preventive_schedules
-- =============================================================================
CREATE TABLE IF NOT EXISTS "preventive_schedules" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "villa_id" uuid REFERENCES "villas"("id") ON DELETE CASCADE,
  "project_id" uuid REFERENCES "projects"("id") ON DELETE CASCADE,
  "task_type_id" uuid REFERENCES "operation_task_types"("id") ON DELETE SET NULL,
  "checklist_template_id" uuid REFERENCES "checklist_templates"("id") ON DELETE SET NULL,
  "name" text NOT NULL,
  "category" text NOT NULL,
  "frequency" text NOT NULL
    CHECK ("frequency" IN ('daily','weekly','biweekly','monthly','quarterly','yearly','custom')),
  "interval_days" integer,
  "next_due_on" date NOT NULL,
  "last_generated_on" date,
  "priority" text NOT NULL DEFAULT 'normal'
    CHECK ("priority" IN ('low','normal','high','urgent')),
  "assigned_to" uuid REFERENCES "app_users"("id") ON DELETE SET NULL,
  "status" text NOT NULL DEFAULT 'active'
    CHECK ("status" IN ('active','paused','archived')),
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "preventive_schedules_due_idx"     ON "preventive_schedules" ("next_due_on");
CREATE INDEX IF NOT EXISTS "preventive_schedules_status_idx"  ON "preventive_schedules" ("status");
CREATE INDEX IF NOT EXISTS "preventive_schedules_villa_idx"   ON "preventive_schedules" ("villa_id");
CREATE INDEX IF NOT EXISTS "preventive_schedules_project_idx" ON "preventive_schedules" ("project_id");

DROP TRIGGER IF EXISTS trg_set_updated_at ON "preventive_schedules";
CREATE TRIGGER trg_set_updated_at BEFORE UPDATE ON "preventive_schedules"
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- =============================================================================
-- 7) task_attachments — metadata only; storage lands later
-- =============================================================================
CREATE TABLE IF NOT EXISTS "task_attachments" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "task_id" uuid REFERENCES "operation_tasks"("id") ON DELETE CASCADE,
  "checklist_item_id" uuid REFERENCES "task_checklist_items"("id") ON DELETE CASCADE,
  "maintenance_ticket_id" uuid REFERENCES "maintenance_tickets"("id") ON DELETE CASCADE,
  "document_id" uuid REFERENCES "documents"("id") ON DELETE SET NULL,
  "attachment_type" text NOT NULL DEFAULT 'photo'
    CHECK ("attachment_type" IN ('photo','receipt','video','document','other')),
  "caption" text,
  "uploaded_by" uuid REFERENCES "app_users"("id") ON DELETE SET NULL,
  "created_at" timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "task_attachments_task_idx"     ON "task_attachments" ("task_id");
CREATE INDEX IF NOT EXISTS "task_attachments_ticket_idx"   ON "task_attachments" ("maintenance_ticket_id");
CREATE INDEX IF NOT EXISTS "task_attachments_item_idx"     ON "task_attachments" ("checklist_item_id");

-- =============================================================================
-- 8) damage_reports
-- =============================================================================
CREATE TABLE IF NOT EXISTS "damage_reports" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "task_id" uuid REFERENCES "operation_tasks"("id") ON DELETE SET NULL,
  "villa_id" uuid REFERENCES "villas"("id") ON DELETE SET NULL,
  "booking_id" uuid REFERENCES "bookings"("id") ON DELETE SET NULL,
  "guest_id" uuid REFERENCES "guests"("id") ON DELETE SET NULL,
  "reported_by" uuid REFERENCES "app_users"("id") ON DELETE SET NULL,
  "title" text NOT NULL,
  "description" text,
  "severity" text NOT NULL DEFAULT 'normal'
    CHECK ("severity" IN ('low','normal','high','urgent')),
  "estimated_cost_minor" bigint,
  "actual_cost_minor" bigint,
  "currency" text,
  "owner_chargeable" boolean NOT NULL DEFAULT true,
  "guest_chargeable" boolean NOT NULL DEFAULT false,
  "status" text NOT NULL DEFAULT 'open'
    CHECK ("status" IN ('open','under_review','approved','charged','waived','repaired','closed')),
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "damage_reports_status_idx" ON "damage_reports" ("status");
CREATE INDEX IF NOT EXISTS "damage_reports_villa_idx"  ON "damage_reports" ("villa_id");

DROP TRIGGER IF EXISTS trg_set_updated_at ON "damage_reports";
CREATE TRIGGER trg_set_updated_at BEFORE UPDATE ON "damage_reports"
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- =============================================================================
-- 9) service_requests — guest/owner-originated requests, foundation only
-- =============================================================================
CREATE TABLE IF NOT EXISTS "service_requests" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "request_code" text NOT NULL UNIQUE,
  "villa_id" uuid REFERENCES "villas"("id") ON DELETE SET NULL,
  "booking_id" uuid REFERENCES "bookings"("id") ON DELETE SET NULL,
  "guest_id" uuid REFERENCES "guests"("id") ON DELETE SET NULL,
  "task_id" uuid REFERENCES "operation_tasks"("id") ON DELETE SET NULL,
  "request_type" text NOT NULL
    CHECK ("request_type" IN ('cleaning','laundry','transfer','breakfast','massage','private_chef','maintenance','concierge','other')),
  "title" text NOT NULL,
  "message" text,
  "status" text NOT NULL DEFAULT 'new'
    CHECK ("status" IN ('new','accepted','scheduled','in_progress','completed','cancelled')),
  "priority" text NOT NULL DEFAULT 'normal'
    CHECK ("priority" IN ('low','normal','high','urgent')),
  "preferred_time" timestamptz,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "service_requests_status_idx" ON "service_requests" ("status");
CREATE INDEX IF NOT EXISTS "service_requests_villa_idx"  ON "service_requests" ("villa_id");
CREATE INDEX IF NOT EXISTS "service_requests_booking_idx" ON "service_requests" ("booking_id");

DROP TRIGGER IF EXISTS trg_set_updated_at ON "service_requests";
CREATE TRIGGER trg_set_updated_at BEFORE UPDATE ON "service_requests"
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- =============================================================================
-- 10) RLS — enable + force on every operations table.
--     Internal staff get read access via is_internal_user(). Mutations are
--     funneled through server actions running with the service role key, so
--     write policies can stay restrictive (deny by default).
-- =============================================================================
DO $$
DECLARE t text;
BEGIN
  FOR t IN
    SELECT unnest(ARRAY[
      'operation_task_types',
      'operation_tasks',
      'checklist_templates',
      'checklist_template_items',
      'task_checklists',
      'task_checklist_items',
      'maintenance_tickets',
      'preventive_schedules',
      'task_attachments',
      'damage_reports',
      'service_requests'
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
  END LOOP;
END $$;

-- Field staff can see tasks assigned to them even when their role is not
-- present in is_internal_user(). The auth.uid() → app_users.id lookup keeps
-- the check cheap.
DROP POLICY IF EXISTS assigned_self_read ON operation_tasks;
CREATE POLICY assigned_self_read ON operation_tasks FOR SELECT
USING (
  assigned_to IS NOT NULL
  AND assigned_to IN (
    SELECT id FROM app_users WHERE auth_user_id = auth.uid() AND status = 'active'
  )
);

DROP POLICY IF EXISTS assigned_self_checklists_read ON task_checklists;
CREATE POLICY assigned_self_checklists_read ON task_checklists FOR SELECT
USING (
  task_id IN (
    SELECT t.id FROM operation_tasks t
     WHERE t.assigned_to IN (
       SELECT id FROM app_users WHERE auth_user_id = auth.uid() AND status = 'active'
     )
  )
);

DROP POLICY IF EXISTS assigned_self_checklist_items_read ON task_checklist_items;
CREATE POLICY assigned_self_checklist_items_read ON task_checklist_items FOR SELECT
USING (
  checklist_id IN (
    SELECT c.id FROM task_checklists c
      JOIN operation_tasks t ON t.id = c.task_id
     WHERE t.assigned_to IN (
       SELECT id FROM app_users WHERE auth_user_id = auth.uid() AND status = 'active'
     )
  )
);

COMMIT;
