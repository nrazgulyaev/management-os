# Stage 6.P2 — Communications · COMPLETE

**Status**: ACCEPTED
**Closed**: 2026-05-06
**Sub-checkpoints**: P2.A → P2.B → P2.C → P2.D → P2.E → P2.F (all accepted)

---

## What shipped

Unified messaging across **7 channels** behind one `MessagingProvider`
interface — every channel has a real implementation **and** a DryRun
fallback. The platform works end-to-end without credentials; it goes
live the moment partner credentials land in the encrypted store.

| Channel | Provider(s) | DryRun fallback |
|---|---|---|
| WhatsApp | Meta Cloud (P2.B) + Twilio (P2.B, dual via `provider` discriminator) | Yes |
| Telegram | Bot API (P2.C) | Yes |
| Instagram Business | Meta Graph (P2.D) | Yes |
| Facebook Messenger | Meta Graph (P2.D) | Yes |
| Email | Gmail OAuth (P2.E) + Resend transactional (P2.F, dual via `provider` discriminator) | Yes |
| SMS | Twilio Messages API (P2.F) | Yes |
| Internal note | n/a — never goes through a channel | DryRun by design |

## Schema

Migration `0078_development_os_stage_6_p2_unified_messaging.sql` —
applied. Four tables with per-org RLS via the `FOREACH t IN ARRAY
ARRAY[...]` pattern (preserves the 0075 lesson):

- `conversation_threads` — one row per (org, contact, channels-used)
- `conversation_messages` — directional messages, idempotency via
  `UNIQUE (channel, external_message_id)`
- `message_templates` — per-channel content keyed by `code`,
  WhatsApp template approval state tracked separately
- `auto_response_rules` — keyword / first_message / after_hours /
  no_response_timeout triggers; throttled per (rule, thread) window

## Webhook routes (5)

All under `/api/webhooks/messaging/<channel>/route.ts`. Thin shells
delegate to `handleMessagingWebhook` from
`src/lib/messaging/webhook-handler.ts`, which:

1. Handles Meta's `GET ?hub.verify_token=...&hub.challenge=...` for the
   3 Meta channels (whatsapp, instagram, messenger).
2. Reads the channel-specific signature header (Meta:
   `x-hub-signature-256` HMAC-SHA256; Telegram:
   `x-telegram-bot-api-secret-token` exact-match; Gmail Pub/Sub:
   `Authorization` bearer JWT — verifier wired in P2.G).
3. Decrypts credentials from the env bootstrap (P2.G migrates to a
   per-org connection table).
4. Calls `provider.verifyWebhook(rawBody, signature, secret)` →
   401 on failure.
5. Calls `provider.parseWebhook(payload)` and ingests each result
   through `MessagingService.handleIncomingMessage`. Returns
   `{ ok, created, skipped, failed }` JSON.

## Cron jobs (4)

Registered in [src/features/jobs/actions.ts](src/features/jobs/actions.ts)
and [src/lib/development/server/cron/index.ts](src/lib/development/server/cron/index.ts).
Schedule entries in [docs/VERCEL-CRON-CHECKLIST.md](docs/VERCEL-CRON-CHECKLIST.md).

| Job key | Path | Schedule | Purpose |
|---|---|---|---|
| `messaging_inbound_poll` | `/api/cron/messaging-inbound-poll` | `*/5 * * * *` | Bootstrap shell — webhook channels push in real time. Reserved for Gmail pull-mode + future IMAP. |
| `messaging_status_sync` | `/api/cron/messaging-status-sync` | `*/15 * * * *` | Reconciles outbound rows stuck in queued/sending/sent for >24h to `failed`. Safety net for orphaned status. |
| `messaging_auto_response_evaluator` | `/api/cron/messaging-auto-response-evaluator` | `* * * * *` | Walks `after_hours` + `no_response_timeout` rules. Inbound-driven rules already fire from the service layer. |
| `messaging_cleanup` | `/api/cron/messaging-cleanup` | `0 3 * * *` | Auto-archives threads inactive >90 days. Reversible via UI. |

Cron registry: **78 → 82 routes**.

## Inbox UI

Pages under [src/app/(development-app)/development-os/inbox/](src/app/(development-app)/development-os/inbox/):

- `page.tsx` — threads list with channel + status + unread filters
- `[threadId]/page.tsx` — full transcript + reply composer + status
  dropdown + mark-read action
- `templates/page.tsx` — template create form (per-channel content as
  JSON) + archive action
- `auto-responses/page.tsx` — rule create form (trigger + action JSON
  configs) + pause/activate toggle

Server actions in [src/lib/messaging/inbox-actions.ts](src/lib/messaging/inbox-actions.ts).
Every form action returns `Promise<void>` (Next.js form-action
contract) and carries the `"use server"` directive — preserves the
Stage 5.J build-fix invariant for client-imported server modules.

## Service layer

[src/lib/messaging/service.ts](src/lib/messaging/service.ts) is the
single entry point for thread + message orchestration:

- `handleIncomingMessage` — webhook + cron pull entry. Skips platform
  echoes (`contentMetadata.echo === true`), dedupes by `(channel,
  external_message_id)`, upserts thread, persists message, rolls up
  thread counters, fires inline auto-rules best-effort.
- `sendOutboundMessage` — pre-inserts `pending` row → dispatches via
  selector → updates row to `sent` / `failed` → rolls up thread.
- `sendTemplateMessage` — looks up template, renders `{{var}}`
  substitution, calls `sendOutboundMessage`.
- `findOrCreateThread` — uses `external_identifiers` JSONB key lookup
  for the channel-specific external thread ID.
- `getInboxMetrics` / `archiveInactiveThreads` /
  `listInactiveThreadsForCleanup` — read helpers for UI + cron.

Pure auto-rule predicates live in
[src/lib/messaging/rule-predicates.ts](src/lib/messaging/rule-predicates.ts)
— no `server-only`, no DB. The DB-touching `evaluateAutoResponseRules`
in `rule-evaluator.ts` re-uses them. This split lets tests exercise
matching logic without mocks.

## Tests

| Sub-checkpoint | Test file | Tests |
|---|---|---|
| P2.A | tests/development-stage-6-p2-a.test.ts | 60+ |
| P2.B | tests/development-stage-6-p2-b.test.ts | 100+ |
| P2.C | tests/development-stage-6-p2-c.test.ts | 60+ |
| P2.D | tests/development-stage-6-p2-d.test.ts | 70+ |
| P2.E | tests/development-stage-6-p2-e.test.ts | 51 |
| P2.F | tests/development-stage-6-p2-f.test.ts | 42 |

**Total**: 4075 tests pass; **zero regressions** on the 3802 baseline.
**Stage 6 tests**: 1042 across P0 + P1 + P2.

## Acceptance gate — checked

- [x] Migration 0078 applied with FOREACH pattern preserved
- [x] All 5 messaging channel categories (counted by P2 spec) have real
      implementations + DryRun fallback
- [x] `selectMessagingProvider` returns DryRun when credentials are
      null — platform works end-to-end without keys
- [x] 4 new cron jobs in `KNOWN_JOBS` + dispatcher + Vercel checklist
- [x] 5 webhook routes verify HMAC (Meta channels) / Twilio HMAC-SHA1
      (SMS) / Telegram secret token / Gmail OIDC bearer (P2.G hookup)
- [x] Inbox UI surfaces threads, messages, composer, templates, rules
- [x] Reservation-style ingestion: webhook → thread upsert → message
      persist → auto-rule fire
- [x] 4075 tests passing (≥4002 target met)
- [x] `npm run check:cron` clean (0 fatal, 0 warning)
- [x] 0075 FOREACH lesson preserved (asserted in tests)
- [x] Architecture doc updated: P2 → ACCEPTED

## What's next

Stage 6.P3 — **Banking + Payments** (2–3 weeks). 4 bank/payment
providers (Revolut, Wise, Stripe, manual CSV) + Indonesian bank CSV
import (Mandiri, BCA). Migrations 0079, 0080. Statement parsing for
CSV / OFX / PDF (OCR) / MT940. Reconciliation engine + bookkeeper
workflow. Target: 4250+ tests.

P3 unblocks the cashflow + treasury operator views, which previously
inferred bank state from the calendar-sync booking pipeline.
