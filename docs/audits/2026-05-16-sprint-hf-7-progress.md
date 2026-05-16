# HF-7 + DEMO-1 — progress doc (halted at context boundary after Phase A P0)

**Date**: 2026-05-16
**Status**: 3 of 7 Phase A tasks shipped (the P0 bugs); A4–A7 and all of Phase B deferred to a follow-up sprint per the spec's "context window pressure → append progress, await resume" halt condition.

---

## Why this sprint stopped here

The brief was a single sprint covering 7 bug fixes (Phase A) plus a comprehensive 17-entity demo seed (Phase B) of ~1000+ rows. After ~12 prior sprints today, the agent context is too constrained to safely tackle the full scope in one execution. The P0 bugs were the operator's top priority — those are shipped. The remaining P1 polish + the demo seed need a fresh agent session.

The seed (Phase B) is the larger of the two remaining chunks and is best split into a dedicated DEMO-1 sprint with the operator's real XLSX as input (the reference file at `/mnt/user-data/uploads/Arconique_Daily_Expenses_Team_s-2.xlsx` wasn't accessible from this agent environment — recommend re-attaching for the next run).

## Phase A — what shipped

### A1 ✅ Receipt upload — error surface fixed
- **File**: `src/lib/development/server/receipt-ocr-actions.ts`, `src/app/(development-app)/development-os/finance/transactions/quick-entry/receipt-extractor.tsx`
- **Root cause**: when `ANTHROPIC_API_KEY` / `OPENAI_API_KEY` / `GEMINI_API_KEY` is unset, `getAIProvider()` falls back to the dry-run stub which returns `{"acknowledged":true}`. The action parsed this as an all-null extraction and reported success — leaving the operator staring at empty receipt fields with no explanation.
- **Fix**: action now short-circuits with `ai_not_configured` error when `isAiDryRun() || !isAiConfigured()`. UI shows a human-readable message: "Receipt OCR needs an AI key. Ask the platform admin to set ANTHROPIC_API_KEY (or OPENAI_API_KEY / GEMINI_API_KEY) in the deployment environment."
- **Operator action**: if receipt upload still fails after this deploy, **add the AI key to Vercel env vars**. This is the most likely root cause per the spec's halt note ("Receipt upload root cause is environment variable (Vercel secret), not code — operator must add to Vercel").

### A2 ✅ Quick-entry duplicate transactions — fixed at root
- **File**: `src/components/ui/primitives/spreadsheet-view.tsx`
- **Root cause**: `SpreadsheetView` had TWO commit triggers — `Ctrl/Cmd-S` keyboard handler and `onBlur={() => commit()}` on every cell input. Pressing Ctrl-S also caused the input to blur, which fired commit() a second time. Result: every save inserted the row twice.
- **Fix**: removed the `onBlur={() => commit()}` (commit is now explicit Ctrl/Cmd-S only); added an in-flight guard inside `commit()` so any future re-introduction of an auto-commit path (e.g. a Save button) cannot recreate the bug. The guard releases on a 500ms timer so the next legitimate save works.

### A3 ✅ Delete button on transactions list
- **Files**:
  - `src/components/development/finance/transaction-delete-button.tsx` (new client component, confirmation modal)
  - `src/lib/development/server/transaction-actions.ts` (new `deleteTransaction` server action — org-scoped, reverses the bank-account balance delta, refuses reconciled/capital-linked rows)
  - `src/app/(development-app)/development-os/finance/transactions/page.tsx` (added trailing column with the delete button)
- **Behavior**: trash icon per row → confirmation modal → hard delete + balance reversal in a single DB transaction. Failure paths (reconciled rows, capital-linked rows) surface inline with operator-readable explanations.
- **No new schema** — no soft-delete column added this sprint; hard delete reverses the bank-account delta atomically.

## Phase A — what's deferred

### A4 🚧 Cross-link bookkeeper cabinet ↔ /finance/transactions (P1)
Should be ~10 lines: add a "View all transactions →" link on `/development-os/cabinets/cfo-accountant` near the relevant widgets, mirror "+ Quick entry" + "Import CSV/XLSX" CTAs on `/development-os/finance/transactions` (the page already has a Quick-entry trigger; check if Import is there).

### A5 🚧 Tax types — Add functionality (P1)
Need to inventory `/development-os/finance/tax-types` first. If the page exists but lacks Add modal, follow the bank-account-modal-form pattern. If the page doesn't exist, build it from the cost-categories pattern. ~1–2 hours.

### A6 🚧 Consolidate 3 Invoices sections (P1)
Operator screenshot referenced Invoices in BUILD & SELL, CAPITAL, and SERVICE FULFILMENT. Likely 3 distinct entities (sales / vendor / service) needing rename for clarity rather than merge. Investigation + decision doc, no code change yet.

### A7 🚧 Admin view-as-investor preview (P1)
Requires session-level "preview role" cookie + middleware support. ~half a day. Document as preview-only feature.

## Phase B — DEMO-1 demo seed (entire phase deferred)

Phase B was scoped for 17 entity seeds (~1000+ rows) including projects, bank accounts, transactions (150), villas, owners, bookings, investors, site reports, BoQ docs, procurement, materials, leads, maintenance, AI runs. This is a focused full-day task — better as a standalone sprint with the operator's actual XLSX file attached to the agent environment for canonical schema reference.

Recommended next-sprint shape (DEMO-1):
1. Make the XLSX file readable from the agent environment (re-attach).
2. Create `scripts/seed-arconique-demo.ts` with `--wipe` mode and `DEMO-` prefix on every code.
3. Run targeted at the operator's org_id.
4. Add `/settings/demo-data` admin route with row counts + wipe button.
5. Closure doc cataloging seeded row counts per table.

The seed script's idempotency + wipe semantics are the most important design decision — recommend dry-running against a staging org first before touching production.

## Gates after Phase A partial ship

| Gate | Result |
|---|---|
| Typecheck | exit 0 |
| RSC audit | 0 violations |
| Build | clean compile in 35.3s |
| Modal smoke | **12 passed, 1 skipped** (the maintenance-template `test.skip` from COMPLETE-1 is unchanged) |
| HF-5 baseline | still empty |

## Files changed

```
src/lib/development/server/receipt-ocr-actions.ts                                  +17 / -1
src/app/(development-app)/development-os/finance/transactions/quick-entry/receipt-extractor.tsx  +13 / -1
src/components/ui/primitives/spreadsheet-view.tsx                                  +29 / -5
src/lib/development/server/transaction-actions.ts                                  +93 / -0
src/components/development/finance/transaction-delete-button.tsx                   (new, 88 lines)
src/app/(development-app)/development-os/finance/transactions/page.tsx             +9 / -1
tests/e2e/modal-smoke/hf7-quick-entry-no-dupe.spec.ts                              (new, 40 lines)
docs/audits/2026-05-16-sprint-hf-7-progress.md                                     (this file)
```

## Operator deployment + next-sprint resume

After this lands:

1. **Add the AI key to Vercel** (`ANTHROPIC_API_KEY` or your provider of choice) — without it, receipt OCR shows the new clearer error instead of empty fields, but real receipts still won't be read.
2. **Re-test the quick-entry save** — saving 1 row should produce exactly 1 row in the transactions list. (The Playwright test added in this sprint only verifies the page mounts without errors; row-counting verification needs a seeded bank account.)
3. **Try the delete flow** on a non-reconciled transaction. The bank-account balance should reverse atomically.
4. **Schedule a follow-up sprint** for A4–A7 + Phase B. DEMO-1 is the bigger one — recommend dedicating a full session with the XLSX file re-attached.
