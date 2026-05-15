# Route health report — 2026-05-15

Hotfix HF-3 Task 2.3–2.4. Health audit of the routes catalogued in
`2026-05-15-route-inventory.md`. Build status, anomalies, and a manual
visit checklist for the operator.

---

## Build status

`npm run build` on 2026-05-15 at 14:30 UTC:

- **Exit code**: 0
- **Errors**: 0
- **Warnings**: 0
- **Routes emitted**: matches the source-tree inventory (627 pages + 155 routes); the new AI agent settings detail route (`/dashboard/settings/ai-agents/[agent_key]`) appears in `.next/server/app/(dashboard)/dashboard/settings/ai-agents/[agent_key]/page.js` and now resolves all 14 keys in `CONFIGURABLE_AGENTS` (was 9 before HF-3).

Conclusion: no broken-build routes. Below 5 broken routes — HALT
condition not triggered.

---

## Issues found

### 🟢 Resolved (this hotfix)

1. **`/dashboard/settings/ai-agents/[agent_key]` 404 for 5 MD-5 agents** — the page gated on a hardcoded `CONFIGURABLE_AGENTS` allowlist that hadn't been synced with migrations 0098–0102. Fix: added the 5 MD-5 keys to `CONFIGURABLE_AGENTS` + `AGENT_CATALOG` and replaced the bare `notFound()` with a graceful `<EmptyState>` for truly unknown keys. New migration 0103 widens the `org_ai_agent_config.agent_key` CHECK constraint so the per-org enable toggle's INSERT can succeed for the new agents.

### 🟡 Pre-existing layout-only folders (NOT HF-3 regressions)

Six folders have a `layout.tsx` but no root `page.tsx`. Their children
resolve correctly; the root URL itself returns 404. These are
pre-existing structural choices from earlier sprints, not regressions.
Listing them for visibility:

| URL | Notes |
|---|---|
| `/dashboard/billing` | Children: `/upgrade`, `/cancel`, etc. resolve. Root URL 404. |
| `/dashboard/system` | Children: `/deployment`, `/health`, `/storage` resolve. Root URL 404. |
| `/development-os/marketing` | 9 subsections resolve. Root URL 404. |
| `/development-os/operations` | `/site-reports` resolves. Root URL 404. |
| `/development-os/platform` | Subsections resolve. Root URL 404. |
| `/development-os/cabinets` | All 9 cabinet apexes resolve. Root URL 404. |

**Recommendation (NOT in HF-3 scope)**: a follow-up sprint should
either add minimal index pages or wire up redirects (e.g.,
`/dashboard/billing` → `/dashboard/billing/upgrade`). Operators
typically navigate via sidebar, so this is cosmetic, not blocking.

### 🟡 Cosmetic duplicate: `/dashboard/owner` vs `/dashboard/owners`

Both exist. Per the codebase layout, `/dashboard/owner` is the
Mgmt-OS cabinet apex (single owner perspective) and `/dashboard/owners`
is the operator's list of owners. The naming is confusing but
intentional — not a route conflict.

### 🟢 No critical issues

No route conflicts, no orphaned dynamic segments, no missing layouts
on critical paths. The Mgmt-OS apex cabinets (HF-2) all render via the
Sprint-4 `HeroGreetingAI` pattern; the Dev-OS apex cabinets all render
via the Mega-Sprint Phase 1–8 patterns; the new agent settings detail
page now serves all 14 keys.

---

## Manual visit checklist for the operator

Quick smoke-walk for the production deployment after this hotfix
lands. Each row should render without error.

### Apex pages — Mgmt-OS

- [ ] `/dashboard` — owner overview, HeroGreetingAI
- [ ] `/dashboard/front-office` — HeroGreetingAI + KpiRowMixed
- [ ] `/dashboard/owner` — Mgmt-OS owner apex
- [ ] `/dashboard/villas` — list
- [ ] `/dashboard/bookings` — list
- [ ] `/dashboard/integrations` — list
- [ ] `/dashboard/settings` — settings index

### Apex pages — Dev-OS

- [ ] `/development-os` — Dev-OS apex
- [ ] `/development-os/cabinets/cfo-accountant`
- [ ] `/development-os/cabinets/project-manager`
- [ ] `/development-os/cabinets/qs`
- [ ] `/development-os/cabinets/procurement-manager`
- [ ] `/development-os/cabinets/sales-manager`
- [ ] `/development-os/cabinets/marketing-staff`
- [ ] `/development-os/cabinets/site-supervisor`
- [ ] `/development-os/cabinets/warehouse-manager`

### AI agent settings (THE HOTFIX TARGET)

The list page should now show 14 agents (was 9):

- [ ] `/dashboard/settings/ai-agents` — full list, 14 rows
- [ ] `/dashboard/settings/ai-agents/qs_cost_analyst`
- [ ] `/dashboard/settings/ai-agents/procurement_analyst`
- [ ] `/dashboard/settings/ai-agents/tax_assistant`
- [ ] `/dashboard/settings/ai-agents/marketing_assistant`
- [ ] `/dashboard/settings/ai-agents/executive_business`
- [ ] `/dashboard/settings/ai-agents/daily_digest`
- [ ] `/dashboard/settings/ai-agents/weekly_plan`
- [ ] `/dashboard/settings/ai-agents/inbox`
- [ ] `/dashboard/settings/ai-agents/memory`
- [ ] `/dashboard/settings/ai-agents/investor_copilot` ← was 404
- [ ] `/dashboard/settings/ai-agents/front_office_copilot` ← was 404
- [ ] `/dashboard/settings/ai-agents/housekeeping_scheduler` ← was 404
- [ ] `/dashboard/settings/ai-agents/concierge_handoff` ← was 404
- [ ] `/dashboard/settings/ai-agents/security_copilot` ← was 404
- [ ] `/dashboard/settings/ai-agents/does-not-exist` ← should now render EmptyState, not 404

### Unknown-key graceful handling

Pick any random unknown agent_key in the URL bar and confirm:
- Breadcrumbs show "Unknown agent"
- Page renders an `<EmptyState>` titled `No agent registered with key "<the-key>"`
- "← Back to AI agents" link visible

### Public marketing

- [ ] `/` — homepage
- [ ] `/products/management-os`
- [ ] `/products/development-os`
- [ ] `/features/management-os`
- [ ] `/features/development-os`
- [ ] `/pricing`

### Portals

- [ ] `/owner` — owner portal entry
- [ ] `/investor-portal/dashboard`
- [ ] `/stay/demo` — guest demo
- [ ] `/buyer-portal/dashboard`

---

## Outcome

- **No routes broken by HF-3 build**.
- **5 previously-broken routes** (`/dashboard/settings/ai-agents/<MD-5 key>`) **now resolve**.
- **1 graceful-fallback path added** (unknown agent_key renders EmptyState).
- **6 pre-existing layout-only roots** flagged for cosmetic follow-up — not in HF-3 scope.

Per HF-3 halt criteria: total broken-route count after fix is 0 (well
under the 5-route threshold), no agent_runner/provider-routing changes
were needed, and the build output is fully synchronized with the
source tree. **Proceed to Task 3 (gates + close).**
