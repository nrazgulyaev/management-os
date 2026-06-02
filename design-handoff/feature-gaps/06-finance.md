# Feature gap · 06 · Finance / Statements (Mgmt P1)

> ## ⚠️ GROUND-TRUTH CORRECTION (2026-05-29 · GitHub pull · see `_ground-truth-2026-05-29.md`)
> Built very deep — **31 pages** under `/dashboard/finance`: `page.tsx` 15kb + `expenses` / `fees` / `material-usage` (4.8kb) / `payouts` / `periods`(+`[id]`) / `reserves`(+`balances`) / `revenue` / `statements`(+`[id]`+`pdf` route) / `taxes` / **`transparency`**(+`warnings` 6.2kb +`statements/[id]` +`rebuild`). Feature: `finance/`. **Discard "not built".** `statement_reconciliation_warnings` (drizzle 0032) is fully surfaced at `/finance/transparency/warnings`. Surviving: re-verify any statement-schema gap against drizzle 0032/0003 — most are likely already shipped.

**Design sources**
- Desktop: `cabinets/mgmt-p1/finance.html` (gold standard per CLAUDE.md)
- Mobile: `mobile-pass-mgmt-p1.html` § cabinet 02
- Phase: 2.2 mgmt-02 · commit `03ea835`

**Repo paths (imported)**
- Feature data: `src/features/finance/{actions,allocation,calculations,explanation,reserve-balances,schema,statement-actions,validation}.ts` (8 imported); plus on disk in `_repo`: `finance-cabinet-queries.ts` (22kb), `services.ts` (21kb), `statement-generation.ts` (17kb), `statement-generator.ts` (25kb), `material-usage-bridge*.ts` (3 files, 16.6kb), `pdf/owner-statement-pdf.tsx` (12kb), `statement-pdf.tsx` (7.6kb)
- Schema · core (mig 0002): `revenue_lines`, `fee_lines`, `expense_lines`, `tax_lines`, `reserve_movements`, `management_fee_lines`, `owner_statements`, `owner_statement_lines`
- Schema · transparency (mig 0032): `statement_source_groups`, `statement_source_group_lines`, `statement_reconciliation_warnings`, `statement_explanation_snapshots` with RLS owner-self-read policy
- Schema · statement engine v1 (mig 0104): owner statement engine extensions
- Schema · statement PDF (mig 0003): statement PDF linkage to owner stack
- **Not imported:** `src/components/finance/*` (25 files), `src/app/(dashboard)/dashboard/finance/*` (31 files) — exist in repo, gated on fresh paths-import.

## TL;DR

Finance / Statements is the **largest single-cabinet codebase in the audited set** by raw bytes: ~150kb across 18 feature files including `statement-generator.ts` (25kb, the canonical compute), `statement-generation.ts` (17kb, the orchestrator), 22kb `finance-cabinet-queries.ts` (vs other cabinets' stub queries), and a dedicated `pdf/owner-statement-pdf.tsx` (12kb React-PDF surface). Schema is extraordinarily mature: **4 migrations dedicated to statements** (0002 finance engine · 0003 PDF linkage · 0032 statement transparency · 0104 statement engine v1), with **two purpose-built bridge layers** — `statement_source_groups` (admin-vs-owner redaction seam) and `statement_explanation_snapshots` (deterministic owner-facing explanation, RLS-protected for owner-self-read). The `material-usage-bridge*.ts` trio (10.7kb + 2kb pure + 3.9kb actions) handles a cross-cabinet seam to Operations cabinet's materials tracking. **This cabinet has no P0 gaps remaining** — the gold-standard rating per CLAUDE.md is correct. P1 cleanup belongs to mobile parity and a few edge-case agents.

---

## Section-by-section (inferred from code structure + design promise)

### Statement generation engine

| Element | Status |
|---|---|
| `statement-generator.ts` (25kb) — canonical compute, single source of truth | ✅ shipped |
| `statement-generation.ts` (17kb) — orchestrator, runs the generator + persists snapshots | ✅ shipped |
| `explanation.ts` (4.2kb) — admin vs owner-safe explainer split (same pattern as dynamic-pricing.explainer.ts) | ✅ shipped |
| `allocation.ts` (2.8kb) — pro-rata allocation across ownership_shares | ✅ shipped |
| `calculations.ts` (2.1kb) — pure math helpers | ✅ shipped |
| `validation.ts` (1.7kb) — pre-generation guards | ✅ shipped |
| `schema.ts` (4.3kb) — Zod with statement-domain validation | ✅ shipped |
| `services.ts` (21kb) — DB reads with mock fallback | ✅ shipped |
| `actions.ts` (21kb) — server actions for statement CRUD + adjustments | ✅ shipped |
| `statement-actions.ts` (5.3kb) — statement-specific actions (issue, void, regenerate) | ✅ shipped |

### Transparency layer (mig 0032)

| Element | Status |
|---|---|
| `statement_source_groups` (admin-only categorisation) | ✅ schema |
| `statement_source_group_lines` (internal bridge group ↔ statement_lines) | ✅ schema |
| `statement_reconciliation_warnings` (admin warning + owner-safe variant) | ✅ schema |
| `statement_explanation_snapshots` (owner-facing explanation, RLS owner-self-read) | ✅ schema + policy |
| Generator is the redaction seam (per mig 0032 comment) | ✅ enforced by code path |

### Owner-facing PDF

| Element | Status |
|---|---|
| `pdf/owner-statement-pdf.tsx` (12.4kb) — React-PDF owner statement | ✅ shipped |
| `pdf/render-owner-statement-pdf.ts` (2kb) — render pipeline | ✅ shipped |
| `statement-pdf.tsx` (7.6kb) — admin-side PDF surface | ✅ shipped |
| PDF linkage in `owner_statements` table | ✅ schema (mig 0003) |

### Material-usage bridge (cross-cabinet to Operations)

| Element | Status |
|---|---|
| `material-usage-bridge.ts` (10.7kb) — bridge logic | ✅ shipped |
| `material-usage-bridge-pure.ts` (2kb) — pure helpers | ✅ shipped |
| `material-usage-bridge-actions.ts` (3.9kb) — server actions | ✅ shipped |

This bridges Operations cabinet's `material_usage_log` to Finance's `expense_lines`. One of the strongest cross-cabinet wires in the platform.

### Reserve management

| Element | Status |
|---|---|
| `reserve-balances.ts` (2.7kb) — balance calc | ✅ shipped |
| `reserve_movements` table | ✅ schema (mig 0002) |

### Cabinet-specific reads

| Element | Status |
|---|---|
| `finance-cabinet-queries.ts` (22kb) — the largest queries file in the audited set; covers statement list, statement detail, transparency view, warnings, PDF preview, etc. | ✅ shipped (assumed real reads given size) |

### UI surfaces (NOT YET IMPORTED but in repo)

| Element | Status |
|---|---|
| Components (25 files) under `src/components/finance/` | 🟡 in repo, not imported |
| Routes (31 files) under `src/app/(dashboard)/dashboard/finance/` | 🟡 in repo, not imported |

---

## Cross-cutting

### Agents

No dedicated `_repo/src/features/ai-agents/finance/` folder. Closest match: `statement-preparer` agent referenced in audit 04 concierge + cabinet 04 super-admin design copy. Likely lives in agents registry but not as separate code file imported here.

### Cross-cabinet dependencies

| Direction | Note |
|---|---|
| Bookings → Finance | `revenue_lines.booking_id` FK ✅ |
| Operations → Finance | material-usage-bridge consumes `material_usage_log` ✅ |
| Owner-portal → Finance | RLS owner-self-read on `statement_explanation_snapshots` ✅ |
| Finance → Owner-statements (16 Owner cabinet) | source data for owner statement view |

### RLS architecture

Per mig 0032 comment: "All four are RLS-forced internal-only for write; owners read via [explanation snapshot]". The redaction seam is `statement-generator.ts` itself — admin data goes through, owner-safe explanation snapshot is emitted as the read-side for owners. This pattern is the strongest privacy/redaction design in the audited platform.

---

## Recommended additions (prioritized)

### 🔥 P0 — none

Per CLAUDE.md "gold standard" status. No P0 gaps detected from code inspection. Cabinet is ready to ship as-is.

### ⭐ P1 — Phase 2.6 polish

1. **Verify component / route imports** — 25 components + 31 routes exist in repo but weren't imported in this session. Trust-but-verify by importing.
2. **Statement-preparer agent location** — referenced by multiple cabinets but not a discrete code file imported here. Confirm it lives in agent registry as a wrapper around `statement-generation.ts`, parallel to `waterfall-calculator` wrap pattern in investors.
3. **Mobile parity** — gold-standard means desktop polish; mobile equivalence to be verified against `mobile-pass-mgmt-p1.html`.
4. **Cross-currency statements** — owner_statements probably IDR-default; with multi-currency wallet support in investors (mig 0037), consider whether owner statements need similar.

### 💭 P2

5. **Explainer prompt versioning** — `statement_explanation_snapshots` could carry a prompt/template version so historical statements can be reproduced.
6. **Bulk regenerate** action for batch-fixing a month of statements after a rule change.

---

## Open questions for product

- **Agent stack location** — where does `statement-preparer` actually live? Not in `_repo/src/features/ai-agents/`. Likely in `src/features/ai-agents/finance/` (not imported) or wrapped inside `statement-generation.ts` orchestration.
- **PDF storage** — generated PDFs persisted to S3-like blob? Or regenerated on-demand from snapshot? Two `*-pdf.tsx` files (owner + admin) imply pre-generation; confirm storage layer.
- **Owner statement vs investor distribution** — both exist (cabinet 11 investors has `distribution_allocations`; cabinet 06 has `owner_statements`). Same legal entity sometimes both. Confirm whether they ever merge or always stay distinct.
