# Sprint 4.5 — closure

**Date:** 2026-05-14
**Branch:** `main`
**Scope:** Four of the six Sprint-4 deferrals close: last-3 tax-
assistant outputs on the cabinet apex, column-mapping override UI
in the import wizard, template save/load, and receipt OCR via the
AI image-attachment channel.

Two deferrals remain open and now move to **Sprint 4.6 candidates**:
1. Live Google Sheets OAuth (Tab C in the import wizard) — needs
   the Google OAuth client + scopes config, sheet/tab listing UI,
   one-shot import flow. Material new infra; deferred to keep
   Sprint 4.5 focused on what shipped.
2. Inline AI category suggestion ("Looks like Construction
   Materials based on vendor name") on the SpreadsheetView — needs
   a small cell-level event-hook extension to SpreadsheetView +
   an on-blur RPC to the tax-assistant agent.

---

## Commits (2 new on local `main`, plus this closure)

```
5960409  feat(finance): last-3 tax-assistant + mapping override + template save/load
ce4dfb0  feat(finance): receipt OCR via AI image-attachment + quick-entry hook
```

---

## What landed

### Task 1 — Last-3 tax-assistant outputs on the CFO cabinet apex

- `CfoCabinetData.recentTaxAssistantOutputs` — new `CfoCabinetTaxAssistantOutput[]` field returning `{outputCode, title, summary, status, createdAt}` for the last 3 runs (most recent first).
- Old `latestTaxAssistantOutputCode` kept as `@deprecated` alias (`= recentTaxAssistantOutputs[0]?.outputCode`); zero breaking changes.
- Cabinet apex AI section rebuilt: was a 2-up "Latest tax / Latest QS" pair, now 3 ink-deep gradient cards (Reference 1's "ink-deep" tone) with title + summary + Review link per output. QS card preserved underneath.

### Task 2 — Column-mapping override UI in the import wizard

- Refactored the wizard's two tabs to share an `<ImportPreviewPanel>` that owns the editable `mapping` state.
- New `<ColumnMapper>` component: one select per source header; enforces "each destination field sourced from at most one column" (selecting `description` for header B drops it from header A automatically).
- `applied` derives from `(parsed, mapping)` via `useMemo` — operator changes one mapping → preview re-renders live, no parse step needed.
- Auto-mapping (heuristic English + Russian) still runs on first sight of a new `ParsedSheet`; operator overrides on top.

### Task 3 — Template save/load + server actions

- `src/lib/development/server/import-template-actions.ts` (new server actions):
  - `saveImportTemplate({ name, sourceKind, columnMapping, notes? })` — auto-bumps `version` per `(org, name)`; returns the saved row.
  - `listImportTemplates()` — highest-version-per-name, ordered by `lastUsedAt DESC NULLS LAST`. Uses a CTE + `ROW_NUMBER()` window function so we don't pay two round-trips.
  - `recordImportTemplateUse({ id })` — bumps `useCount` + `lastUsedAt`. Fire-and-forget.
  - `deactivateImportTemplate({ id })` — soft-delete via `is_active = false`.
- Backed by Sprint-4's `import_templates` table (migration 0097) + RLS policy. No schema work needed in 4.5.
- `<TemplatePicker>` component sits inside `<ImportPreviewPanel>` above the column mapper. Two columns: "Apply saved" dropdown + "Save current as" name input. Apply fires `recordImportTemplateUse` fire-and-forget; save optimistically updates the local list.

### Task 4 — Receipt OCR via AI image-attachment

- `src/lib/development/server/receipt-ocr-actions.ts`:
  - `extractReceipt({ imageBase64, mediaType })` — sends bytes through the existing `AIImageAttachment` channel (honoured by the Anthropic provider; OpenAI/Gemini ready as soon as their adapters add image input).
  - System prompt requests STRICT JSON with 7 operator-facing fields (date, amountMajor, currency, vendor, suggestedCategory, description, confidence) and "use null, never invent".
  - Tolerates markdown-fenced responses (strips ```json fences).
  - Validates accepted media types via Zod enum.
  - Never throws — typed result `{ ok, extracted } | { ok: false, reason }` so the client surfaces a friendly toast.
- `<ReceiptExtractor>` client component:
  - 3 UI states (idle → pending → result).
  - `capture="environment"` opens the rear camera on iOS/Android; falls back to file picker on desktop.
  - Strips the `data:image/...;base64,` prefix before posting.
  - Discard button resets to idle.
- Quick-entry form integration:
  - Mounts `<ReceiptExtractor>` above the `<SpreadsheetView>`.
  - `handleReceiptConfirm` invokes `bulkRecordTransactions` with one row (same minor-unit math as the bulk grid commit path).
  - "Added from receipts" emerald-soft card shows the running list of just-saved transaction codes.

**Honest scope note for Task 4**: the receipt-icon-ON-a-spreadsheet-cell inline pattern (per the original Sprint-4 spec) requires `<SpreadsheetView>` API extensions (cell-level event hooks); that's a small future-sprint polish task. Sprint 4.5 ships the working end-to-end OCR → transaction flow with the extractor as a sidecar — operator gets the value, the cell-level integration is decoration.

---

## Acceptance gates

| Gate | Result |
|---|---|
| `npm run typecheck` | clean |
| `npm run lint` on Sprint-4.5 files | clean |
| `npm test` | **6107 / 6107** passing (6093 baseline + 14 Sprint-4.5) |
| `npm run build` | succeeds; all four touched routes ship (`/cabinets/cfo-accountant` 8.19 kB · `/finance/transactions/import` 7.56 kB · `/finance/transactions/quick-entry` 6.54 kB · `/transactions/[id]` 4.91 kB) |

## Test count progression

| Sprint | Count |
|---|---|
| Pre-Sprint-1 baseline | 5964 |
| After Sprint 1 | 5984 |
| After Sprint 2 | 6013 |
| After Sprint 3a | 6030 |
| After Sprint 3b | 6044 |
| After Sprint 3c | 6063 |
| After Sprint 4 | 6093 |
| **After Sprint 4.5** | **6107** |

---

## Sprint 4.6 candidates (deferred)

1. **Live Google Sheets OAuth (Tab C UI)** — the migration + parser library + placeholder tab already shipped in Sprint 4. What's missing: Google OAuth client setup, scope config (`https://www.googleapis.com/auth/spreadsheets.readonly`), sheet/tab/header-row picker UI, one-shot import flow. Estimated 1–2 days.
2. **Inline AI category suggestion on `<SpreadsheetView>` cells** — needs a small SpreadsheetView API extension (cell-level event hooks: `onCellBlur({rowIdx, colKey, value})`) + an on-blur RPC to the tax-assistant agent that returns a suggested category chip rendered beside the cell. Sprint 4 + 4.5 deferred this; revisit when Sprint 4.6 lands.
3. **Receipt-icon ON a SpreadsheetView cell** — same SpreadsheetView API extension as #2, plus a cell-level affordance that opens the existing `<ReceiptExtractor>` in a popover.

---

## Halt

Local `main` now carries **28 unpushed commits** total:
- Stage 10.7.0 (1)
- Sprint 1 (6)
- Sprint 2 (5)
- Sprint 3a (4)
- Sprint 3b (6)
- Sprint 3c (3 incl closure)
- Sprint 4 (5 incl closure)
- Sprint 4.5 (3 incl this closure)

Operator can push when ready.
