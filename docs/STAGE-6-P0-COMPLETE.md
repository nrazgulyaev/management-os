# Stage 6.P0 — Complete

**Sub-stage**: P0 — CRUD Foundation (per Stage 6 master plan)
**Span**: P0.1 (forms audit) → P0.7-D + P0.8 (final sub-checkpoint).
**Status**: ACCEPTED.

This is the rollup acceptance document for Stage 6.P0. It does not retell every sub-checkpoint — those have their own commit history and sub-checkpoint test files. It records what landed, what carried forward, and what the P1 entry conditions are.

---

## What landed

### Migrations
- **0075_development_os_stage_6_p0_bulk_import.sql** — `bulk_import_jobs` (FSM-driven) + `oauth_connections` (idle until P5). Per-org RLS via `is_in_user_organization()`. Inline `source_content TEXT` column for CSV/JSON text and base64-encoded XLSX.

### Bulk import (P0.4 + P0.7-A/B/C/D)
- Pure helpers: CSV (papaparse), XLSX (SheetJS), field-mapper (auto-suggest + transform + default), per-entity Zod validators (8 strict, 5 passthrough).
- Server actions: `createBulkImportJob`, `validateBulkImportJob`, `processBulkImportJob`, `cancelBulkImportJob`, `listBulkImportJobs`, `getBulkImportJob`. FSM: pending → validating → ready → processing → completed | failed | cancelled.
- **Per-entity insert dispatcher** (`entity-dispatcher.ts`, P0.7-D.1) — bridges the bulk pipeline to the existing `create*` actions. Supports 9 entities with real inserts (transactions, vendors, buyers, investors, leads, site_reports, tasks, inventory_items, qa_qc_issues). 4 entities (materials, invoices, reservations, contacts) return per-row errors with explanation — they require nested children or composite checks a flat row cannot express.
- Cron processor + route at `/api/cron/dev-os-bulk-import-processor` (route 73) — picks status='ready' jobs and stale 'processing' rows; honors `processed_rows` for resumable batches.
- **Audit emit on completion** (P0.7-D.4) — `bulk_import.completed` / `bulk_import.failed` events written to `audit_events`. Cron-safe (passes explicit ipAddress/userAgent nulls so the audit service skips its `headers()` lookup).
- Single-page wizard simulating 6 steps as collapsible sections; client-side parsing for instant feedback; past-jobs list page.

### Per-entity exports (P0.5 + P0.7-D.2)
- `exportEntityData({ entity, format, filters })` — CSV/XLSX/JSON, base64 inline blob, 10K-row cap.
- ExportButton component mounted on **12 list pages** (transactions, invoices, vendors, buyers, materials, reservations, site_reports, leads/sales, investors, qa-qc, schedule/tasks, inventory items).
- All 12 entity branches in `fetchRowsForEntity` are now functional — no empty stubs.

### Forms (P0.3 across the whole sub-stage)
- Modal-form pattern (`EntityModal` + `useActionState` + `SubmitButton`) for ~24 high-frequency entities. Workflow-verb naming.
- Server actions converted to `"use server"` (Stage 5.J build-fix invariant carried forward).

### Detail-page wiring (P0.8.6)
- DiscountProposalModalForm mounted on contract detail. Reads villaId/contactId/totalContractValueUsdMinor from the group, passes proposedByUserId from the request context.
- ContractModalForm — **carry-forward**: requires a reservation detail page (none exists today). Wire when that page lands in P1.

### List-page additions (P0.8.1 → P0.8.4)
- Invoices: status-counts chip strip above the existing form filter. Click-to-toggle preserves type/project params.
- Vendor detail: `MetricCard` for invoice count + outstanding total; "Linked invoices" section with clickable rows.
- Cost categories: per-category transaction count + USD-spend badge ("8 tx · $42K"); explicit "unused" badge for zero-spend categories.
- Cost categories: per-row archive button (two-click confirm, hidden when already inactive). Other entity archive controls — **carry-forward**: server-side `deactivate*` actions don't exist for vendors/buyers/investors etc.

### Tier 5 admin (P0.8.5)
- New page `/development-os/platform/organizations/[code]` — per-org settings: identity fields, module toggles, archive flow with required reason. List page made clickable.
- Users invite UI — **carry-forward**: requires SaaS-tier user-invitation flow (cross-org invitations + email delivery via Resend) which is P5/P6 territory.

### Documentation (P0.7-D.5)
- `docs/GOOGLE-OAUTH-SETUP.md` — explicit deferral with rationale. Workaround (CSV export from Sheets) documented. Lists the Google Cloud Console + env-var setup the user will need to action when P5 begins.

---

## Tests

| Sub-checkpoint | Test file | Tests added |
|---|---|---:|
| P0.4 | `tests/development-stage-6-p0-4.test.ts` | (existing) |
| P0.5 + P0.6 | `tests/development-stage-6-p0-5-6.test.ts` | (existing) |
| P0.7-A (helpers) | `tests/development-stage-6-p0-7-helpers.test.ts` | 55 |
| P0.7-B + C (actions/cron/wizard/export) | `tests/development-stage-6-p0-7-bc.test.ts` | 64 |
| P0.7-D + 0.8 (this checkpoint) | `tests/development-stage-6-p0-7-d-08.test.ts` | 55 |

Final suite: **3453 tests passing, zero regressions, zero skipped.** TypeScript strict-mode clean (`tsc --noEmit` exit 0).

The P0 plan's stretch target was 3498. We landed at 3453 — short of the stretch by 45. Reason: tests in the existing infrastructure are file-presence + grep based (no JSDOM). Honest E2E tests would have needed a Playwright/JSDOM harness build-out, which is itself a multi-day side-quest. Recommendation: defer the test-infra build-out to a P1 housekeeping sprint where the channel-manager OAuth and webhook flows make E2E tests genuinely valuable.

---

## Carry-forward to P1

These items were intentionally deferred. Each names what triggers re-engaging the work.

| Item | Why deferred | When to revisit |
|---|---|---|
| Live Google Sheets OAuth | Needs Google Cloud Console setup outside session scope; "dry-run-only" OAuth doesn't earn its keep | **P5 — Productivity Tools.** Workaround documented in `GOOGLE-OAUTH-SETUP.md` |
| ContractModalForm wiring | Needs a reservation detail page that doesn't exist today | When reservation detail page lands (likely P1 booking-channel work) |
| Per-row archive on vendors/buyers/investors/etc. | Backend `deactivate*` actions don't exist; one-sided UI is worse than none | When the multi-tenant lifecycle policy ships (likely P1 with `archived_at` columns added per-entity migration) |
| Cross-org user invite flow | Email delivery + per-org RLS for invite tokens isn't built | P6 (AI agents activation) or earlier if needed for SaaS sales |
| Real E2E tests (Playwright/JSDOM) | Infra build-out worth more after P1 webhook flows exist | P1 housekeeping sprint |
| Materials / Invoices / Reservations bulk import | Each requires nested children (po_lines, invoice_lines) or composite domain checks (booking conflicts) that flat CSV rows cannot express | Each entity's per-form flow already exists; revisit only if operators ask |

---

## P1 entry conditions

P1 is **Booking Channels** (3–4 weeks per Stage 6 plan): six channel providers, channel inventory + reservations + sync log, oauth_connections gets first real use, integrations health hub.

Pre-P1 checklist (these are all satisfied today):
- [x] Migration 0075 applied locally + production
- [x] `bulk_import_jobs` + `oauth_connections` tables exist and tested
- [x] Audit-event writer (`recordAuditEvent`) is cron-safe — P1's webhook handlers can write to it without request context
- [x] Per-entity dispatcher pattern proven — P1 channel reservations can extend by adding a `reservations` handler that does the multi-table inserts + conflict checks
- [x] ExportButton + bulk-import wizard land cleanly with the launch-prompt UI conventions — P1's channel-mapping UI can reuse the same wizard pattern
- [x] Documentation pattern established (`STAGE-6-P0-COMPLETE.md` + `GOOGLE-OAUTH-SETUP.md`) — P1 will produce `STAGE-6-P1-COMPLETE.md` and per-channel setup docs

---

## Verification commands

```bash
# Type-check (must exit 0)
npx tsc --noEmit -p tsconfig.json

# Test suite (must show 3453+ passing)
npx tsx --test tests/*.test.ts | tail -10

# Cron route checklist (must show no missing entries)
npm run check:cron

# Production build (must compile)
npm run build
```

---

## Next: Stage 6.P1 — Booking Channels

Open the master plan, walk Phase P1's spec, and decide on the per-org credential model decision (open architecture decision #1 in the plan). Then start with P1.0 — `oauth_connections` activation + `channel_connections` migration design.
