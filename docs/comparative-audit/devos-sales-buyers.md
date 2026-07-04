# Comparative Functional Audit — Development-OS: Sales & Buyers + Buyer Portal

**Cluster:** Selling built / off-plan units (villas). Operator surfaces under
`src/app/(development-app)/development-os/` (sales, buyers, reservations,
contracts [the *sales* cabinet], discounts, installments, marketing overlap)
plus the external **Buyer Portal** at `src/app/(buyer-portal)/buyer-portal/`.

**Date:** 2026-07-02 · **Scope note:** cross-tenant leaks were NOT re-audited
(covered by prior tenancy waves; org-scoping was spot-confirmed as present).

**Headline:** The core sell-side lifecycle — **lead → reservation (price-lock +
deposit) → contract group (multi-part split + milestone schedule) → e-sign
cascade → installment collection → AJB completion / revenue recognition** — is
**genuinely built and coherent, end to end**, with a rich buyer portal. This is
a strong cluster. The gaps are *feature-breadth* gaps versus best-in-class
tools (no buyer selections/upgrades, no sales unit-inventory board, no real
e-sign provider, thin CRM automation), not broken plumbing.

---

## (A) Functional / Error Status Table

Legend: WORKS = verified real read+write against DB with guards ·
PARTIAL = works but a sub-capability is stubbed/flagged · MOCK = hardcoded /
placeholder · BROKEN = dead button / orphaned / errors.

| Area | Surface / file | Status | Notes |
|------|----------------|--------|-------|
| Sales pipeline | `sales/page.tsx` | **WORKS** | Live pipeline off contacts foundation; FSM-guarded drag between stages, audit-logged; metrics + AI-draft counts real; `safeQuery` degrade-guards. |
| Lead capture | `sales/new/_capture-lead-form.tsx`, `lead-actions.ts`, `lead-stage-machine.ts` | **WORKS** | Real create + stage machine (one step at a time). |
| Lead detail + docs | `sales/[contactRoleId]/page.tsx`, `_documents-tab.tsx` | **WORKS** | Documents tab replaced the old `ComingInPlaceholder`; real. |
| Reservations list/detail | `reservations/page.tsx`, `server/reservations.ts` | **WORKS** | Org-scoped via project anchor; expiring filter; cron `expireStaleReservations`. |
| Create reservation | `reservation-actions.ts:58` | **WORKS** | Price-lock + snapshot, deposit fee (USD+IDR), partial-unique race guard, lead→`reservation`. |
| Reservation lifecycle | `reservation-actions.ts` (cancel/extend/markPaid) | **WORKS** | State-machine guards, refund path, idempotent mark-paid, audit events. |
| Convert → contract group | `contract-actions.ts:60` | **WORKS** | Template split across components (off-plan 3-part), scheme→milestone instances, price snapshot, reservation→`converted`. |
| Sign contract (operator) | `contract-actions.ts:331`, `contracts/[id]/_actions.tsx:50` | **WORKS** | Per-child sign, group cascade partial→fully_signed, Lead→Buyer promotion + unit-type freeze + contract price lock. |
| Complete / AJB | `contract-actions.ts:601` | **WORKS** | Strict preconditions (all signed + all milestones paid) → revenue recognition; audit + revalidate. |
| Cancel contract group | `contract-actions.ts:526` | **WORKS** | Org-scoped, cascades to child contracts. |
| Discounts | `discounts/page.tsx`, `discount-actions.ts`, `_approval-actions.tsx`, `_apply-actions.tsx` | **WORKS** | Propose → authorization-limit → approve/reject → apply-to-contract; real workflow. |
| Installment desk (operator) | `installments/page.tsx`, `installment-desk-actions.ts` | **WORKS** | Per-plan schedule, mark-paid (cumulative, partial→paid), receipt PDF into buyer vault, reminders (single/plan/bulk), auto-remind toggle, audit. KPI-strip comment says "mock" but values are computed from real `listInstallmentPlans()` — **mislabeled comment only** (`installments/page.tsx:46`). |
| Buyers list | `buyers/page.tsx`, `server/buyers/buyer-queries.ts` | **WORKS** | Real `listBuyers`, safe-query guarded. |
| Buyer detail | `buyers/[code]/page.tsx`, `_actions.ts`, `_controls.tsx` | **WORKS** | Real. |
| Buyer Portal — dashboard | `buyer-portal/dashboard/page.tsx` | **WORKS** | Session-gated, buyer-scoped. |
| Buyer Portal — units/villa | `buyer-portal/units/page.tsx`, `units/[id]/page.tsx` | **WORKS** | Ownership-scoped (`loadBuyerUnitDetail`), spec/progress/photos/money; 404 on foreign unit. |
| Buyer Portal — reports | `buyer-portal/reports/page.tsx`, `reports/[id]/page.tsx` | **WORKS** | Buyer-scoped progress reports; detail `notFound()` guarded. |
| Buyer Portal — payments | `buyer-portal/payments/page.tsx` | **WORKS** | Installment ladder per villa; invoices + receipts surfaced; Xendit "Pay online" (QRIS/e-wallet/VA) when org connected, else manual "Mark as paid". |
| Buyer Portal — contract e-sign | `buyer-portal/contract/_sign-form.tsx`, `lib/buyer-portal/contract-sign-actions.ts` | **PARTIAL** | Legally-meaningful typed-name + consent → `contract_signatures` row + signing cascade. **No real e-sign provider** (DocuSign/DocuSeal); no signed-PDF artifact with audit certificate. |
| Buyer Portal — documents | `buyer-portal/documents/page.tsx`, `lib/buyer-portal/documents.ts` | **WORKS** | Grouped vault (contract/plans/permits/receipts/other), download. |
| Buyer Portal — KYC | `buyer-portal/kyc/page.tsx`, `_submit-form.tsx` | **PARTIAL** | Readiness signal works; **in-portal identity-document upload is "coming soon"** — docs collected off-platform (`kyc/page.tsx:132`). |
| Online payment capture | `_pay-online-button.tsx`, `features/payments/buyer-installment-checkout` | **PARTIAL (by design)** | Xendit hosted invoice wired + webhook marks paid; live only when org has active Xendit connection — otherwise manual mark-paid (Indonesia PSP rails deferred, per project decision). |
| **Buyer selections / upgrades** | — | **MISSING** | No selections/options/upgrades/variation-order surface anywhere in cluster (grep-confirmed absent). |
| **Sales unit-inventory / availability board** | — | **MISSING** | `development-os/inventory/*` is **construction materials**, not saleable units. No availability grid / stack-plan / status board for villas on the sell side. |
| **Sales CRM automation** | `leads.ts`, `lead-actions.ts` | **MISSING** | No lead scoring, no email sequences / nurture cadences (grep-confirmed absent). |

**Counts:** WORKS ≈ 22 · PARTIAL ≈ 4 · MISSING ≈ 3 · MOCK 0 · BROKEN 0.
(No dead buttons or orphaned actions found in this cluster.)

---

## (A) Prioritized Defects / Gaps (file:line)

**P0 — none.** No broken flows, dead buttons, orphaned actions, or MOCK data in
the shipped lifecycle. The pipeline is functionally complete.

**P1**
1. **No real e-sign provider** — `lib/buyer-portal/contract-sign-actions.ts:6`
   & `buyer-portal/contract/_sign-form.tsx`. Typed-name + consent is captured
   and legally framed, but there is no provider integration, no tamper-evident
   signed-PDF, and no signature/audit certificate. Competitors (DocuSign,
   Buildertrend) treat this as table-stakes for high-value property contracts.
2. **No in-portal KYC document upload** — `buyer-portal/kyc/page.tsx:132`.
   Identity docs are collected off-platform; only a readiness flag is stored.
   AML/KYC for property purchase usually needs the artifact on file.

**P2**
3. **No buyer selections / upgrades module** — absent cluster-wide. This is
   CoConstruct/Buildertrend's signature differentiator (client picks
   finishes/upgrades, priced, approved, flows to contract value).
4. **No sell-side unit-inventory / availability board** — `development-os/inventory`
   is materials, not units. There is no "which villas are available / reserved /
   sold" grid or stack-plan for the sales team, despite the data existing
   (villa status, reservations, contract groups).
5. **Thin sales CRM automation** — `leads.ts` / `lead-actions.ts` have no lead
   scoring or email sequences/nurture; HubSpot-class pipelines automate these.
6. **Misleading "mock" comment** — `installments/page.tsx:46` labels the KPI
   strip "mock" though values are computed from real data. Cosmetic; fix the
   comment to avoid future confusion.

---

## (B) Competitor Benchmark & Gap Map

Benchmarked vs **Buildertrend / CoConstruct** (builder sales + client
selections + portal), **HubSpot** (sales pipeline/automation), and real-estate
developer CRMs (Unlatch / PropGOTO / RYZ / Zoho) + **DocuSign** (e-sign).

| Capability (2025–26 norm) | Best-in-class | This product | Verdict |
|---------------------------|---------------|--------------|---------|
| Sales pipeline / deal stages | HubSpot 7-stage, drag, weighted | FSM-guarded pipeline, audit-logged | **PARITY** |
| Lead scoring | HubSpot predictive/AI scoring | none | **GAP (P2)** |
| Email sequences / nurture | HubSpot cadences, drip | none (AI drafts exist, no sequences) | **GAP (P2)** |
| Off-plan reservation + deposit | RYZ/PropGOTO/Unlatch | reservation + price-lock + deposit + expiry cron | **PARITY / DIFFERENTIATION** (price snapshots) |
| Unit inventory + availability | Developer CRMs list/track inventory | none (sell-side) | **GAP (P2)** |
| Buyer selections / upgrades | CoConstruct/Buildertrend core | none | **GAP (P2 — headline differentiator missing)** |
| Contract + milestone payment plan | Milestone/off-plan templates | template split + scheme→milestone schedule | **DIFFERENTIATION** (multi-part off-plan split, tax bearer, net-to-seller) |
| Installment tracking / reminders | Deposit due/paid tracking | full desk: cumulative pay, partial, reminders, auto-remind, receipts | **DIFFERENTIATION** |
| E-signature | DocuSign / Rooms | typed-name consent only | **GAP (P1)** |
| Deposit / installment capture | PSP-integrated | Xendit hosted invoice (QRIS/e-wallet/VA) + manual | **PARITY** (ID-local rail is a fit-for-market strength) |
| Buyer portal (docs/progress/payments) | Unlatch white-label portal | rich: units, progress reports, photos, payments, docs vault, receipts | **PARITY / DIFFERENTIATION** |
| KYC in-portal | (varies) | readiness flag only, no upload | **GAP (P2)** |
| Revenue recognition at title transfer | (accounting-side) | AJB completion gate → recognition | **DIFFERENTIATION** (ID-notarial-deed-aware) |

**Where this product already leads:** the off-plan *money* model — price
snapshots at reservation & contract lock, multi-component contract split with
tax bearer / net-to-seller, milestone schedule with pre-invoice/due logic,
IDR-local Xendit rails, and AJB-gated revenue recognition. That is deeper and
more Indonesia-correct than the generic CRMs.

---

## (B) Recommendations (prioritized)

**P1 — trust / legal**
1. **Integrate a real e-sign provider** (DocuSign or self-hosted DocuSeal)
   behind the existing `signBuyerContract` / `signContract` cascade: keep the
   state machine, add a tamper-evident signed PDF + audit certificate stored in
   the buyer doc vault. High trust ROI on high-value contracts.
2. **Ship in-portal KYC document upload** (passport / proof-of-address) into the
   existing document vault + verification workflow; replace the "coming soon"
   readiness stub with real artifact capture.

**P2 — competitive breadth**
3. **Buyer selections / upgrades module** — the clearest differentiator gap vs
   CoConstruct/Buildertrend: priced options → buyer approval in portal →
   adjusts contract value / adds a milestone. Reuses the milestone + document
   plumbing already built.
4. **Sell-side unit-inventory / availability board** — a villa status grid
   (available / reserved / contracted / sold) with stack-plan view, sourced
   from existing villa status + reservations + contract groups. Pure read
   surface; data already exists.
5. **Sales CRM automation** — lead scoring + email sequences/nurture on the
   existing pipeline to reach HubSpot parity.
6. Fix the misleading `installments/page.tsx:46` "mock" comment (trivial).

**No action needed:** the reservation→contract→installment→AJB lifecycle is
complete and correct; do not rebuild it.
