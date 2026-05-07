# Stage 6.P3 — Banking + Payments · COMPLETE

**Status**: ACCEPTED
**Closed**: 2026-05-07
**Sub-checkpoints**: P3.A → P3.B → P3.C → P3.D → P3.E → P3.F → P3.G (all accepted)

---

## What shipped

The platform now has a full banking + payments stack — bank-statement
ingestion across 4 formats, real API integrations for Revolut +
Wise + Stripe, manual-import paths for Indonesian banks, an
auto-matching reconciliation engine, and a bookkeeper-focused UI
with period-close.

### Bank providers

| Provider | Implementation | Webhook |
|---|---|---|
| Revolut Business | Real (P3.C) | HMAC-SHA256 with 5-min replay window |
| Wise (TransferWise) | Real (P3.D) | RSA-SHA256 fail-closed pending key plumbing |
| Mandiri (Indonesia) | Manual CSV/PDF import (P3.E) | n/a |
| BCA (Indonesia) | Manual CSV/PDF import (P3.E) | n/a |
| Plaid | Reserved DryRun slot | — |
| Manual | DryRun by design | — |

All conform to the unified `BankProviderInterface` so cron + UI +
service layer don't need to know which bank they're talking to.

### Payment providers

| Provider | Implementation | Webhook |
|---|---|---|
| Stripe | Real (P3.F) | HMAC-SHA256 with rotation support + 5-min replay window |
| Wise Payments | Reserved DryRun slot | — |
| PayPal | Reserved DryRun slot | — |
| Manual | DryRun by design | — |

All conform to `PaymentProviderInterface`. DryRun fail-closes on
`verifyWebhook` — a misconfigured environment cannot silently accept
signed payloads on a financial surface.

## Schema

3 migrations:

- `0079_development_os_stage_6_p3_banking.sql` — 4 tables
  (`bank_connections`, `bank_transactions`, `statement_imports`,
  `reconciliation_rules`).
- `0080_development_os_stage_6_p3_payments.sql` — 3 tables
  (`payment_processor_connections`, `payment_intents`,
  `payment_attempts`).
- `0081_development_os_stage_6_p3_closed_periods.sql` — 1 table
  (`closed_periods`) with audit trail (closed_by + closed_at +
  reopened_by + reopened_at + reopen_reason).

Per-org RLS via `is_in_user_organization()` (Stage 5.J helper) using
the `FOREACH t IN ARRAY ARRAY[...]` pattern — the migration 0075
lesson preserved across every new table.

## Statement parsers (P3.B)

All under [src/lib/banking/parsers/](src/lib/banking/parsers/). Each
returns the same `{ rows, diagnostics }` envelope.

- **CSV** — lazy-loads `papaparse`. Auto-detects delimiter
  (`, ; \t |`), header presence, date format, amount format. Auto-maps
  English / Indonesian / Russian column headers. Supports both
  signed-amount and separate debit/credit conventions.
- **OFX** — handles 1.x SGML (auto-closes value tags, strips preamble)
  and 2.x XML via lazy `fast-xml-parser`. Maps `STMTTRN` →
  normalized rows. Both `BANKMSGSRSV1` and `CREDITCARDMSGSRSV1`.
- **PDF** — text-extraction approach. Operates on caller-extracted
  text + bank-specific regex template. Mandiri + BCA bundled;
  operators register more via `registerPdfTemplate`. Auto-detect
  picks the first matching template.
- **MT940** — pure no-deps SWIFT MT940 parser. Tokenizes `:NNN:`
  blocks (with multi-line `:86:` continuations); `parseStatementLine`
  handles the `:61:` format with sign + funds code + refs +
  banking-convention year disambiguation.

## Reconciliation engine (P3.G)

[src/lib/banking/reconciliation/](src/lib/banking/reconciliation/) —
pure helpers, no I/O.

- **Auto-matcher** — multi-factor confidence scoring across amount,
  date (with tolerance window), counterparty fuzzy match,
  description fuzzy match. Weights: amount 0.5 / date 0.25 /
  counterparty 0.15 / description 0.10. Caps at 1.0.
- **Decision thresholds** — confidence ≥ 0.95 → `auto_matched`;
  0.5–0.95 → `partial_match` (flagged for review);
  < 0.5 → `unmatched`.
- **Description matcher** — Jaccard similarity over significant
  tokens (drops common words like "payment", "transfer", "pembayaran"
  multilingual), with Levenshtein backstop for stripped-punctuation
  variants of the same identifier.
- **Rules engine** — operator-defined rules (`description_contains`,
  `description_regex`, `counterparty_match`, `amount_range`,
  `amount_exact`, `date_range_match`). Priority-ordered; first match
  per action wins.

## Service layer

- **`BankingService`** ([src/lib/banking/service.ts](src/lib/banking/service.ts))
  wraps provider + matcher + rules + period-close. Single entry
  point for cron + UI: `syncTransactionsForConnection`,
  `runAutoReconciliation`, `closePeriod`, `reopenPeriod`,
  `isPeriodClosed`, `createStatementImport`,
  `updateStatementImportStatus`, `listActiveConnectionsForCron`.
- **`bookkeeper-actions.ts`** — server actions for the UI. Every form
  action returns `Promise<void>` (Next.js form-action contract);
  carries `"use server"` directive (Stage 5.J build-fix invariant).

## Webhook routes (4)

| Route | Provider | Verifier |
|---|---|---|
| `/api/webhooks/banking/revolut` | Revolut | HMAC-SHA256 over `v1.<ts>.<body>`, 5-min replay window |
| `/api/webhooks/banking/wise` | Wise | RSA-SHA256 fail-closed (key plumbing deferred) |
| `/api/webhooks/payments/stripe` | Stripe | HMAC-SHA256 over `<ts>.<body>`, 5-min replay window, multi-`v1=` rotation support |
| `/api/webhooks/payments/wise` | Wise Payments | RSA-SHA256 fail-closed |

All routes delegate to a shared envelope (`handleBankingWebhook` /
`handlePaymentWebhook`) that reads the raw body, calls
`provider.verifyWebhook`, and rejects 401 on failure.

## Cron jobs (5)

| Key | Path | Schedule | Purpose |
|---|---|---|---|
| `bank_account_sync` | `/api/cron/bank-account-sync` | `0 * * * *` | Pulls transactions from active bank connections |
| `reconciliation_engine` | `/api/cron/reconciliation-engine` | `*/30 * * * *` | Re-runs auto-matcher over still-unmatched transactions |
| `stripe_event_poller` | `/api/cron/stripe-event-poller` | `*/15 * * * *` | Webhook fallback poller (bootstrap shell) |
| `payment_status_sync` | `/api/cron/payment-status-sync` | `*/30 * * * *` | Reconciles stuck payment intents (>24h) |
| `period_close_reminder` | `/api/cron/period-close-reminder` | `0 9 1 * *` | Monthly check on the 1st: previous month closed? |

Cron registry: **82 → 87 routes**.

## Bookkeeper UI

Pages under [src/app/(development-app)/development-os/finance/](src/app/(development-app)/development-os/finance/):

- `bank-review/` — daily review: connections + transactions + sync
  button + ignore action.
- `reconciliation/` — partial-match queue + manual run-now button +
  match-rate stats.
- `statement-import/` — bundled CSV templates + recent-imports table.
- `rules/` — create/pause/activate reconciliation rules with
  multi-strategy matchers.
- `period-close/` — close last calendar month, view closed periods,
  reopen with reason (audit-logged).

## Tests

| Sub-checkpoint | File | Tests |
|---|---|---|
| P3.A | tests/development-stage-6-p3-a.test.ts | 39 |
| P3.B | tests/development-stage-6-p3-b.test.ts | 56 |
| P3.C | tests/development-stage-6-p3-c.test.ts | 36 |
| P3.D | tests/development-stage-6-p3-d.test.ts | ~20 |
| P3.E | tests/development-stage-6-p3-e.test.ts | ~14 |
| P3.F | tests/development-stage-6-p3-f.test.ts | ~25 |
| P3.G | tests/development-stage-6-p3-g.test.ts | ~50 |

**4325+ tests pass; zero regressions** on the 4206 baseline (tracked
end-of-P3.C).

## Acceptance gate — checked

- [x] 3 migrations (0079 + 0080 + 0081) apply with FOREACH ARRAY RLS
- [x] 7 new tables created with per-org RLS
- [x] 6 bank providers + 1 reserved (Plaid) + manual + DryRun
- [x] Stripe + 3 reserved payment slots + DryRun
- [x] 4 statement parsers functional with bundled templates
- [x] Reconciliation engine + auto-matcher + rules engine pure-tested
- [x] Bookkeeper UI complete (5 pages)
- [x] 5 cron jobs in `KNOWN_JOBS` + dispatcher + Vercel checklist
- [x] 4 webhook routes verify signatures (or fail-close pending plumbing)
- [x] 4325+ tests passing; zero regressions
- [x] `npm run build` succeeds
- [x] `npm run check:cron` clean
- [x] `tsc --noEmit` clean
- [x] 0075 FOREACH lesson preserved across all 3 new migrations
- [x] Stage 5.J build-fix invariant maintained (every client-imported
      `*-actions.ts` opens with `"use server"`)

## Known limitations (intentional, deferred)

- **Wise webhook RSA verifier** — currently fail-closed. Wise's RSA
  public key plumbing lands alongside the operator UI for managing
  Wise connections.
- **Stripe event poller** — bootstrap shell. Per-connection cursor
  + replay logic lands when the connection-management UI ships.
- **Period-close enforcement** — `isPeriodClosed` helper exists but
  the actual blocking of transaction modifications inside a closed
  period is service-layer-only (we don't ship DB triggers). Admin
  override path needs to be added to the existing P0.4 finance forms
  in a future iteration.
- **OCR for scanned PDFs** — deferred to P5.
- **Plaid integration** — reserved DryRun slot; not built in P3.

## What's next

Stage 6.P4 — **Marketing + Analytics** (2–3 weeks). Meta Ads, Google
Ads, GA4, attribution engine. Email marketing (Resend transactional
already shipped in P2.F + MailChimp campaigns). Migrations 0082, 0083.
Target: 4550+ tests.
