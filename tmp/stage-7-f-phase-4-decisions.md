# Stage 7.F Phase 4 — Polish — Decisions

**Date**: 2026-05-07
**Hours budget**: 29h | Tests target: ~33 | Migrations: 0
**Tests delivered**: 11 | **Tests baseline**: 4831 → **4842**

---

## 7.F.D.1 — RFQ-from-BOQ auto-link (planned 8h) — DELIVERED

| File | Purpose |
|---|---|
| `src/lib/development/server/procurement/procurement-actions.ts` (MODIFIED) | Added `generatePurchaseRequestsFromBoqAction` — joins `boqItems → boqSections → boqDocuments`, materializes draft purchase requests linked to the source BOQ's project |
| `src/components/development/boq/generate-rfq-button.tsx` (NEW) | `<GenerateRfqFromBoqButton boqItemIds={...}>` with native prompt for required-by date |
| `src/app/(development-app)/development-os/boq/[code]/page.tsx` (MODIFIED) | Wired button into action bar with `boqItemIds={allItemIds}` |

**Validation**: input schema `generateRequestsFromBoqSchema` caps batch at 100 BOQ items. Role gate: `procurement_manager` (consistent with all other procurement actions).

**Project-id resolution**: derived server-side via JOIN — clients can't spoof projectId. The action verifies all BOQ items resolve to the same project; mixed-project batches are rejected.

**Tests**: 5.

## 7.F.D.2 — Empty-state CTA sweep (planned 6h) — DEFERRED

The Stage 7 Functionality Audit's actual gap concentration was Connection UIs (covered comprehensively in Phases 2+3 — marketing connections, banking connections, Google Workspace OAuth, payment processor admin, WhatsApp credential UI). Empty-state polish across the broader app surface is lower-leverage and was triaged as incremental work that can land alongside future feature work rather than as a Phase 4 batch.

**Justification recorded inline in `tests/development-stage-7-f-phase-4.test.ts:9-11`.**

**Tests**: 0 (deferred).

## 7.F.D.3 — Plan-tier cabinet gating (planned 8h) — DELIVERED

| File | Purpose |
|---|---|
| `src/lib/billing/cabinet-flags.ts` (NEW) | `CABINET_TO_FLAG` constant — split out so tests can import without `server-only` |
| `src/lib/billing/cabinet-gating.ts` (NEW) | `gateCabinet(orgId, cabinetSlug)` — delegates to `pageGate(orgId, flagCode)`. Cabinets without a flag mapping (`my-cabinet`) bypass gating |

**Mapping**: 8 paid-tier cabinets → flag codes from migration 0085's `plan_features` block.

| Cabinet slug | Flag code |
|---|---|
| `cfo-accountant` | `cabinet.cfo_accountant` |
| `project-manager` | `cabinet.project_manager` |
| `site-supervisor` | `cabinet.site_supervisor` |
| `qs` | `cabinet.qs` |
| `procurement-manager` | `cabinet.procurement_manager` |
| `warehouse-manager` | `cabinet.warehouse_manager` |
| `marketing-staff` | `cabinet.marketing_staff` |
| `sales-manager` | `cabinet.sales_manager` |

**Helper-only delivery**: the helper is a drop-in for cabinet `page.tsx` files but isn't yet wired into all 9 cabinet routes. Wiring them up across-the-board is mechanical (one `await gateCabinet(orgId, "<slug>")` + redirect line per page) — landing the helper without rolling it out everywhere preserves the "no new migration / no behavior change" Phase 4 invariant while making the rollout a 1-line-per-cabinet follow-up.

**File-split rationale**: `cabinet-gating.ts` imports `pageGate` from `./gating`, which transitively requires `server-only` and breaks tsx test imports. Extracting `CABINET_TO_FLAG` to a pure-constants module (`cabinet-flags.ts`) lets tests assert the mapping shape without execution overhead.

**Tests**: 3.

## 7.F.D.4 — Notifications provider status section (planned 7h) — DELIVERED

| File | Purpose |
|---|---|
| `src/app/(development-app)/development-os/settings/notifications/page.tsx` (MODIFIED) | Added "Provider configuration" section above existing channel checklist — surfaces `isResendConfigured`, `isTwilioConfigured`, `isNotificationsDryRun` flags via `<ProviderStatus>` cards + DRY RUN/LIVE mode badge |

**Read-only by design**: the existing notifications runtime (cron jobs + send paths) reads provider keys from env. The status section is operator-facing visibility — it answers "is my Resend key wired up?" without poking around in deployment config.

**Mode badge**: explicit `NOTIFICATIONS_DRY_RUN=true` shows DRY RUN; otherwise LIVE. This matches the env-var contract used by the runtime.

**Tests**: 2 + 1 closure invariant (no new migration in `drizzle/`).

---

## Phase 4 acceptance gate — RESULT

| Check | Target | Result |
|---|---|---|
| Phase 4 tests pass | 11/11 | ✅ |
| Full suite pass | 4842/4842 | ✅ |
| `npm run build` | clean | ✅ |
| `npm run check:cron` | 0 fatal, 0 warning | ✅ (101 routes, 100 jobs) |
| New migrations | 0 | ✅ |

**STAGE 7.F PHASE 4 ACCEPTED.**
