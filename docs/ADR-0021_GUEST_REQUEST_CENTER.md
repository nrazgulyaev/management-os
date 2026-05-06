# ADR-0021 — Guest Request Center & Concierge Handoff Replies (v9J)

Status: Accepted · 2026-04-29

## Context

V9I shipped the operational handoff: a guest could tap "Ask human
concierge" / "Report this to staff" in the AI chat and a real
`service_requests` row was created with the conversation context.
What was still missing was the *return path*. Once staff acknowledged
or replied, the guest had nowhere in the portal to read it. The
handoff was one-way — submit and wait.

V9J turns the handoff into a real two-way concierge thread:

- Per-handoff append-only reply log (`guest_ai_handoff_replies`)
  carrying both halves of the conversation, including system status
  events, with the same redaction guarantees as v9I.
- New guest detail page at `/stay/[token]/requests/[code]` showing
  the request status + the redacted reply timeline + a follow-up
  composer.
- Updated admin handoff detail with a guest-visible reply composer,
  an internal-note composer, a unified timeline (with visibility
  badges), unread counters, and SLA preview.
- New SLA dashboard at `/dashboard/guest-ai/handoffs/metrics` with
  median time-to-acknowledge / first response / resolve, plus
  by-villa / by-type / by-priority breakdowns and an overdue list.

## Decisions

### 1. One new internal-only table + five `guest_ai_handoffs` columns

```
guest_ai_handoff_replies
  ─ handoff_id            (cascade)
  ─ service_request_id    (set null)
  author_type             guest | staff | system
  author_app_user_id      (set null)
  visibility              guest_visible | internal_only
  body                    raw input (audit-friendly)
  body_redacted           rendered by every UI surface
  reply_type              message | status_update | resolution | internal_note
  status_snapshot         optional, set for system rows
  read_by_{guest,staff}_at

guest_ai_handoffs (extended)
  + first_staff_reply_at
  + last_guest_reply_at
  + last_staff_reply_at
  + guest_unread_count
  + staff_unread_count
```

Force RLS internal-only with `internal_read` + `internal_write`
policies. Guests never query the table directly — the detail page
goes through a token-scoped server resolver that joins the handoff
to the stay token first, then reads the replies.

### 2. Two-tier redaction is the load-bearing safety property

Every reply runs through `redactBase`, which extends the v9I
`redactSensitiveText` with email, phone, and URL scrubbing. Camera
URLs (anything starting `rtsp://` / `rtmp://` or containing `camera`
/ `cctv` / `stream`) are stripped specially:

```
in   "watch the cctv at https://camera.example.com/live"
out  "watch the cctv at [camera URL redacted]"
```

Both `body` (raw input) and `body_redacted` are persisted. UI surfaces
ALWAYS render `body_redacted`. The raw `body` exists for audit /
incident response; admin detail surfaces a small "redacted" badge
when the two diverge so operators can spot the rewrite.

The pure helper `redactionWouldChange` powers a live warning under
the staff guest-visible composer: if redaction would alter the text
materially, ops sees a preview and is gently told to pick "Internal
note" instead if they need raw contact info.

### 3. Reply gates

```
canGuestReply(status)   created | linked_to_request | acknowledged   → ✓
                        resolved | cancelled                          → ✗

canStaffReply(status)   resolved is fine (closing remarks)            → ✓
                        cancelled                                     → ✗
```

The guest gate is enforced in two places: the chat composer is hidden
when the handoff is closed, and the server action re-checks before
inserting (defence in depth — anyone can hit the action endpoint).

### 4. Lifecycle system replies

Both `acknowledgeHandoffAction` and `resolveHandoffAction` now insert
a guest-visible system reply:

- Acknowledge → `replyType='status_update'`, status_snapshot=`acknowledged`,
  body like `"Our team (Sari) acknowledged this request and is on it."`
- Resolve → `replyType='resolution'`, status_snapshot=`resolved`,
  body like `"Marked resolved by Sari. Tap 'Ask human concierge' if
  anything else comes up."`

Resolve also queues `guest_ai.handoff_resolved_guest` (an in-app
notification template seeded back in v9I), and if the operator left
a free-text resolution note it's rounded through
`createStaffHandoffReplyAction` as a separate guest-visible message
so it gets the same redaction treatment.

These status replies count as the "first staff response" for SLA
purposes if no human reply landed first — which keeps the median
metric honest for the "ack-and-resolve fast" path.

### 5. Unread counters

Each row carries `guest_unread_count` and `staff_unread_count`:

- Guest replies bump `staff_unread_count` and `last_guest_reply_at`.
- Guest-visible staff replies bump `guest_unread_count` and
  `last_staff_reply_at`. The first such reply also stamps
  `first_staff_reply_at`.
- Internal notes don't touch any counters.
- Visiting the detail page calls `markGuestReadAt` /
  `markStaffReadAt` (best-effort) which clears the relevant counter
  and stamps `read_by_guest_at` / `read_by_staff_at` per row.

The list page uses `guest_unread_count` to render a "N new" pill on
each request card, plus a one-line preview (`bodyRedacted` of the
latest guest-visible reply, ≤140 chars).

### 6. Rate limits

```
guest replies per handoff      10 / hour
guest replies per token         30 / hour
```

Staff replies are not rate-limited (we trust the admin perm gate).
Replies that get materially redacted log a low-severity
`suspicious_access` security event so ops can watch for guests
trying to leak contact info or codes — not a hard block, just a
signal.

### 7. Permissions

No new keys. `guest_ai.handoff.read` and `guest_ai.handoff.manage`
from v9I cover read + write + acknowledge + resolve. Booking
managers keep read-only. Owners / agents / field roles excluded.

### 8. SLA dashboard

`getHandoffMetricsView()` rolls up the last 1000 handoffs with the
pure helpers from `replies-pure.ts`:

- `calculateHandoffSlaMetrics` → counts + medians (ack / first
  response / resolve), all in seconds.
- `groupHandoffMetricsByVilla / Type / Priority` → bucket counts,
  open / resolved / urgent-open splits, median resolve per bucket.
- Overdue thresholds: 30 min for `urgent`, 2 h for everything else.

The page lives at `/dashboard/guest-ai/handoffs/metrics` with a
top-of-page link from the handoffs list and the sidebar nav.

## Trade-offs

- **No real-time updates.** The guest detail page renders fresh on
  navigation but doesn't push. Acceptable for a concierge-pace
  conversation; v9K could add SSE if needed.
- **Read receipts are page-load granularity.** Visiting a detail
  page marks the whole thread read, not per-message. Simpler
  semantics, fewer round trips.
- **No file uploads.** Photos / receipts are deferred — handoffs
  remain text-only.
- **System reply text is hard-coded.** A configurable copy library
  is deferred to v9K.
- **No two-way email/SMS.** The `guest_ai.handoff_reply_staff`
  template is seeded but only delivers in-app for now.
- **Internal notes are visible to anyone with `handoff.read`**, not
  scoped per-team. That's the same scope as the rest of the admin
  surface.

## Out of scope (deferred)

- Photo / receipt attachments on replies.
- Streaming / push updates on the guest side.
- Localisation; English in / English out.
- Per-message read receipts.
- Editable reply templates.
- Auto-routing problem reports to housekeeper / technician based on
  signals.

## Operational runbook

- **Apply migration**: `npm run db:migrate` (idempotent).
- **Seed**: `npm run db:seed` adds `guest_ai.handoff_reply_guest` and
  `guest_ai.handoff_reply_staff` notification templates.
- **Guest flow**:
  - `/stay/[token]/requests` shows every request with unread badge
    and last preview.
  - Tapping a row opens `/stay/[token]/requests/[code]` with the
    redacted timeline and a follow-up composer (when the handoff is
    still open).
- **Admin flow**:
  - Notifications land in the concierge / property_manager inboxes
    on guest reply.
  - `/dashboard/guest-ai/handoffs/[id]` now hosts:
    - Guest-visible composer (with redaction warning).
    - Internal-only note composer.
    - Unified reply timeline with visibility badges.
    - SLA snippet (time-to-ack / first response / resolve).
  - **Acknowledge** still flips status + drops a system status reply
    visible to the guest.
  - **Mark resolved** still flips status + drops a resolution reply +
    queues `guest_ai.handoff_resolved_guest` to the guest's inbox.
  - **Resolution note** field, when filled, is posted as a
    guest-visible staff reply (redacted).
  - `/dashboard/guest-ai/handoffs/metrics` for the SLA dashboard.
