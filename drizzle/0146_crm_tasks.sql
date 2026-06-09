-- Migration 0146 — crm_tasks
--
-- CRM TASKS / FOLLOW-UPS / REMINDERS (HighLevel parity, #169).
--
-- A single polymorphic follow-up record that hangs off ANY CRM subject —
-- owner / contact / lead / buyer / deal — so an internal user can schedule a
-- "call the owner back Thursday" or "send the buyer the contract" reminder
-- against the record they are looking at, then see it on a "My tasks" /
-- due-today view. Mirrors HighLevel's task model (subject + title + due_at +
-- assignee + open/done).
--
-- Polymorphism is by (subject_type, subject_id) — a plain text discriminator
-- plus a bare uuid (NO FK) so the table never imports a cycle of CRM modules
-- and a task can point at a `deal`/`lead` even where that module is thin.
-- Ownership/visibility is enforced in the action layer, not by FK.
--
-- Org-scoped (organization_id → organizations, ON DELETE CASCADE). assignee
-- and creator reference app_users (ON DELETE SET NULL so a task survives an
-- offboarded user). No money columns. Idempotent.

CREATE TABLE IF NOT EXISTS crm_tasks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  -- owner | contact | lead | buyer | deal
  subject_type text NOT NULL,
  subject_id uuid NOT NULL,
  title text NOT NULL,
  -- Optional free-text body for the follow-up.
  body text,
  -- When the follow-up is due (nullable — a task can be a loose "someday").
  due_at timestamptz,
  -- low | normal | high
  priority text NOT NULL DEFAULT 'normal',
  assignee_user_id uuid REFERENCES app_users(id) ON DELETE SET NULL,
  -- open | done
  status text NOT NULL DEFAULT 'open',
  completed_at timestamptz,
  completed_by_app_user_id uuid REFERENCES app_users(id) ON DELETE SET NULL,
  created_by_app_user_id uuid REFERENCES app_users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Record panel: every task on one CRM subject, newest-due first.
CREATE INDEX IF NOT EXISTS crm_tasks_subject_idx
  ON crm_tasks (organization_id, subject_type, subject_id, status);

-- "My tasks" / due-today: a user's open tasks ordered by due date.
CREATE INDEX IF NOT EXISTS crm_tasks_assignee_due_idx
  ON crm_tasks (organization_id, assignee_user_id, status, due_at);

-- Org-wide due feed (unassigned / all open) ordered by due date.
CREATE INDEX IF NOT EXISTS crm_tasks_org_due_idx
  ON crm_tasks (organization_id, status, due_at);
