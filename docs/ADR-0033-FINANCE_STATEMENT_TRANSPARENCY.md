# ADR-0033 — Finance & Statement Transparency Final Polish (Prompt 110)

## Status
Accepted. Implemented in migration `0032_finance_statement_transparency.sql`,
the `src/features/statement-transparency/*` modules, the
`statement_transparency_rebuild` cron job at
`src/app/api/cron/statement-transparency-rebuild/route.ts`, the new
admin hub at `/dashboard/finance/transparency[*]`, the upgraded owner
statement detail page at `/owner/statements/[id]`, additive PDF polish,
and a transparency status badge on `/owner/statements`.

## Context
Prompts 102–109 produced the operational chassis for the management
OS:
- Direct booking pipeline + finance reconciliation (105–107).
- Owner portal direct-booking surface + revenue projection (108).
- Guest booking notifications + status center (109).

Owner statements existed (Prompts 4–5) and had a deterministic
plain-language explanation. But:

1. **Owners couldn't see *which source* contributed which dollar.**
   Statement lines were grouped by `lineType` only; a direct booking
   line and an OTA line both rendered as generic "Revenue".
2. **Pending finance bridges were invisible.** Owners had no signal
   when a confirmed direct booking, a guest service, or an owner-stay
   charge was still in the queue at statement issue time.
3. **Locked-period skips were silent.** When a finance bridge
   couldn't post into a closed period, the statement looked clean
   but the cash flow was actually deferred.
4. **Admins had no traceability dashboard.** To debug a missing line
   you had to walk the bridge tables manually.

We needed an owner-safe transparency layer that explains the statement
without changing accounting semantics — a derived view, never a
system of record.

Hard rules for Prompt 110:
- Owners must never see raw `revenue_line_id` / `expense_line_id` /
  `statement_line_id` / `*_finance_link_id` / `provider_session_id` /
  `webhook_payload` / `config_private_encrypted` / `token_hash` /
  guest contact info.
- Already-issued statements must not be retroactively edited.
- No real PSP integration. No bank rails.
- Existing PDF must keep working; transparency polish is additive.

## Decision

### 1. Four new tables
[`drizzle/0032_finance_statement_transparency.sql`](../drizzle/0032_finance_statement_transparency.sql):

| table | purpose |
|---|---|
| `statement_source_groups` | Per-statement, per-source-bucket aggregate (gross / deductions / net) with a stable owner-safe label |
| `statement_source_group_lines` | Internal bridge group ↔ statement_lines, carries the redacted owner label and a `source_trace_status` enum |
| `statement_reconciliation_warnings` | Admin + owner-safe warning layer with severity (info/warning/critical), status (open/acknowledged/resolved/dismissed), partial UNIQUE on `(warning_type, source_table, source_id)` while open |
| `statement_explanation_snapshots` | Deterministic owner-facing copy: headline, summary, bullets, payout/revenue/deduction/reserve/warning explanations (UNIQUE per statement) |

CHECK constraints pin all enums:
- `group_key` ∈ 14 values (direct_booking_revenue → other).
- `source_trace_status` ∈ 6 values (linked → archived_source).
- `warning_type` ∈ 15 values, `severity` ∈ {info,warning,critical},
  `status` ∈ {open,acknowledged,resolved,dismissed}.

All four are RLS-forced internal-only with `owner_self_read` policies
keyed off `public.current_owner_ids()`. Owner reads on
`statement_source_groups` / `statement_reconciliation_warnings` are
gated by `owner_visible = true`. Group lines inherit visibility
through their parent group via an `EXISTS` subquery.

### 2. Statement source grouping design
Pure helpers in
[`grouping-pure.ts`](../src/features/statement-transparency/grouping-pure.ts):

- `classifyStatementLineSource(line, ctx)` returns exactly one
  group key. Order: direct booking → guest service → OTA → owner
  stay → service fulfilment → maintenance → utility → inventory →
  management fee → tax → reserve → payout → adjustment → other.
- `ClassificationContext` carries hints loaded from
  `revenue_lines.source` / `revenue_lines.revenue_type` /
  `booking_channels.key` / `expense_lines.expense_type` plus the
  finance-link source-id sets (direct booking / owner stay / guest
  service / service fulfilment).
- `directionForStatementLine(line, groupKey)` returns
  `revenue` / `deduction` / `neutral` so aggregates can compute
  `net = gross − deductions` deterministically.
- `buildStatementSourceGroups(lines, ctx)` produces the per-bucket
  aggregate list, sorted by a stable group sort order.
- `buildStatementGroupLines(lines, groups)` produces the bridge
  rows; a missing `source_id` becomes `missing_source`, an
  `adjustment` line type becomes `manual_adjustment`, otherwise
  `linked`.
- `formatOwnerSafeSourceLabel({groupKey, description})` strips
  booking codes (`DBF-DEMO-0001`) and trims long descriptions to
  ≤ 80 chars, falling back to the group label for empty input.

### 3. Explanation snapshot logic
[`explanation-pure.ts`](../src/features/statement-transparency/explanation-pure.ts):

- `buildStatementExplanationSnapshot(input)` is fully deterministic
  — same input, same output. Returns the full snapshot shape:
  headline, summary, 4-7 bullets, payout/revenue/deduction/reserve/
  warning explanations, currency totals, net payout.
- `buildPayoutExplanation` produces three branches: deficit
  (negative), zero, or positive. Negative copy explicitly tells the
  owner the deficit will roll into the next statement.
- `buildWarningExplanation` returns `null` when there are no
  warning/critical items; otherwise tone shifts depending on
  severity.
- `BANNED_EXPLANATION_TOKENS` is a constant array used by the test
  grep to assert no internal vocabulary leaks into the rendered
  snapshot.

### 4. Reconciliation warning logic
[`reconciliation-pure.ts`](../src/features/statement-transparency/reconciliation-pure.ts):

- `WARNING_TYPES` — 15 values; each has internal title/message and an
  optional owner title/message (`null` ⇒ internal-only by default).
- `warningSeverity(type, ctx)` escalates pending direct-booking /
  guest-service revenue to **critical** when the statement is
  already issued / approved (the missing line now affects an
  expected payout).
- `shouldOwnerSeeWarning(type, ctx)` hides pending-bridge warnings
  on `draft` statements; `missing_source_trace` /
  `unallocated_expense` / `manual_review_required` /
  `duplicate_source_risk` / `stale_projection` are always
  internal-only.
- `buildReconciliationStatus(warnings)` collapses to
  `healthy` / `needs_review` / `critical`.
- `buildReconciliationHealthScore(warnings)` returns a 0-100 number
  (critical = −25, warning = −10, info = −2).
- `detectStatementWarnings(input)` walks the four pending finance
  bridges + the locked-period skipped set + the negative-payout +
  currency-mismatch + missing-source-trace checks to produce
  candidate rows.

### 5. Owner portal upgrades
- `/owner/statements/[id]` — added Revenue source breakdown,
  Charges & deductions, "Why this number" (snapshot with fallback),
  Items needing your attention (owner-visible open warnings only),
  Linked activity (owner_booking_summaries with `statement_id =
  this.id`). The legacy `StatementDetail` component still renders
  on top, so the existing layout is preserved.
- `/owner/statements` — added a `TransparencyStatusBadge`
  ("Ready" / "Needs review" / "Critical review") next to each
  statement.
- `/owner/revenue` — added a footer note: "Statements are the
  canonical financial record; revenue projections on this page are
  for operational transparency."

### 6. Admin transparency routes
- `/dashboard/finance/transparency` — hub with metrics (total /
  snapshotted / open warnings / critical warnings / last rebuild) +
  recent statements table + Rebuild-all button.
- `/dashboard/finance/transparency/statements` — full statement
  table with reconciliation badges + per-row Rebuild buttons.
- `/dashboard/finance/transparency/statements/[id]` — admin detail
  with explanation card, source breakdown, internal source trace,
  full warnings list, and Rebuild button.
- `/dashboard/finance/transparency/warnings` — filterable warnings
  table (status × severity) with Acknowledge / Resolve / Dismiss
  actions.
- `/dashboard/finance/transparency/rebuild` — manual rebuild forms
  (all recent statements / single owner / single statement via the
  detail page).
- Cross-link added on
  `/dashboard/finance/statements/[id]` → "Open transparency".

### 7. PDF changes
The existing React-PDF renderer is preserved. Additive changes only:
- `OwnerStatementPdf` accepts an optional
  `explanationSnapshot` prop (headline / summary / bullets /
  payoutExplanation / warningExplanation).
- When the snapshot is present, the PDF renders the snapshot's
  headline + summary + bullets + payout note + (in accent colour)
  the warning note. When absent, it falls back to the deterministic
  `generateStatementExplanation` output (existing pre-110
  behaviour).
- `renderOwnerStatementPdf` loads the snapshot best-effort via
  `getStatementExplanationSnapshot`. Missing snapshot is benign —
  the PDF still renders.

### 8. Rebuild job + cron
- [`statement-transparency-rebuild-job.ts`](../src/features/jobs/statement-transparency-rebuild-job.ts)
  — calls `rebuildAllStatementTransparency({})` over the default
  window (statements with `period_end ≥ today − 120 days` in
  status `draft`/`issued`/`approved`).
- Job catalog entry: cron `0 5 * * *`, jobType `owner_intelligence`,
  timeout 300s, 0 retries (idempotent — re-run on the next day).
- Cron route at `/api/cron/statement-transparency-rebuild` wraps
  `handleCronJobRequest(request, "statement_transparency_rebuild")`.
- Wired into `KNOWN_JOBS`, `JobKey`, `executeJob`, `executeAllJobs`.

### 9. Permissions matrix additions

| key | super_admin | director | finance_manager | accountant | operations_manager | property_manager | booking_manager | revenue_manager | investor_owner | investor_viewer | concierge / field |
|---|---|---|---|---|---|---|---|---|---|---|---|
| `statement_transparency.read` | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | — |
| `statement_transparency.manage` | ✓ | ✓ | ✓ | ✓ | — | — | — | — | — | — | — |
| `statement_reconciliation.read` | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | — | — | — |
| `statement_reconciliation.manage` | ✓ | ✓ | ✓ | ✓ | — | — | — | — | — | — | — |

Investor / investor_owner read transparency only; no manage.
Concierge / housekeeper / technician / agent / field excluded.

### 10. Seed data
[`drizzle/seed.sql`](../drizzle/seed.sql) appended a guarded P110
seed:
- Picks the most recent issued/approved/paid `owner_statement` (if
  any) and seeds 7 source groups (direct booking, OTA, guest
  services, owner-stay charges, utilities, management fees,
  reserves) with realistic amounts.
- Adds 5 reconciliation warnings (pending direct booking + locked
  period skipped + missing source trace + currency mismatch +
  manual review required) — three open + one acknowledged.
- Adds one ready explanation snapshot.
- Idempotent: skips if the source groups for that statement already
  exist; no-ops gracefully when no statements exist yet.

## Consequences

### Positive
- Owners now see direct-booking, OTA, guest-service, and owner-stay
  contributions called out separately on every statement.
- Pending finance bridges surface to owners only when they affect
  an issued statement, with friendly copy.
- Locked-period skips are visible to admins inline with the
  statement they affect.
- Admins have a one-click rebuild for any statement and a single
  filter+resolve view for warnings.
- The existing PDF renderer keeps working; the snapshot is purely
  additive.
- The redaction contract is enforced by three pure modules
  (`grouping-pure.ts`, `explanation-pure.ts`,
  `reconciliation-pure.ts`) and source-grep tests pin it.

### Negative / risks
- The rebuild service does N inline INSERTs per statement (one per
  group + one per group line). For statements with hundreds of
  lines this runs in a single request; a batched insert pattern
  would be more efficient if statement size grows.
- Warning detection currently looks at every direct-booking /
  guest-service / service-fulfilment finance link in the database.
  At very large scale this should be filtered by the period + a
  bounded LIMIT, but for current volumes it's fine.
- The rebuild deletes existing groups + group_lines + the snapshot
  for the statement and reinserts. ON DELETE CASCADE keeps it
  consistent, but the operation should not run mid-issue against a
  statement under simultaneous edit. Statement issuance + transparency
  rebuild today happen in different paths; tighter ordering may be
  needed if that ever changes.

### Out of scope (deferred)
- Real PSP / bank statement integration.
- Per-currency FX conversion in the explanation snapshot.
- Per-line owner-visible footnotes (the layer currently surfaces
  per-group totals only).
- Audit trigger coverage on the new tables (Prompt 111).
- Backup / restore runbook (Prompt 111).

## Recommended next prompt
Prompt 111 — Security Baseline & Operational Hardening: implement
MFA / TOTP enrolment, login throttling, cron / job concurrency locks
with `FOR UPDATE SKIP LOCKED`, notification delivery locking,
audit-trigger coverage for sensitive finance / auth tables, and a
backup / restore runbook. Keep user-facing UX polished and do not
change business logic.
