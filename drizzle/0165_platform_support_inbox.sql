-- =============================================================================
-- 0165 · PLATFORM SUPPORT INBOX (super-admin mock 06-support-inbox parity, v1)
--
-- WHY: customer orgs have no first-party way to reach platform support, and
-- the operator console (the superseded cc-functional-handoff/cabinets/
-- super-admin/06-support-inbox.html mock) has no live inbox behind it. v1
-- ships the core thread model only:
--
--   support_threads   — one ticket per conversation between a customer org
--                       and the platform team. Org-scoped (organization_id
--                       NOT NULL, ON DELETE CASCADE — a purged customer takes
--                       its tickets with it). Lifecycle: open → pending
--                       (waiting on the customer) → closed, with reopen.
--                       closed_at stamps the close; reopen nulls it.
--   support_messages  — the transcript. author_side discriminates which side
--                       wrote it ('org' = customer member, 'platform' =
--                       super-admin operator); author_user_id → app_users
--                       (SET NULL so a message survives an offboarded user).
--
-- Deliberately OUT of v1 (per the build brief): attachments, email bridge,
-- SLA timers / breach tracking, assignment, tags, AI drafts.
--
-- Enum values are plain text + CHECK (house style — 0146 crm_tasks): the app
-- layer (zod) is the source of truth; the CHECK is a backstop.
--
-- Idempotent: CREATE TABLE/INDEX IF NOT EXISTS. Safe to re-run.
-- =============================================================================

BEGIN;

-- ---------------------------------------------------------------------------
-- 1. support_threads
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS support_threads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  created_by_user_id uuid REFERENCES app_users(id) ON DELETE SET NULL,
  subject text NOT NULL,
  -- open | pending | closed   (pending = platform replied, waiting on org)
  status text NOT NULL DEFAULT 'open'
    CHECK (status IN ('open', 'pending', 'closed')),
  -- normal | high | urgent
  priority text NOT NULL DEFAULT 'normal'
    CHECK (priority IN ('normal', 'high', 'urgent')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  closed_at timestamptz
);

-- Org settings page: "my org's threads", newest activity first.
CREATE INDEX IF NOT EXISTS support_threads_org_updated_idx
  ON support_threads (organization_id, updated_at);

-- Platform inbox: status/priority queue across ALL orgs, newest first.
CREATE INDEX IF NOT EXISTS support_threads_status_updated_idx
  ON support_threads (status, priority, updated_at);

-- ---------------------------------------------------------------------------
-- 2. support_messages
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS support_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  thread_id uuid NOT NULL REFERENCES support_threads(id) ON DELETE CASCADE,
  author_user_id uuid REFERENCES app_users(id) ON DELETE SET NULL,
  -- org | platform
  author_side text NOT NULL
    CHECK (author_side IN ('org', 'platform')),
  body text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Thread view: transcript in chronological order.
CREATE INDEX IF NOT EXISTS support_messages_thread_created_idx
  ON support_messages (thread_id, created_at);

COMMIT;
