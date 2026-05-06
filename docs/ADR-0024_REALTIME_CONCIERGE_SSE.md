# ADR-0024 — Realtime Concierge Request Updates via SSE (v9M)

Status: Accepted · 2026-04-29

## Context

V9G–V9L turned `/stay/[token]/requests/[code]` and the admin handoff
detail into a complete two-way concierge surface — but every update
(new reply, status change, attachment processing, read receipt) only
landed on the next page navigation. Operators were refreshing the
admin tab; guests were reloading by hand to see staff replies.

V9M adds realtime updates without changing the existing data model
or breaking any V9G–V9L guarantee. Two new HTTP routes stream
typed events; new client components subscribe, dedupe, and trigger
a soft `router.refresh()` so the existing server-rendered page is
the canonical UI. We deliberately did NOT add WebSockets, a Redis
pub-sub layer, or a managed Realtime backend.

## Decisions

### 1. SSE over WebSockets

Server-Sent Events are a one-way stream from server to client. That
matches our usage exactly:

- Server emits typed events (`reply_created`, `attachment_uploaded`,
  …).
- Client mutations still go through the existing server actions —
  the SSE channel is read-only.
- SSE works through every HTTP/HTTPS proxy and reverse-tunnel; no
  upgrade handshake.
- `EventSource` has built-in auto-reconnect with `Last-Event-ID`
  resume.
- Vercel's Node runtime supports streaming responses; on a
  serverless platform we cap each connection at 5 minutes and let
  the browser reconnect.

A future v9N+ can drop a Postgres `LISTEN/NOTIFY` or Supabase
Realtime backend behind the same `pollGuestEvents` /
`pollAdminEvents` interface without changing the client code.

### 2. Polling-backed loop

The first server poll seeds a cursor (latest reply / receipt /
attachment-change / handoff-update timestamp). Each subsequent poll
runs every 2 seconds and emits only rows newer than the cursor.
Trade-offs:

- 2 s perceived latency for new events.
- Up to 30 idle polls per minute per active stream — small SQL
  cost; the queries are indexed on `handoff_id` + the relevant
  timestamp column.
- No infrastructure beyond the existing Postgres connection.

### 3. Event envelope + projection rules

Every event carries:

```
{
  id: string         // monotonic per stream (handoffPrefix:seq)
  type: EventType    // ALLOWED_EVENT_TYPES
  handoffId: string
  occurredAt: ISO timestamp
  payload: object
}
```

`projectForGuest` recursively strips a banned-field set
(`storage_path`, `tokenHash`, `passwordCiphertext`, `codeDisplay`,
`displayPassword`, `raw_token`, `internal_only`) before any payload
goes into a guest event. The pure helper is unit-tested on a row
seeded with every banned field, plus a nested copy.

`publicSafeStatus` collapses ops statuses (`created`,
`linked_to_request`) onto the public-safe set
(`received | acknowledged | resolved | cancelled | unknown`) so
internal terminology never reaches the guest.

`attachmentLifecycle` maps row state to one of `processing` /
`uploaded` / `failed` so the guest UI can show "Processing
securely…" / file preview / "Could not be processed safely" in
exactly the documented states from V9L.

### 4. Admin notes-permission gate runs server-side

The admin poller takes `canSeeNotes: boolean`. When `false`, the
`visibility = 'guest_visible'` filter is added at the SQL level —
internal replies and internal attachments never reach the response
body. Booking managers (whose role lacks `guest_ai.handoff.notes.read`)
never receive an internal-note event, even with DevTools open.

### 5. Read-receipt loop prevention

Two guards keep the live feed from oscillating:

- **Server idempotency** — `recordGuestReadReceipts` /
  `recordStaffReadReceipts` use `INSERT ... ON CONFLICT DO NOTHING`.
- **Client gate** — `makeReadReceiptGate(2_000)` blocks the
  receipt action from firing more than once every 2 seconds; the
  first event triggers it, subsequent rapid events are ignored
  until the window rolls.

Combined with `makeDedupe` (LRU set bounded to 512 ids) the client
can safely re-process the same event id without writing twice.

### 6. Reconnection

The wrapper emits `retry: 3000` so `EventSource` will retry every
3 s on connection drop. Heartbeats every 25 s keep proxies from
collapsing the long-poll response. Each connection is capped at 5
minutes — when the cap fires we close cleanly and the browser
reconnects with `Last-Event-ID`. `parseLastEventId` confirms the
prefix matches the current handoff before honouring the resume.

### 7. Client UI

Both clients render a tiny status strip ("Live" / "Connecting…" /
"Reconnecting…" / "Live updates aren't supported in this browser.
Pull to refresh to see new replies."). On any meaningful event
they trigger a 350 ms-debounced `router.refresh()` so the parent
server component re-fetches with the existing projection rules. We
explicitly do NOT mutate local state directly — the server page is
the source of truth and any future change to the projection rules
applies automatically.

If the SSE connection dies (`error` event with our payload, or
`onerror` from the browser without recovery), the client surfaces
a non-technical message and the existing server-rendered timeline
keeps working.

## Trade-offs

- **2 s polling cadence** isn't sub-second realtime. Acceptable for
  concierge-pace traffic; v9N can swap the source to LISTEN/NOTIFY
  / Supabase Realtime without touching the client.
- **5-minute connection cap** is platform-driven. The reconnect
  flow is documented and tested via static-source for retry/header
  emission.
- **Guest stream is per-handoff, not per-token.** A guest with
  multiple open requests opens one stream per detail page — fine for
  v9M, could be multiplexed later.
- **No back-pressure / fan-out from a writer.** Two guests on the
  same stay would each hold their own stream; both poll the same
  rows. At our traffic levels this is cheaper than a publish bus.
- **`router.refresh()` is the rerender trigger.** Means we re-fetch
  the entire page; on a slow link that's a few hundred KB. A future
  upgrade could merge events directly into client state.

## Out of scope (deferred)

- WebSocket / managed Realtime backend.
- LISTEN / NOTIFY backend.
- Per-token concurrent-stream cap (we soft-cap at 5 min duration).
- Push notifications.
- Streaming AI replies — v9M doesn't add AI write tools.
- WebP / PDF metadata stripping (still v9L `warning` /
  `not_required`).
- WhatsApp / Telegram bridges.

## Operational runbook

- **Local testing**: start the dev server, open
  `/stay/<token>/requests/<code>` in two browser tabs, and post a
  reply from one. The other should refresh automatically within
  ~2 s. The "Live" pill confirms the SSE connection is open.
  `curl -N <base>/stay/<token>/requests/<code>/stream` shows the
  raw SSE frames.
- **Production timeout notes**: `maxDuration = 300` in both route
  files so Vercel's serverless cap is respected. The browser
  reconnects automatically with `Last-Event-ID`.
- **Troubleshooting**:
  - *"Connecting…" never flips to "Live"* → check
    `EventSource` is reachable through your proxy / CDN; the
    response headers `text/event-stream` + `cache-control: no-cache`
    are set in the wrapper.
  - *Reconnects rapidly* → the source poller is throwing. Check
    server logs; the `error` event's payload has a 120-char detail
    excerpt.
  - *Browser tab eats CPU* → the dedupe set is bounded to 512 ids
    per connection; if you see runaway memory, dump
    `dedupeRef.current` in DevTools.
  - *Internal note suddenly visible to a booking manager* → that
    would be a regression — the static-source test at
    `tests/v9m-realtime-concierge-sse.test.ts` enforces the perm
    gate.
