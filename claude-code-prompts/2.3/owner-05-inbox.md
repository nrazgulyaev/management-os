# Task — Phase 2.3 PR 5 — Owner · Inbox

**Reference doc:** `_handoff/cabinets/owner-p1/05-inbox.html`

## Files

ROUTES:
- `src/app/(owner-portal)/owner/inbox/page.tsx` · list + selected thread (?thread=id query)
- `src/app/(owner-portal)/owner/inbox/new/page.tsx` · compose form (mobile alt)

PRIMITIVES:
- `src/components/owner-portal/thread-list.tsx` · scrollable list · unread accent left-border
- `src/components/owner-portal/thread-view.tsx` · message bubbles + sticky reply at bottom
- `src/components/owner-portal/msg-bubble.tsx` · actor / name / body · supports inline action chips

SCHEMA:
- `owner_threads` · FK owner_id, subject, last_message_at, unread_count, kind (statement_dispute / personal_stay / q_review / general)
- `owner_messages` · FK thread_id, actor_kind (owner / mgmt_user / agent), actor_id, body, sent_at, inline_actions JSON?

AGENT:
- `src/features/ai-agents/owner-concierge/` · auto-replies to common questions (statement explainer, payout timing, villa policy) · routes to human when confidence < 80% or topic is sensitive

CROSS-CABINET:
- Statement dispute creates thread (kind=statement_dispute) with Director auto-assigned
- Personal-stay request creates thread (kind=personal_stay) with Bookings Mgr auto-assigned
- Q-review request creates thread with Director

## Mobile

≤900px: single-pane swipe between list and thread · sticky reply at bottom

## Commit

`phase-2.3(owner-inbox): 2-pane layout + thread list + thread view + owner-concierge agent stub + 3 primitives`
