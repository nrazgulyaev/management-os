# Design ↔ Live ↔ Audit — Gap Plan (2026-06-09)

Built from an 11-agent workflow that mapped every `cc-functional-handoff` designed
cabinet to its live `page.tsx` (mounted? visible in UI? new-design or old-style?),
plus a design-system adoption sweep and a reconciliation against
`docs/PLATFORM-AUDIT-2026-06.md`. Every row was verified by reading live code, not
inferred from route names.

---

## 0. Where we are (one paragraph)

Functional operability has moved from the audit's **~58% "works" → ~78–82%** this
session (P0 security pack, the orphaned-action wire-up sweep, GL, takeoff/drawings,
RFI, capital layer, AI engines all shipped). The platform is now broadly **operable
per role** but **not yet hardened** on the three foundational items (tenancy backbone,
observability spine, money-engine tests). The user's two live pains are real but
**localized**: (1) several designed cabinets are backend-only / stubbed and **not
visible in the UI**, and (2) the **customer-facing portals wear old style** because
they never get the design-system CSS.

---

## TRACK A — Functional status vs the audit

**Closed this session:** P0 security (#125–#129, CI gate), trust/connect creds
(#108–#110), turnovers + CFO capital-calls de-mocked, contract/sales lifecycle,
buyer money loop (#158), commitments PO (#159), DrawingViewer + RFI + takeoff +
BOQ variance, double-entry GL + auto-post + tax finalize, statement anomaly,
AI engines (concierge/owner/pricing/vendor/weekly/schedule), investor/LP capital
layer (#143–#146, #155), check-in wizard, owner retention-risk, QA/QC photo (#160).

**Still genuinely OPEN (not deferred-by-design):**
| Item | Why it matters | Size |
|---|---|---|
| `organizationId` tenancy keystone | root data-integrity hole; ~60 tables only transitively scoped; `schema/projects.ts` has no org column | L (foundational) |
| Observability spine | logger→Sentry/Logtail, `/api/cron/health` 503, notif-failure alerting, group `error.tsx` for 5 portal groups | M |
| Money-engine behavioral tests | `statement-generator` + cabinet-queries suites + committed visual-regression baselines | M |
| `/development-os/communications` | still the literal "1,820 WA messages" mock, both buttons disabled | S (kill the mock) |
| `/cabinets/procurement-manager/pos` | still `MOCK_POS` hardcoded array | S (delete, wire real) |
| **Milestone persistence (schedule-side)** | schedule/project milestones not a first-class durable object; feeds schedule-variance detector synthetic data | M (build-from-scratch) |
| **Profitability cost-pool aggregation** | `recomputeUnitAllocation` exists but cost-pool inputs are caller-supplied; no engine rolls budget/txn/GL → pools | M (build-from-scratch) |

**Deferred-by-design (NOT failures):** live two-way OTA channel push (launch-phase),
real payment rails / PSP capture (Indonesia: Xendit/QRIS/VA — the LAST build),
inbound WhatsApp→concierge pipeline, e-Faktur/e-Bupot filing.

---

## TRACK B — Designed cabinets NOT visible in the live UI

Ranked. "Already built, just not wired" items are the cheapest and listed first.

### B0 · Quick wins — components/pages EXIST, just not surfaced (highest ROI)
- **Owners cabinet (`/dashboard/owners` + `[id]`)** — the entire owner design
  vocabulary is **already built but imported nowhere**: `tier-ring.tsx`,
  `portal-dot.tsx`, `risk-pill.tsx`, `insight-card.tsx`, `onboard-modal.tsx`
  (the 3-step Identity→Commission→Villas wizard), `villa-mini.tsx`,
  `edit-commission-modal.tsx`, `invite-portal-modal.tsx`. Import them → the
  director's-CRM list (tier/YTD-net/risk/portal columns) + the rich AI insight
  card + the 3-step onboarding all appear. **P1, but near-zero build.**
- **Estimator takeoff** — `/development-os/boq/takeoff` (`TakeoffWorkbench`) is
  fully built but **absent from the sidebar nav**; add one nav entry. **P2, 1 line.**
- **Knowledge-hub overview (`/development-os/knowledge`)** — page is a fully
  hardcoded mock (static DRAWINGS, fake 284/86/42/14 KPIs) even though
  `drawings`/`method-statements`/`materials` sub-pages are live. Replace mock with
  real counts/recent-revisions. **P1, small.**

### B1 · P0 — core workflow invisible, needs real build
- **Procurement money lifecycle** (`dev-p1/procurement`) — Place order / Pay /
  Confirm receipt / Send-to-pay actions exist NOWHERE; PO detail is `MOCK_POS`.
  Operator can browse + compare RFQs but cannot drive a PO through order→pay→receipt.
  (Overlaps Track A `/cabinets/procurement-manager/pos`.)
- **Coordination drawing-pins + Submittals** (`dev-p1/coordination`) — no
  coordination route; Submittals don't exist at all; RFI/punch are table-based with
  no place-pin-on-drawing markup. No visual on-drawing coordination.
- **Site-supervisor field capture** (`dev-p2/site-supervisor`) — Photo / Incident /
  Voice capture, crew counter, zone toggles, "Compile & send daily summary" all
  disabled "Coming soon". The field supervisor can capture **nothing** from this tool.
- **First-run org setup (Keystone)** — no guided 3-step org-setup wizard, no
  role-access "who-sees-what" matrix; only a single admin-bootstrap page. Operator
  can't self-configure an org from scratch in-UI.
- **Super-admin billing triage + feature-flags** — failed-payments dunning queue
  and the feature-flag matrix/kill-switch have **no UI at all** (billing partly
  gated on Stripe Connect; flags are not).

### B2 · P1 — significant gap, real build
- **Concierge contextual quick-actions** (`mgmt-p2`) — inbox is live, but the
  composer's spawn-work actions (cleaning/technician request, add extra service,
  explicit take-over/escalate) are missing.
- **Settings honest-connect hub** (`/dashboard/settings/integrations`) — read-only
  status grid; no inline Connect/Disconnect/Test + trust-tier badges (those live
  only in `/development-os`).
- **BOQ-QS inline line CRUD + Export/Compare/Change-order** (`dev-p1/boq-qs`).
- **Buyer Documents vault** (`/buyer-portal/documents`) — **live 404** (nav links
  to a route with no `page.tsx`). Buyer sees a broken nav item.
- **Operator installment desk** (`dev-p2/sales`) — no buyers+installments manager
  with auto-remind toggles, per-buyer schedule drawer, bulk reminder blast
  (mark-paid currently only buyer-side).
- **Owner calendar pool manager** (`owner-p1`) — read-only grid only; the
  take-out-of-pool / return / 14-day cooling-off / in-grid book mechanics don't exist.
- **Revenue-streams recognition framing** + **Marketing campaign rows/attribution**
  + **Documents app** (preview/e-sign/version/templates/AI-feed — currently flat
  table) + **owner-intelligence churn drill-in** + **warehouse receiving** (404) +
  **dev-executive risk-drill mitigation verbs**.
- **Super-admin: Users / Plans / Support-inbox / System-health / Platform-console**
  — all not_mounted or roadmap placeholders.

### B3 · P2/P3 — polish (mostly KPI strips, modal upgrades, layout differences)
Most mgmt-p3 + dev-p3 + owner cabinets are mounted_full; the residue is 4-tile KPI
strips not rendered, approve-modal confirmation upgrades, calendar drag-to-move, etc.

---

## TRACK C — Design-system adoption ("old black buttons")

**Root cause (one fault line):** `src/app/layout.tsx:117-138` `resolveDataProduct()`
only honors `management | development | subscription`. The investor-portal,
buyer-portal, and guest subtrees fall through to `data-product = null`, so the entire
`[data-product]`-scoped design-system CSS (buttons, cards, badges, KPI, type) **never
applies** there — they survive on raw Tailwind `bg-stone-*`/`bg-emerald-*`/`bg-[#hex]`.

**Adoption by section:** dashboard ~90% · development-os ~93% (their raw buttons use
`bg-ink` tokens — false positives, fine) · platform-admin ~80% (un-shelled) · owner
~75% · guest ~55% · field ~50% · **investor-portal ~25% · buyer-portal ~15%** ← the
real "old style."

**Highest-leverage fixes (do in this order):**
1. `src/app/(buyer-portal)/layout.tsx` — add a `data-product` wrapper, replace
   `bg-[#FAF7F2]` with the token bg. **Flips all 7 buyer pages onto the system in one edit.**
2. `src/app/(investor-portal)/layout.tsx` — same; **flips all 20 investor pages.**
   (May need `resolveDataProduct()` to map these subtrees to a product value.)
3. `buyer-portal/payments/_mark-paid-button.tsx` — `bg-stone-800 text-white` →
   `Button variant="primary"`.
4. `investor-portal/login` + `profile` — `bg-stone-900` CTAs → `Button`.
5. The 15 raw-palette investor pages — `bg-stone-50`/`text-emerald-800` →
   `--surface`/`--success` tokens + adopt `PageHeader`/`MetricCard`.
6. `platform-app/layout.tsx` — introduce a `PlatformShell` that sets `data-product`.
7. `guest-shell.tsx` — set `data-product` so guest component CSS activates.
8. development-os: 8 `bg-stone-900` segmented toggles + 4 `bg-black/40` modal scrims
   → `.chip-active`/`bg-ink` + the `Modal` primitive. (Low severity, cosmetic.)
9. Owner-portal: wrap the 8 pages missing `PageHeader` (already token-correct).

---

## Recommended sequence

1. **Wave R (re-skin, fastest visible win):** Track C #1–#5 — the two portal layouts
   + the black-button swaps. Kills the "old black buttons" complaint for the
   customer-facing portals in 1–2 small PRs.
2. **Wave Q (already-built mounts):** Track B0 — owners cabinet component imports,
   estimator nav, knowledge-hub real reads. High value, low build.
3. **Wave F (P0 functional cabinets):** Track B1 — procurement money lifecycle
   (+ kills the `MOCK_POS` Track-A item), coordination pins/submittals,
   site-supervisor capture, Keystone setup, super-admin flags/billing.
4. **Wave S (P1 cabinets + super-admin breadth):** Track B2.
5. **Wave H (foundational hardening):** Track A — `organizationId` tenancy,
   observability spine, money tests, milestone persistence, profitability aggregation.

Deferred-by-design throughout: OTA push, PSP capture (Indonesia rails at launch).
