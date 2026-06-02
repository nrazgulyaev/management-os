-- 0117 — Owner statement lifecycle: supersede link for resolve→reissue.
--
-- FC-OWNER-STATEMENTS §4.4 + §9 (resolved). The `superseded` value of
-- owner_statements.owner_state already exists, but `main` had no column to
-- link a superseded statement to the revised one that replaced it (the
-- contract's proposed `revised_from_id` was never landed). We add a forward
-- link on the OLD row → the NEW row, so a reissued statement is traceable
-- from the one it supersedes:
--
--   resolve→reissue:  new = INSERT(... owner_state='pending')
--                     old.owner_state      = 'superseded'
--                     old.superseded_by_id = new.id
--
-- ON DELETE SET NULL: deleting a revision must not cascade-delete history.

ALTER TABLE owner_statements
  ADD COLUMN IF NOT EXISTS superseded_by_id uuid
    REFERENCES owner_statements(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS owner_statements_superseded_by_idx
  ON owner_statements (superseded_by_id);
