# Bookkeeper brief — Stage 10.C

**Status:** draft (interviews pending)
**Last updated:** 2026-05-08
**Stage 10 phase consumer:** 10.C Bookkeeper Rapid-Entry
**Existing surfaces (codebase):**
- `/development-os/finance/transactions` — list view
- `/development-os/finance/invoices` — invoice list + detail
- `/development-os/finance/reconciliation` — bank-tx → ledger match
- `/development-os/finance/statement-import` — CSV upload
- `/development-os/finance/period-close` — month-end checklist
- `/development-os/cabinets/cfo-accountant` — composite landing
- Server actions: `src/lib/development/server/finance/*-actions.ts`

---

## 1. Who is this person?

- **Title variants:** bookkeeper, accountant, finance assistant, junior accountant
- **Tenure / skill profile:** 2-10 years; comfortable with debits/credits, Excel power user, may have used QuickBooks/Xero
- **Device profile:** desktop primary (90%+); secondary monitor common; phone for receipt photos only
- **Working context:** office, 4-6 hours/day on data entry + reconciliation
- **Volume:** 50-200 transactions/day for a 5-15 villa portfolio; spikes to 500+ at month-end
- **Reports to:** finance manager / CFO. Team size: solo or pair.

## 2. Top-3 daily tasks (placeholder — interviews to confirm)

1. **Rapid invoice/expense entry** — ~2-3 hours/day — currently in QuickBooks or spreadsheet
2. **Bank reconciliation** — ~1-2 hours/day — currently statement-import + manual match
3. **Month-end close + variance report** — concentrated 2-3 days/month

## 3. Friction (verbatim from interviews — TBD)

> "{quote}" — placeholder

Pattern hypothesis: the current `/finance/transactions` flow is form-heavy and mouse-driven. Excel-style keyboard navigation is missing. Each row is a roundtrip through a modal.

## 4. Refusal points (hypothesis — verify in interviews)

- Forms that require >2 clicks per field
- Loading spinners between rows
- Re-entering vendor / category every time (no autocomplete from history)
- Anything that loses unsaved data on validation error

## 5. Reference-app patterns to adopt

From `docs/ux-research/reference-apps/bookkeeper.md` (TBD by background research):
- **Pattern A** — Excel-style spreadsheet entry: Tab → next cell, Enter → next row, autocomplete from prior entries
- **Pattern B** — bank-feed match with confidence score + one-click accept
- **Pattern C** — duplicate detection at entry time (not after)

Anti-patterns:
- Modal-per-row data entry
- Required fields that should be inferable (category from vendor history, currency from account)

## 6. Proposed flow (sketch — fill from interviews)

### Flow 1: Rapid invoice entry (target: 5 sec/row vs. ~30 sec today)

```
Click "New batch"
  → spreadsheet opens with 25 blank rows
  → Tab moves through: Date | Vendor | Category | Amount | Currency | Memo
  → Vendor autocompletes from past 90 days (most-used first)
  → Category autocompletes from vendor's last category (1-click confirm)
  → Enter saves row + advances; row turns green if valid, red if missing
  → Ctrl-D duplicates row above (recurring expense pattern)
  → Save commits all green rows; red rows stay editable
```

### Flow 2: Reconciliation triage (target: 80% auto-matched)

```
Statement uploaded → list view shows:
  ✓ auto-matched (confidence > 0.9) — accept-all checkbox
  ? probable matches — side-by-side card, accept/reject/manual
  ✗ unmatched — single-click create-new-tx form
```

### Flow 3: Month-end close

```
Period-close page surfaces:
  - tx not categorized: count + jump-to-fix link
  - bank balances differ: count + reconciliation link
  - missing receipts: list with upload button
  - "Lock period" button (disabled until all 3 are zero)
```

## 7. Acceptance criteria (consumed by Stage 10.C)

- [ ] Bookkeeper enters 50 transactions in ≤5 minutes (spreadsheet view, keyboard-only)
- [ ] Auto-categorize accuracy ≥80% on second occurrence of a vendor
- [ ] Reconciliation auto-match ≥70% on a clean statement (typical Indonesian bank CSV)
- [ ] Month-end close checklist surfaces all blockers in ≤3 clicks from `/finance/period-close`
- [ ] Zero data loss on validation error (red rows stay editable in batch view)
- [ ] Bookkeeper completes 1-week catch-up in ≤2 hours (vs. estimated 6+ hours today)

## 8. Out of scope for Stage 10

- Full ledger / chart-of-accounts editor (existing surface OK)
- Tax-engine logic changes (Stage 7 + 9 already shipped finance pieces)
- AI-powered receipt OCR (Stage 11 candidate)
- Multi-currency revaluation UI (`finance/fx` already covers it)

## 9. Open questions

- Do bookkeepers want an "AI suggest" button per row, or does that interrupt rhythm?
- How often do they actually use mobile for receipts? (interview question — affects whether we ship a phone capture flow in 10.C or defer)
- How long is the typical "catch-up" window from a new customer migrating in?

---

## Provenance

- Reference-app catalog: `docs/ux-research/reference-apps/bookkeeper.md`
- Interview synthesis: `docs/ux-research/interviews/bookkeeper/synthesis.md` (pending)
