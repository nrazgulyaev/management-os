# 02 — Dev OS / All sections rollup (slim, by `/development-os/<section>`)

Per Q2(b) tiered format. Section roots + first-tier sub-pages with
verdict spread. 🔴 sections get expanded inline; 🟢 sections get a
one-liner.

**Total Dev OS pages audited**: 91
**Verdict spread (post-retest)**: 79 USABLE / 11 BROKEN (P0) / 1 DEFERRED

---

## 🔴 Sections with confirmed 500s

### `/development-os/banking` (2 pages — 2 BROKEN)
- `/banking` 🔴 500 — see [`_p0-500-diagnoses.md`](_p0-500-diagnoses.md) #1
- `/banking/new` 🔴 500 — see #2 (likely same root cause)

### `/development-os/marketing` (8 pages — 2 BROKEN, 6 USABLE)
- `/marketing/connections` 🔴 500 — see #3
- `/marketing/connections/new` 🔴 500 — see #4
- `/marketing` 🟢 (hub)
- `/marketing/dashboard` 🟢
- `/marketing/campaigns` 🟢 (uses `<campaign-modal-form>` — Modal-First ✅)
- `/marketing/lead-sources` 🟢 (uses `<lead-source-modal-form>` ✅)
- `/marketing/content-pipeline` 🟢
- `/marketing/conversations` 🟢

### `/development-os/platform` (4 pages — 2 BROKEN, 2 USABLE)
- `/platform/branding` 🔴 500 — see #5
- `/platform/organizations` 🔴 500 — see #6
- `/platform/usage-metrics` 🟢
- `/platform/api-docs` 🟢

### `/development-os/settings` (9 pages — 5 BROKEN, 4 USABLE)
- `/settings/api-keys` 🔴 500 — see #7
- `/settings/data-export` 🔴 500 — see #8
- `/settings/google-workspace` 🔴 500 — see #9
- `/settings/webhooks` 🔴 500 — see #10
- `/settings/whatsapp` 🔴 500 — see #11
- `/settings` 🟢 (hub)
- `/settings/general` 🟢
- `/settings/ai-usage` 🟢
- `/settings/notifications` 🟢
- `/settings/approval-thresholds` 🟢

---

## ⏳ DEFERRED

### `/development-os/quantity-surveying` (intentional placeholder)
The page declares "Coming Soon" + lists planned QS workflows (BoQ,
cost estimation, variation orders, valuation runs). The BoQ surface
DOES exist at `/development-os/boq` — see
[`_kb-and-qs-functional-check.md`](_kb-and-qs-functional-check.md).

Operator decision needed (10.6.F): build the QS rollup surface OR
remove the placeholder + redirect to `/development-os/boq`.

---

## 🟢 Sections rendering cleanly (slim format)

For each: pages count + 1-line note. Modal-First Add status from
[`_modal-first-scan-devos.md`](_modal-first-scan-devos.md).

### `/development-os` (1 page)
- Hub + command center 🟢

### `/development-os/dashboard` (1)
- Stage 5.C executive dashboard 🟢. Operator's "executive_business"
  AI agent feeds this; tile likely empty (agent-runner integration
  carry-over).

### `/development-os/cabinets` (9)
- All 9 cabinets render 🟢 USABLE on retest. See
  [`../01-mgmt-os-by-section/_cabinets-visual-reaudit.md`](../01-mgmt-os-by-section/_cabinets-visual-reaudit.md)
  for the full visual + connectivity analysis. (Owner cabinet at
  `/dashboard/owner` is Mgmt OS.)

### `/development-os/ai-agents` (10)
- 9 agent pages + hub. All 🟢 USABLE. See
  [`_ai-agents-activation-status.md`](_ai-agents-activation-status.md)
  for the per-agent activation review.

### `/development-os/finance` (6)
- All 🟢 USABLE: hub + invoices + tax-types + tax-reports +
  shared-costs + document-extractions
- Modal-First mostly compliant (`<vendor-modal-form>`,
  `<bank-account-modal-form>`, `<transaction-modal-form>`,
  `<cost-category-modal-form>`)
- `/finance/invoices` 🔴 likely Modal-First violator (see scan)

### `/development-os/sales` (likely many sub-pages)
- All 🟢 USABLE in sweep
- Modal-First mostly compliant (6 of 6 sales sub-surfaces use
  `*-modal-form` per scan)

### `/development-os/projects` (1 + many [slug] sub-routes)
- `/projects` 🟢 USABLE (list)
- `[slug]` sub-routes (work-packages, change-orders, decisions,
  risks, schedule/tasks) all use `/new` Links — many Modal-First
  candidates but they're DETAIL routes, not list pages. Still warrant
  per-route inspection at CHECKPOINT 5 follow-up.

### `/development-os/operations` adjacent sections
- `/development-os/inventory` (1) 🟢
- `/development-os/inventory/items` 🟢 (Modal-First violator)
- `/development-os/materials` (2) 🟢 (one violator)
- `/development-os/vendors` (1) 🟢 (violator)
- `/development-os/qa-qc` (1) 🟢 (violator)
- `/development-os/safety` (1) 🟢 (violator)
- `/development-os/site-reports` (1) 🟢 (uses `<SiteReportModalForm>` AND has /new fallback ✅)
- `/development-os/procurement` (3) 🟢
  - `/procurement/purchase-requests` (Modal-First violator)
  - `/procurement/quotations` 🟢
- `/development-os/drawings` (1) 🟢 (uses `<DrawingsAddButtons>` ✅)
- `/development-os/method-statements` (1) 🟢 (Modal-First violator)
- `/development-os/specifications` (1) 🟢 (Modal-First violator)
- `/development-os/quality-standards` (1) 🟢 (uses `<AddQualityStandardButton>` ✅)
- `/development-os/boq` (1) 🟢 (uses `<AddBoqButton>` ✅)

### `/development-os/whatsapp` (3)
- `/whatsapp` + `/phone-numbers` + `/templates` — all 🟢 USABLE.
  Note: `/development-os/settings/whatsapp` (separate route) is the
  one that 500s — likely the OPERATIONAL pages (these 3) work
  while the SETTINGS page that configures the provider doesn't.

### `/development-os/schedule` (3)
- `/schedule` + `/schedule/calendars` + `/schedule/resources` — all 🟢

### Capital + financial-strategic surfaces (8 pages)
- `/distributions` 🟢 (Modal-First violator)
- `/commitments` 🟢
- `/contracts` 🟢
- `/discounts` 🟢
- `/investors` 🟢
- `/revenue-streams` 🟢
- `/cashflow-forecast` 🟢
- `/profitability` 🟢
- `/project-cycle` 🟢

### Roadmap surfaces (3)
- `/quantity-surveying` ⏳ DEFERRED (covered above)
- `/asset-types` 🟢
- `/assets` 🟢

### Other (4)
- `/digests` 🟢
- `/risk-radar` 🟢
- `/reports` 🟢
- `/reservations` 🟢
- `/productivity` 🟢
- `/invoices` 🟢

---

## Operator-flagged Dev OS items

> "AI Agents activation — How к connect API key? Provider selection
> где? Test connection где?"

→ Stage 10.5.B shipped the per-agent settings UI at
`/development-os/settings/ai-agents/[agent_key]` (Mgmt OS-side
settings location, but covers Dev OS agents too). Form includes
provider dropdown + API key input + test-connection button. **But the
runtime carry-over blocks per-org keys actually being USED at agent
invocation** — see
[`_ai-agents-activation-status.md`](_ai-agents-activation-status.md).

> "Quality standards / Method statements / Specifications — Document
> management functional?"

→ Yes. Pages render, lists work, Add buttons exist. Edit/Delete
verification pending CHECKPOINT 5 file inspection. See
[`_kb-and-qs-functional-check.md`](_kb-and-qs-functional-check.md).

> "QS / Cost analyst — operator remembers BoQ upload feature was
> discussed. Where это? Currently shows 'coming soon'?"

→ BoQ EXISTS at `/development-os/boq` and works. The `/quantity-surveying`
"coming soon" page is a separate intentional placeholder for the
QS-rollup surface that hasn't been built yet. See
[`_kb-and-qs-functional-check.md`](_kb-and-qs-functional-check.md).

> "Sales & buyers, Reservations, Contracts — Pipeline functional?
> Commercial workflows working?"

→ All 🟢 USABLE in sweep. All 6 sub-surfaces use modal-form
components (Modal-First compliant). Functional verification pending
CHECKPOINT 5 row-action inspection.

---

## Coverage gaps surfaced at CHECKPOINT 3

Pages that exist in the codebase but are NOT in `tmp/audit-urls.txt`:
- Many `/development-os/projects/[slug]/*` detail routes (work-packages,
  change-orders, risks, decisions, schedule/tasks)
- `/development-os/vendors/[code]` and `/materials/[poCode]` detail routes
- `/development-os/ai-agents/{slug}/outputs/[code]` per-output detail
  routes

These are dynamic routes; the harness can't audit them without
sample IDs. CHECKPOINT 5 should catalog them as "covered by parent
section" and accept the dynamic-route gap as part of methodology
limits.
