-- =============================================================================
-- 0184 · SALES CONVERSATION MESSAGES — per-message transcript store for
--        sales_conversation_threads.
--
-- WHY: sales_conversation_threads is a CRM analytics overlay that records
-- aggregate metadata (channels, total_message_count, outcome, consent) but had
-- NO place to store the individual message bodies, so the conversation detail
-- page (/development-os/marketing/conversations/[code]) could only show a count,
-- never the transcript. This table is the canonical per-thread message store.
--
-- TENANCY: organization_id NOT NULL (every row owned by a tenant); reads/writes
-- are org-scoped in listConversationMessages / appendConversationMessage, and
-- the writer verifies the parent thread belongs to the caller's org before
-- inserting (confused-deputy guard). ON DELETE CASCADE with the thread.
-- =============================================================================

CREATE TABLE IF NOT EXISTS sales_conversation_messages (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id),
  thread_id       uuid NOT NULL REFERENCES sales_conversation_threads(id) ON DELETE CASCADE,
  channel_type    text NOT NULL DEFAULT 'whatsapp',
  direction       text NOT NULL CHECK (direction IN ('inbound', 'outbound')),
  sender_name     text,
  body            text NOT NULL,
  occurred_at     timestamptz NOT NULL DEFAULT now(),
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS sales_conversation_messages_thread_idx
  ON sales_conversation_messages (thread_id, occurred_at);
CREATE INDEX IF NOT EXISTS sales_conversation_messages_org_idx
  ON sales_conversation_messages (organization_id);
