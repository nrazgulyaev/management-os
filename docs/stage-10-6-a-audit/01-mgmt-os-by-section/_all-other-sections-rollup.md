# 01 — Mgmt OS / All other sections (rollup, slim format)

For sections where every page returned 🟢 USABLE in the production
sweep AND no operator-flagged behavior exists. Each section contains
1-N pages; per the operator's tiered-format approval (Q2(b)) we use
the slim format here.

If during CHECKPOINT 3 follow-up file inspection reveals a 🔴/🟡
finding on any of these pages, that page graduates to its own
per-section file with the full template.

---

## `/dashboard` (root overview)

- 🟢 USABLE · Hero greeting + recent activity stream
- Layout: legacy `<PageHeader>` + custom widgets — candidate for
  Stage 10.5.A pattern adoption (PageHeaderHero + 4 KPIs)
- Demo data: production check needed
- Recommended: Phase 10.6.C visual modernization

---

## `/dashboard/villa-guides/*` (6 pages)

- `/dashboard/villa-guides` 🟢 USABLE (hub)
- `/dashboard/villa-guides/wifi` — see [`villa-guides-wifi.md`](villa-guides-wifi.md) (Delete missing)
- `/dashboard/villa-guides/sections` 🟢 USABLE
- `/dashboard/villa-guides/emergency-contacts` 🟢 USABLE
- `/dashboard/villa-guides/neighborhood` 🟢 USABLE
- `/dashboard/villa-guides/services/catalog` — see [`guest-services.md`](guest-services.md) (Delete broken)

---

## `/dashboard/owner-intelligence/*` (8 pages)

All 🟢 USABLE in sweep. Stage 10.J already polished this section.
- `/dashboard/owner-intelligence` (hub)
- `/dashboard/owner-intelligence/calendar`
- `/dashboard/owner-intelligence/health` + `/health/[id]`
- `/dashboard/owner-intelligence/reviews`
- `/dashboard/owner-intelligence/preferences`
- `/dashboard/owner-intelligence/bookings`
- `/dashboard/owner-intelligence/revenue`

---

## `/dashboard/owner-stays/*` (5 pages)

All 🟢 USABLE in sweep. Operator's Q10-Q13 business-logic questions
concentrate here — see [`_business-logic-questions.md`](_business-logic-questions.md).
- `/dashboard/owner-stays`
- `/dashboard/owner-stays/requests`
- `/dashboard/owner-stays/policies`
- `/dashboard/owner-stays/equivalence-groups`
- `/dashboard/owner-stays/finance-bridge`

Phase 10.6.F deep-work candidate.

---

## `/dashboard/operations/*` (8 pages)

All 🟢 USABLE in sweep.
- `/dashboard/operations` (hub)
- `/dashboard/operations/tasks`
- `/dashboard/operations/housekeeping`
- `/dashboard/operations/maintenance`
- `/dashboard/operations/preventive`
- `/dashboard/operations/damage-reports`

Modal-First Add violations expected (per `_modal-first-scan.md` raw
list). Phase 10.6.B Modal-First batch will catch these.

---

## `/dashboard/finance/*` (3 pages plus sub-pages)

All 🟢 USABLE in sweep. Modal-First Add violations expected on
`/expenses`, `/fees`, `/payouts`, `/periods`, `/reserves`,
`/revenue`, `/statements`, `/taxes`.

---

## `/dashboard/integrations/*` (5 pages)

All 🟢 USABLE in sweep. Per operator Q1 (calendar feed sync) +
"Cannot add new channel", needs deeper inspection.
- `/dashboard/integrations` (hub)
- `/dashboard/integrations/calendar-feeds`
- `/dashboard/integrations/channels` — operator-flagged "Cannot add new channel"
- (others)

**Channels add gap**: needs CHECKPOINT 3 file inspection. 3 hypotheses:
1. Add modal exists but server action permission-blocked.
2. Form rendered but per-channel OAuth handshake incomplete.
3. Add affordance missing entirely (Wi-Fi pattern).

Phase 10.6.B if confirmed bug.

---

## `/dashboard/security/*` (6 pages)

All 🟢 USABLE in sweep. Operator's Q4 (security events) + Q5
(verifications) carry over to 10.6.F.

---

## `/dashboard/notifications/*` (4 pages)

All 🟢 USABLE after 45s-timeout retest (main sweep timeouts were
harness-flaky).

---

## `/dashboard/inventory/*` (8 pages)

All 🟢 USABLE after 45s-timeout retest. Modal-First Add violations
expected on most.

---

## `/dashboard/procurement/*` (3 pages)

All 🟢 USABLE after 45s-timeout retest. Modal-First Add violations
expected.

---

## `/dashboard/system/*` + `/dashboard/audit` + `/dashboard/jobs/*` + `/dashboard/demo` + `/dashboard/documents` + `/dashboard/ai` + `/dashboard/guest-ai/handoffs/metrics`

All 🟢 USABLE after 45s-timeout retest.

---

## `/dashboard/settings/*` (3 pages)

All 🟢 USABLE after 45s-timeout retest. Stage 10.5.B Mgmt OS
settings UI lives at `/dashboard/settings/ai-agents/[agent_key]`
(spec for Dev OS-side AI agent config) — needs production verification
that the form renders correctly with the audit-bot account.

---

## `/dashboard/availability/*` (2 pages)

All 🟢 USABLE.

---

## `/dashboard/pricing/*` (6 pages — dynamic-pricing engine)

All 🟢 USABLE. Operator Q18 (rule engine) → 10.6.F.

---

## `/dashboard/utilities/*` (5 pages)

All 🟢 USABLE.

---

## `/dashboard/service-fulfilment/*` (6 pages)

All 🟢 USABLE. Operator Q20 (vendor pipeline) → 10.6.F.

---

## `/dashboard/guest-journey/*` (5 pages)

All 🟢 USABLE. Operator Q19 (rules automation) → 10.6.F.

---

## `/dashboard/direct-bookings/*` (7 pages)

All 🟢 USABLE. Operator Q17 (direct vs channel) → 10.6.F.

---

## `/dashboard/sync` (1 page)

🟡 DEFERRED in sweep (page declares deferred / coming-soon). Confirm
intentional placeholder vs incomplete build.

---

## Coverage gaps surfaced at CHECKPOINT 2

Pages that exist in the codebase but are NOT in `tmp/audit-urls.txt`:
- `/dashboard/owner` (Mgmt OS owner cabinet shipped in 10.5.A.1.1) — see [`_cabinets-visual-reaudit.md`](_cabinets-visual-reaudit.md)
- 8 redirect pages from 10.5.A.3.4 (`/dashboard/{role}` → `/development-os/cabinets/{role}`) — should be added with expectation = redirect-to-dev-OS, no full audit needed

CHECKPOINT 3 should regenerate `audit-urls.txt` from the filesystem
to close the coverage gap.
