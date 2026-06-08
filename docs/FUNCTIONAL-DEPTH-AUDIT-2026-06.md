# Arconique — Functional-Depth & AI-Coverage Audit (2026-06)

> **Companion to** [`PLATFORM-AUDIT-2026-06.md`](./PLATFORM-AUDIT-2026-06.md). That audit answered *"is it built and is it correct?"*. This one answers the founder's question: **"does each role actually get the tools their job needs, and is AI everywhere it should be?"** — by fusing the `cc-functional-handoff` design layer (what each cabinet *should* do) with the live code (what it *actually* does).

## How this was produced

Three sources were merged:

1. **`cc-functional-handoff/`** — the authoritative design layer the founder built in Claude Design: ~70 cabinet mockups (each with a self-documenting `#spec` block), 4 `feature-inventory` checklists, 48 pixel-prompts, and a GitHub-verified route ground-truth. This is the source of truth for **intended functional depth** per persona.
2. **A 27-agent functional-depth probe** — one agent per persona/cabinet, each reading its design mock's signature tools **and** the live route + feature code, scoring the live implementation **workbench / functional / list-only / stub**, enumerating the specific missing domain tools, and mapping AI coverage against the real seeded agent roster.
3. **`PLATFORM-AUDIT-2026-06.md`** §2 menu-reality tables, §4 best-in-class, §F benchmarks, §G action-verb — folded in for benchmark targets and corroboration.

---

## 1. Executive verdict

**The platform is broad and genuinely deep at the data / CRUD / workflow layer — but it is not yet a set of role workbenches.** Almost every route exists and is wired to real data; the gap is that the *signature interactive tool each role actually works in* is, in most cabinets, missing from the mounted UI.

The numbers (27 personas scored):

| Depth | Count | Meaning |
|---|---|---|
| **workbench** | **3** | the role's signature interactive tool is live (Procurement buy/award/receive · Cleaner field-PWA checklist · Super-admin agent **builder**) |
| **functional** | **18** | real CRUD + workflow + computed views, usable end-to-end, but **no signature workbench** |
| **list-only** | **6** | tables/detail exist; the domain's signature tool is absent |
| **stub** | **0** | (nothing is purely a placeholder — the floor is high) |

AI coverage (same 27 surfaces):

| AI gap | Count | |
|---|---|---|
| 🟢 **none** | **2** | Security (`security_copilot`) · Guest-in-villa concierge (live Anthropic LLM) |
| 🟡 **partial** | **16** | a real agent exists but isn't on the key surface, or the design wants more |
| 🔴 **absent** | **9** | **no** wired assistant — incl. **all three customer portals** (Owner, Investor, Buyer) and Revenue, Owner-Relations, PM, Contracts, Housekeeping, Inventory |

### The one finding that changes the roadmap: **"built but orphaned"**

The dominant, repeated pattern across the probe is *not* "this is missing." It is: **the hard part already exists in the repo and is mounted nowhere.** Engine, FSM, component, server action, and often the table are written and tested — then wired to a stub query, hidden behind a "Coming soon" button, or imported by zero routes. A representative (non-exhaustive) register:

| Persona | The signature tool the role needs | Already built in the repo | Live status |
|---|---|---|---|
| Estimator / QS | on-drawing takeoff canvas | `drawing-viewer.tsx` (scale-calibration, area/length) + `VarianceCard` (computeVariance, QS sign-off) | **mounted in 0 routes**; project BOQ runs on `mockData()` |
| Investor Relations | distribution waterfall + capital-call issuer | `runWaterfall()` + `DistributionFlow` (4-step) + `CapitalCallModal` (pro-rata) | **0 page consumers** |
| Contracts / Buyer Money | issue invoice → sign → collect | `issueInvoiceForMilestone` · `signContract` · `recordMilestonePayment` (all tested) | **0 mounts** — "backend built, no button" |
| Owner Relations | per-owner retention-risk + save-plan | `computeRetentionRisk()` + `owner_insights` table + `risk-pill.tsx` | imported by **no page**; engine never runs |
| Concierge (staff) | AI-draft inbox + handoff | `handoff-actions` (submit/ack/resolve) + `replies-actions` | cabinet wires **zero** of them |
| Reservations | drag calendar + status FSM | `setBookingStatusAction` | **zero UI callers**; calendar "read-only for v6" |
| Revenue Manager | rate-curve + rule simulator + channel grid | `pricing-curve` + `channel-grid` + 6-state `state-machine.ts` + `comp-similarity.ts` | components mounted **nowhere**; queries return `[]` |
| Front Office | 4-step counter check-in (ID/sign/key) | `checkin-flow.tsx` + `checkin-state.ts` + `id-ocr-preview.tsx` | **orphaned**; `queries.ts` is an explicit stub |
| Project Manager | RFI loop + pin-on-drawing | `rfis` table (built + indexed) + `RFIComposeModal` | table has **zero consumers**; modal never mounted |
| Accountant (Mgmt) | approve/prepare modals + section-pill ledger | `approve-modal` · `prepare-modal` · `section-pill` | **0 imports** under `src/app` |
| Villa Owner | book-a-stay + statement sign-off | `personal-stay-modal` · `acknowledge-modal` · `dispute-modal` + `state-machine.ts` | imported by **nothing**; owner can only LOOK |
| Investor / LP | GP waterfall + capital-call pay | `waterfall-calculator.ts` + `capital-call-issuer.ts` + `capital_calls` (0113) | **no LP-facing surface**; `investor_copilot` seeded, 0 UI consumers |
| Operations Mgr | live turnover drag-board | dnd-kit `TurnoverBoard` + status FSM actions | board fed **9 `MOCK_TURNOVERS`**, `onMove` persists nothing |

**Implication for planning:** most of the P0/P1 functional gap is **wiring + mounting + de-stubbing**, not greenfield engineering. The expensive *net-new* builds are a short list (§7). This is the cheapest high-leverage work on the platform.

---

## 2. Functional-depth scorecard

Ordered worst-first within priority. "Signature gap" = the one tool whose absence keeps the role out of a real workbench.

### 🔴 P0 · list-only — the role cannot do its core job in the live app

| Persona | Cabinet | Signature gap | AI | Benchmark |
|---|---|---|---|---|
| **Estimator / QS** (сметчик) | `/development-os/boq` | on-drawing **takeoff→BOQ** canvas + rate library + variance sign-off | 🟡 | PlanSwift / CostX / Bluebeam |
| **Investor Relations** | `/development-os/investors` | interactive **distribution waterfall** + capital-call/distribution wizards | 🟡 | Juniper Square / Carta |
| **Contracts / Buyer Money** | `/development-os/contracts` | **issue-invoice → e-sign → collect** milestone loop | 🔴 | off-plan SPA ledgers |
| **Owner Relations** | `/dashboard/owners` | per-owner **retention-risk ring + save-plan** workbench | 🔴 | Guesty owner CRM |
| **Concierge (staff)** | `/dashboard/concierge` | **AI-draft inbox** (generate→review→send/escalate) | 🟡 | Enso Connect / Duve |
| **Off-plan Buyer + Agent** | `/buyer-portal` | **`/payments` + `/documents` are 404**; installment ladder + checkout | 🔴 | Agora buyer portal |

### 🟠 P0 · functional — usable, but the signature verb is missing

| Persona | Cabinet | Signature gap | AI | Benchmark |
|---|---|---|---|---|
| **CFO / Accountant (Dev)** | `/development-os/cfo` | **double-entry GL** (COA + balanced journal composer) + ID-tax file→lock; `/cfo` apex is hardcoded | 🟡 | QuickBooks / Xero / Accurate (ID) |
| **Project Manager** | `/development-os/projects` | **RFI loop + pin-on-drawing coordination** + persisting milestone editor | 🔴 | Procore / Fieldwire |
| **Reservations** | `/dashboard/bookings` | **drag-to-move calendar** + one-click status FSM on the drawer | 🟡 | Guesty / Hostaway |
| **Revenue Manager** | `/dashboard/pricing` | **rate-curve editor + rule simulator + channel-sync grid** | 🔴 | PriceLabs / Beyond |
| **Front Office** | `/dashboard/front-office` | **4-step check-in wizard** (ID-OCR → sign → door-code) + shift handover | 🟡 | Mews / Cloudbeds |

### 🟡 P1 · functional — solid; depth/polish to reach the design

Site Supervisor (mount field capture-flow + voice) · Sales (drag-FSM kanban + installment ladder) · Dev Marketing (campaign A/B console) · Dev Executive (act-on-risk drill-in + period switcher) · Knowledge/Drawings (revision-FSM buttons + pan-zoom viewer) · Accountant Mgmt (line-edit override + approve/prepare modals + anomaly detector body) · Operations Mgr (persist the turnover drag-board) · Guest Ops (journey dry-run simulator + phase-lane board) · Inventory/завхоз (reorder bars + 1-tap reorder + vendor scorecard) · Security/Sysadmin (unified integrations trust-console) · Villa Owner portal (sign-off + book-a-stay loop) · Investor portal (capital-calls section + GP waterfall) · Guest portal (4-step online check-in).

### 🟢 P1 · workbench — the three that reached real depth (defend these; finish the second half)

- **Procurement / Warehouse** — the **buy → RFQ-compare → award → receive** loop is a genuine workbench (RfqMatrix award-split, AgentRecommendBanner, per-line receiving posts inventory movements). *Second half unbuilt:* the **warehouse-receiving** side (dock/QC chain, bins, picks, mobile scan) — `/development-os/warehouse` is a stub.
- **Housekeeper / Cleaner** — the **field PWA** (`/field/tasks/[id]`) is the real cleaner workbench: section-grouped checklist FSM with audited writes, offline photo + geo check-in, material-usage stock decrement, damage escalation. *Gaps:* per-item photo-proof gate + progress bar; **AI absent** (`turnover-allocator` is a stub, board shows `MOCK_TURNOVERS`).
- **Super-admin / AI Ops** — the **agent builder** (`/platform/agents/[id]`) is workbench-grade: 5-tab prompt/KB/test-chat/runs with real pgvector RAG + live streaming test + Vault keys. *Second half unbuilt:* the **agent-ops governance** console (per-org spend matrix, caps editor, throttle, kill-switch, model registry).

---

## 3. The "built-but-orphaned" register (cheapest wins)

These are work items where the engine/component/table exists and the build is **mount + wire + de-stub**. Grouped by the action that unblocks them.

**Mount an existing component on its route:**
- `drawing-viewer.tsx` → estimator takeoff + drawings markup (used by 2 personas).
- `DistributionFlow` + `CapitalCallModal` + `runWaterfall` → investors cabinet.
- `approve-modal` / `prepare-modal` / `send-modal` / `section-pill` → mgmt statement detail.
- `acknowledge-modal` / `dispute-modal` / `personal-stay-modal` / `month-calendar` → owner portal.
- `checkin-flow.tsx` (+ `id-ocr-preview`, `turnover-monitor`, `registry-table`) → front-office arrivals.
- `pricing-curve` + `channel-grid` → revenue cabinet.
- `payment-ladder.tsx` + `offer-modal.tsx` + dnd `pipeline-board` → sales workspace.
- `RFIComposeModal` → projects hub.
- `capture-flow.tsx` + `storyboard-log.tsx` + `voice-input.tsx` → site-supervisor.
- dnd `TurnoverBoard` → operations home (replace `MOCK_TURNOVERS`).

**Wire an existing server action to a button:**
- `setBookingStatusAction` → booking-drawer Confirm/Check-in/Check-out/Cancel.
- `issueInvoiceForMilestone` / `signContract` / `recordMilestonePayment` → contract detail.
- `approveDiscount` / `rejectDiscount` / `applyDiscountToContract` → discounts review.
- `transitionDrawingRevision` → drawing detail Approve/Issue-for-Construction/Supersede.
- `transitionCampaignStatus` / `recordCampaignCost` → campaign detail.
- `acknowledgeAlert` / `resolveAlert` / `markFalsePositive` → risk-radar drill-in.
- `submitHandoffAction` / `acknowledgeHandoffAction` / `resolveHandoffAction` → concierge inbox.
- `testConnection` / `disconnect` (banking + marketing) → unified integrations trust-console.

**De-stub a query layer (component already consumes it):**
- `src/features/pricing/queries.ts` (`getPricingSeries`/`upsertOverride` return `[]`/no-op).
- `src/features/channels/queries.ts` (`getChannelGridData` empty, `pushRate` no-op).
- `src/features/front-office/queries.ts` (`getCheckinFlowState`/`getRegistry`/`getTurnovers` empty).
- `src/features/site-reports/queries.ts` (`getSiteDays`/`submitSiteFrame`/`getWeeklyReport` stub).
- `src/features/sales/queries.ts` (returns `[]`, `eventId:'stub'`).
- Statement anomaly agent `run()` returns `{flags:[]}` (table + migration 0112 exist).

**Activate a dead table (built + indexed, zero consumers):**
- `rfis` (0113) → RFI inbox/detail.
- `capital_calls` / `capital_call_allocations` (0113) → LP capital-calls + IR issuer.
- `land_payment_installments` → buyer `/payments` ladder.
- `statement_anomalies` (0112) → finance anomaly band + approve-gate.
- `boq_revisions` / `boq_actuals` (0113) → QS variance queue.

### 3.1 Verification correction (2026-06-08)

The §3 register above was assembled from the 27-agent probe. A **deterministic re-verification** against the live tree (exact grep for JSX renders / route mounts, not agent inference) found the probe had a **meaningful false-negative rate on "is it mounted?"** — much of the register was already wired by the earlier wire-up sweep (PRs #111–#121). Corrected status:

**Already wired (do NOT rebuild — probe false-negatives):**
- Owner statement **Acknowledge / Dispute** → `OwnerStatementActionBar` → `acknowledgeStatementAction` / `raiseStatementDisputeAction`.
- **Discount approve/reject** (`DiscountApprovalActions`), **contract Sign + Issue-invoice** (`SignContractButton` / `IssueInvoiceButton` via `contracts/[id]/_actions.tsx`).
- **Marketing campaign status FSM** (`transitionCampaignStatus` → `marketing/campaigns/_status-control.tsx`).
- **Exec risk act** (`acknowledgeAlert` / `resolveAlert` → `risk-radar/[code]/_alert-actions.tsx`).
- **Concierge transcript + manual staff reply** (`_concierge-workspace.tsx` → `loadConciergeThreadAction` / `postConciergeStaffReplyAction`) — only the **AI-draft generate** is still missing.
- Owner **month-calendar** (display) is mounted; `booking status FSM` shipped in PR #131.

**Confirmed genuinely orphaned (real remaining work — verified 0 renders):**
- Finance accountant modals `approve-modal` / `prepare-modal` / `send-modal` / `section-pill` (files exist, **0 JSX renders**).
- Investor `DistributionFlow` + `CapitalCallModal` + `capital_calls` table (cabinet has only MetricCards + Table).
- Owner `personal-stay-modal` (book-a-stay range select + quota calc).
- Front-office `checkin-flow` + `id-ocr-preview` (+ stubbed `front-office/queries.ts`).
- Revenue `pricing-curve` + `channel-grid` + `upsertOverride` (+ stubbed `pricing/queries.ts`, `channels/queries.ts`).
- Sales `payment-ladder` + `offer-modal`.
- QS `VarianceCard` + `boq_revisions` / `boq_actuals`.
- Site-supervisor `capture-flow` / `storyboard-log` / `voice-input` (+ stubbed `site-reports/queries.ts`).
- PM `RFIComposeModal` + `rfis` table (only consumer is the agent stub file, no route).
- Knowledge `transitionDrawingRevision` (FSM exists, **0 UI buttons**).
- Marketing `recordCampaignCost`.
- Finance `statement_anomalies` table + anomaly `run()` (returns `[]`).
- Net-new (not a mount): `DrawingViewer` takeoff, `recordMilestonePayment` PSP collect.

**Takeaway:** the functional-roadmap is even smaller than §3 first implied — roughly a third of the "orphaned" items were already wired. Build planning should treat this corrected list as authoritative and re-verify any §3 item with an exact grep before estimating it.

---

## 4. AI-everywhere matrix

The platform has ~22 seeded agents, but they're concentrated in a few Dev-OS cabinets + the digest infra. **Every customer-facing portal and several key staff inboxes have no wired assistant.** "Want" = design-specified; "Live" = real seeded agent actually reaching the screen.

| Surface | want | live | gap |
|---|---|---|---|
| Guest-in-villa concierge | anonymous auto-assistant | **live Anthropic LLM** + `concierge_handoff` | 🟢 |
| Security | `security_copilot` | `security_copilot` | 🟢 |
| Estimator/QS | `qs_cost_analyst` (in-context) | `qs_cost_analyst` (own page only) | 🟡 |
| CFO | tax auto-categorise + book-closer | `tax_assistant` | 🟡 |
| Site Supervisor | digest + photo + supervisor | `construction_supervisor` + `photo_analyst` | 🟡 |
| Sales | offer-drafter / lead-scorer | `sales_assistant` | 🟡 |
| Investor Relations | quarterly-narrator / call-reminder / wire-reconciler | `investor_relations` + `distribution_preview` (on detail only) | 🟡 |
| Dev Marketing | content + attribution + optimizer | `marketing_assistant` | 🟡 |
| Dev Executive | risk-detector + digest composer | `executive_business` + `daily_digest` + rule-based risk radar | 🟡 |
| Front Office | id-ocr / visa-watcher / vip-prep | `front_office_copilot` | 🟡 |
| Guest Ops | concierge handoff + sentiment | `concierge_handoff` (live LLM, HITL) | 🟡 |
| Procurement | `procurement_analyst` + forecasters | `procurement_analyst` | 🟡 |
| Super-admin (AI-Ops) | governance + 11 named agents | 8 real agents editable; **fiction names + no governance** | 🟡 |
| **Project Manager** | rfi-router / schedule-variance / report-composer | **none** | 🔴 |
| **Contracts / dunning** | payment-reminder / receipt-gen | **none** | 🔴 |
| **Owner Relations** | owner-intelligence / save-plan / brief | **none** (`computeRetentionRisk` orphaned) | 🔴 |
| **Revenue Manager** | pricing recs + comp-set similarity + listing-matcher | **none** | 🔴 |
| **Housekeeper** | `turnover-allocator` / `housekeeping_scheduler` | **none** (stubs return empty) | 🔴 |
| **Inventory / завхоз** | forecaster / vendor-scorer / po-reconciler | **none** (vendor-score stub) | 🔴 |
| **Villa Owner portal** | owner-concierge + payout-delta explainer | **none** (`owner-concierge.ts` always returns `human`) | 🔴 |
| **Investor / LP portal** | `investor_copilot` | **none** (seeded, 0 UI consumers) | 🔴 |
| **Buyer / Agent portal** | collections nudge + offer-drafter | **none** | 🔴 |

**The AI strategy this implies (matches platform-audit §C bet #2):** the win is *not* "invent more agents" — many design-named agents are fiction (`maintenance-triage`, `turnover-allocator`, `statement-preparer`, `draft-replier`, `visa-watcher`…). It's **(a)** surface the **real seeded agents** that already exist onto the cabinets that need them (e.g. `investor_copilot` → LP portal, `concierge_handoff` → staff inbox, `qs_cost_analyst` → variance band), **(b)** implement the handful of stub `run()` bodies that return `[]` (statement-anomaly, turnover-allocator, vendor-score), and **(c)** build the platform-audit's headline bet — a **self-serve agent builder** is *already workbench-grade* at `/platform/agents/[id]`, so the missing half is **governance** (caps/throttle/kill) and **distribution** (one-click "subscribe this org/surface to this agent").

---

## 5. Cross-cutting patterns (root causes)

1. **Read-only-grid syndrome** — calendars and boards render CSS spans but ship no drag/resize (`booking-calendar-grid.tsx` "Read-only for v6"; `TurnoverBoard` `onMove` persists nothing; owner calendar view-only). The benchmark verb in every one of these verticals *is* the drag.
2. **Stub query layers under finished components** — a built component imports a `queries.ts` that returns `[]`/no-op, so the surface renders empty and looks unbuilt when it's 90% done.
3. **"Coming soon" buttons over live backends** — disabled action buttons (`opacity 0.55`) sit directly above server actions that already work.
4. **Two parallel tracks for one cabinet** — a "design-faithful cabinet" page and a "live" page coexist (sales: `components/development/sales` live vs `components/sales` orphaned; CFO: `/cfo` mock vs `cabinets/cfo-accountant` live). Pick the survivor per cabinet and delete/merge the other.
5. **Fiction agents in design copy** — design mocks name agents that were never seeded; build against the **real roster** (`feature-gaps/_ground-truth-2026-05-29.md`), not the mock's agent names.
6. **Portals are look-only** — Owner/Investor/Buyer portals let the customer *read* (statements, NAV, progress) but not *act* (sign off, pay a call, pay an installment, book a stay). Every benchmark makes the customer DO something.

---

## 6. Prioritized roadmap

Folds into the platform audit's P0/P1/P2. **Wave A is almost entirely wiring** (§3 assets); **Wave C is the net-new builds** (§7).

### Wave A — "turn on what's already built" (days each, highest ROI)
1. **Reservations:** drag-to-move calendar + mount `setBookingStatusAction` as drawer buttons.
2. **Contracts/Buyer:** wire issue-invoice / sign / record-payment + mount discount approve-buttons.
3. **Owner portal:** statement **Acknowledge / Dispute** (modals + state-machine already built) — core compliance loop, lowest cost.
4. **Concierge (staff):** session → transcript → AI-draft composer + escalate (handoff actions exist).
5. **Investor Relations + LP portal:** mount the waterfall + capital-call section (pure-fns + tables exist).
6. **Accountant (Mgmt):** mount approve/prepare modals + section-pill; implement `statement-anomaly.run()`.
7. **Operations:** persist the `TurnoverBoard` drag → status action; mount on the ops home.
8. **Security:** assemble the unified integrations trust-console (real/dry-run/ignored tiers; honest test) — directly extends platform-audit §G.3.
9. **AI surfacing:** `investor_copilot` → LP dashboard; `qs_cost_analyst` → variance band; implement `turnover-allocator` / `vendor-score` `run()` bodies.

### Wave B — finish the half-built workbenches (1–2 weeks each)
- **Revenue Manager:** de-stub `pricing/queries.ts` + `channels/queries.ts`, mount `pricing-curve` + `channel-grid`, activate the 6-state FSM + conflict resolver, add AI pricing recs.
- **Front Office:** mount the 4-step `CheckinFlow` (ID-OCR → sign → **door-code issuance**) + shift handover.
- **Buyer portal:** build `/buyer-portal/payments` (installment ladder on `land_payment_installments`) + `/documents` + real Xendit/Stripe checkout + auto-receipt (retire `ManualStubProvider`).
- **Project Manager:** RFI inbox/detail on the dead `rfis` table + route via a real `rfi-router`; persist the milestone editor.
- **Site Supervisor / Guest Ops / Sales / Marketing / Inventory:** mount their capture-flow / journey-simulator / installment-ladder / campaign-console / reorder-loop per §2.

### Wave C — strategic net-new (weeks; define the ceiling) → §7

### Wave D — polish (P2)
Guest cart + interactive map; exec period-switcher + in-place role-swap; warehouse bin-map; CSV exports; vocabulary reconciliation (maintenance `low/normal/high/urgent` ↔ design `P0–P3`).

---

## 7. The net-new strategic builds (the short, expensive list)

Everything else is mostly wiring. These five are genuinely new and define the product's ceiling — and they line up 1:1 with platform-audit §C strategic bets:

1. **Estimator takeoff engine** — scale-calibrated `DrawingViewer` takeoff canvas (area-polygon shoelace + length-polyline) that writes `boq_items` tagged `source=drawing`, + an org rate/assembly library. *(The viewer component exists; the writer, rate library, and scale-calibration are new.)* → PlanSwift/CostX category.
2. **Double-entry GL core** — `chart_of_accounts` + `journal_entries`/`journal_lines` tables + the balanced journal composer; re-derive P&L + balance sheet; the Indonesia tax file→lock (e-Faktur/e-Bupot) lifecycle. *(Today's data model is single-entry `dev_transactions` — a benchmark accountant cannot produce statutory books on it.)* → QuickBooks/Accurate.
3. **Pin-on-drawing coordination** — RFI/Submittal/Punch pins at (x,y) on a drawing with threads + status FSM, on top of the RFI loop. → Procore/Fieldwire.
4. **Buyer/LP money rails** — real Xendit/Stripe checkout for buyer installments + investor capital-call funding, with auto-receipt and the 4-trigger WhatsApp dunning engine. → Agora/Juniper Square.
5. **Agent-ops governance** — `agent_caps` + `model_registry` tables enforced in `inference.ts` (kill → org-cap → tier-cap → platform-cap), surfaced as the per-org spend matrix + caps/throttle/kill console. *(The agent **builder** is already done.)* → Agentforce.

---

## 8. Relationship to `PLATFORM-AUDIT-2026-06.md`

This audit **confirms and sharpens** the platform audit rather than replacing it:
- The platform audit's §4/§C independently named the same top bets (takeoff, buyer-money loop, investor-transactional layer, conversational concierge, self-serve AI builder). The 27-agent probe reached them bottom-up from the designs — strong convergence.
- **New here:** the per-persona **depth score** (workbench/functional/list-only/stub), the **AI-everywhere matrix**, and — most actionably — the **"built-but-orphaned" register** (§3), which reframes most of the functional roadmap as *wiring*, not building. That materially lowers the cost estimate behind the platform audit's "🟠 P0 · make the stuck roles operable" line.
- The platform audit's **§B P0 security pack** (PRs #125–#129) is orthogonal and already in flight; this audit assumes that lands first.

> **Source data:** the full 27-persona probe (design signature tools · live evidence file paths · missing tools · AI want/live · benchmark · top-rec) is preserved at `/tmp/fda/findings.json` from this run; the per-persona digest at `/tmp/fda/digest.md`. Re-runnable as the `functional-depth-audit` workflow.
