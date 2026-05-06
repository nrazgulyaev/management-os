# ADR-0020 — Guest Concierge Operational Handoff (v9I)

Status: Accepted · 2026-04-29

## Context

V9H shipped the guest AI concierge (`/stay/[token]/concierge`).
It's strictly read-only — guests can ask questions, the AI answers
from configured villa data, and refusals are logged. What was missing
was a *bridge* into operations: when the AI couldn't help, the guest
had to leave the chat, navigate to `/stay/[token]/services`, and
re-explain themselves in a free-text form.

V9I closes that gap. The guest gets two new buttons under each AI
reply — **Ask human concierge** and **Report this to staff** — that
open a modal, capture intent + priority + a short message, and
submit a real `service_requests` row in the same transaction as a
new `guest_ai_handoffs` row that carries the conversation context.

The AI never gets write tools; this remains a guest-driven action.

## Decisions

### 1. One new internal-only table

```
guest_ai_handoffs
  ─ guest_ai_concierge_session_id   (cascade)
  ─ guest_stay_token_id             (cascade)
  ─ booking_id                      (set null)
  ─ service_request_id              (set null) ← system of record for ops
  handoff_type   ask_human | report_problem | emergency_concern |
                  service_question | ai_refusal_followup
  status         created | linked_to_request | acknowledged |
                  resolved | cancelled
  priority       low | normal | high | urgent
  guest_summary               (redacted free text)
  last_messages_json          (last 3 redacted user/assistant turns)
  safety_flags                (advisory only — emergency / problem / numbers)
  created_by_ip_hash + created_by_user_agent
  acknowledged_at + resolved_at
```

Force RLS internal-only with `internal_read` + `internal_write` policies.
Indexes per spec: `session`, `token`, `booking`, `service_request`,
`status`, `priority`, `created_at DESC`.

Each row is paired with a `service_requests` row via
`requestType='guest_ai_handoff'` so ops can use the same workflow,
queue, and dashboards they already use for v9E free-text concierge
requests.

### 2. Pure handoff classifier

`classifyHandoffType` is keyword + UI-hint resolved in this order:

1. **Emergency keywords** ALWAYS win → `emergency_concern`
   (fire / injured / police / ambulance / intruder / etc.)
2. UI button hint (when present)
3. Last assistant message was a refusal → `ai_refusal_followup`
4. Problem keywords (broken / leak / no power / …) → `report_problem`
5. Service question keywords (how much / available / book / …) →
   `service_question`
6. Default → `ask_human`

`inferHandoffPriority` mirrors this:

- Emergency type → ALWAYS `urgent` (overrides UI selection).
- "asap / right now / immediately" → `high`.
- `report_problem` → `high`.
- Otherwise UI selection or `normal`.

### 3. Defence-in-depth redaction

Everything that lands on a handoff row goes through
`redactHandoffContext` (the same scrubber used by the v9H AI safety
layer):

- 6-digit standalone numbers → `[code redacted]`
- 32+ char base64url tokens → `[token redacted]`
- "password is X" / "pin: X" → `password is [redacted]`

Even if the guest types their door code or Wi-Fi password into the
modal, neither the handoff row nor the linked service_requests row
will store it verbatim. The same redaction is applied to:

- `guest_summary` (the modal text)
- Each entry in `last_messages_json` (3-message conversation snapshot)
- The `preferredContact` field
- The composed `service_requests.message` body (which embeds the
  transcript)

### 4. Rate limits

Two layers:

- **v9G stay-token limiter** (60/10min per IP+token) still applies —
  handoff submits count against the page-traffic envelope.
- **Handoff-specific** (counted directly off `guest_ai_handoffs`):
  - 5 handoffs / token / hour
  - 2 urgent / token / hour

Hitting the urgent cap fires a `suspicious_access` security event
(severity `high`) so ops can see attempted spam before any new
service_requests rows are created.

### 5. Notifications

Per handoff:

- `concierge` + `property_manager` always get an in-app notification.
- `urgent` priority adds `operations_manager`.
- Template is `guest_ai.handoff_urgent` for urgent, otherwise
  `guest_ai.handoff_created`.
- Dedupe key includes the handoff id + role so a misfire can't
  duplicate.

Guests do NOT receive an email yet. Status lives in
`/stay/[token]/requests`. The `guest_ai.handoff_resolved_guest`
template is seeded for a future v9J feature where ops can ping the
guest on close.

### 6. Permissions

```
guest_ai.handoff.read     super_admin, director, ops, property,
                          concierge, booking_manager
guest_ai.handoff.manage   super_admin, director, ops, property,
                          concierge
```

Booking managers can audit handoffs but cannot acknowledge / resolve.
Field roles (housekeeper, technician, security, driver) and owners
are excluded everywhere.

### 7. Acknowledge vs resolve are independent

- Acknowledging a handoff sets `status='acknowledged'` + the timestamp.
  It does NOT touch the linked service_request — operators still
  work that row through their normal queue.
- Resolving a handoff sets `status='resolved'` + a timestamp + an
  optional note. It does NOT auto-complete the service_request:
  operators must close that ticket explicitly with the existing
  ops controls.

The split lets ops triage the *concierge handoff* (e.g. "I see what
the guest needs") separately from the *operational completion*
(e.g. "the chef is booked, request done").

### 8. Guest visibility — `/stay/[token]/requests`

A new token-gated route lists every `service_requests` row tied to
the guest, surfaced through:

1. The reverse FK from `guest_ai_handoffs.service_request_id`
   (everything created from concierge), AND
2. Direct match on `service_requests.booking_id` for v9E free-text
   submissions.

We de-duplicate by SR id and project only safe fields: code, title,
status, priority, created time, plus the `handoffType` if it came
through the v9I path. No internal notes, staff names, supplier
costs, or timestamps beyond `created_at`. Status updates from ops
are reflected automatically — no chat replies yet.

## Trade-offs

- **No streaming.** The handoff modal uses `useActionState`
  round-trip — fine for a single submit.
- **Rate limit is per token, not per IP.** A guest who shares the URL
  with a partner shares the limit. Acceptable; same model as v9H.
- **Last-3 messages, no full transcript.** Operators can click
  through to the AI session to see the rest. Keeps the handoff row
  lean and stops accidental over-sharing.
- **No auto-create from AI.** Even when the AI clearly knows the
  guest needs a service, it still asks the guest to tap a button.
  This is by design — a guest tap is consent.
- **Acknowledge ≠ accept.** We don't auto-`accept` the linked
  service_request when a handoff is acknowledged. Ops keeps full
  control of their ticket lifecycle.

## Out of scope (deferred)

- Guest email/SMS on resolve (`guest_ai.handoff_resolved_guest`
  template is seeded but not yet wired).
- Ops chat reply / two-way message inside the handoff (v9J).
- Aggregated handoff metrics dashboard (response time, resolution
  rate, by-villa).
- Auto-route to housekeeper / technician based on `report_problem`
  signals (still goes to concierge by default).
- Streaming AI responses (v9J).

## Operational runbook

- **Apply migration**: `npm run db:migrate` (idempotent).
- **Seed**: `npm run db:seed` adds three notification templates
  (`guest_ai.handoff_created`, `_urgent`, `_resolved_guest`). No
  sample handoffs.
- **Guest flow**: `/stay/[token]/concierge` → "Ask human concierge"
  / "Report this to staff" → modal → submit. The success state
  shows the new request code + a deep link to
  `/stay/[token]/requests`.
- **Admin flow**: notifications land in `concierge` +
  `property_manager` inboxes. Open at
  `/dashboard/guest-ai/handoffs/[id]` — tabs through the redacted
  conversation excerpt + safety flags + linked SR. Click
  **Acknowledge** to mark seen, **Mark resolved** when ops is done.
- **Archive AI session**: `/dashboard/guest-ai/sessions/[id]` now
  has an "Archive session" button (admin-only). Archiving releases
  the active-session unique slot so a fresh visit starts a new
  thread.
