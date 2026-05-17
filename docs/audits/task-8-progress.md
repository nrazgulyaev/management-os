# TASK-8 stub backfill — progress tracker

**Status:** TASK-8-MISSING-ROUTES-1 — 3/9 routes shipped. Visual-polish + remaining routes deferred to follow-up sessions.

## Shipped routes (TASK-8-MISSING-ROUTES-1)

| Route | Source | Live data wiring |
|---|---|---|
| `/development-os/cfo` | `_handoff/development/cfo.html` | Mock — wiring to dev_transactions follow-up |
| `/development-os/warehouse` | `_handoff/development/warehouse.html` | SKU + category KPIs wired to dev_os_inventory_items (40 seeded). Deliveries-today table mock. |
| `/development-os/marketing` | `_handoff/development/marketing.html` | Mock — wiring to leads + campaigns tables follow-up |

## Remaining routes (TASK-8-MISSING-ROUTES-2)

- `/development-os/communications`
- `/development-os/knowledge`
- `/development-os/platform`
- `/development-os/schedule` — could wire to project_tasks + work_packages (45+15 seeded)
- `/development-os/settings`
- `/development-os/strategic`

## Audit findings (2026-05-17)

Most Mgmt OS routes flagged in the original TASK-8 priority list are **already substantially built**, not stubs. The genuine stubs cluster in two places:

### Genuine stubs (small page.tsx, no data wiring)

| Route | Lines | Prototype | Notes |
|---|---|---|---|
| `/development-os/cabinets/my-cabinet` | 13 | `_handoff/development/my-cabinet.html` | Role-redirect page; intentionally minimal — NOT a stub |

### Missing routes (prototype exists, no route)

Dev OS cabinets the prototype defines but no Next.js route exists:
- `cfo` (separate from `cfo-accountant`)
- `communications`
- `knowledge`
- `marketing` (separate from `marketing-staff`)
- `platform`
- `schedule`
- `settings`
- `strategic`
- `warehouse` (separate from `warehouse-manager`)

These would require fresh route creation, not "porting" — out of TASK-8 scope per the spec ("page.tsx is minimal/old" implies route already exists).

### Already-built routes (NOT stubs)

| Route | Lines |
|---|---|
| `/dashboard/villas` | 117 (with live `listVillas`) |
| `/dashboard/projects` | 104 (with live `listProjects`) |
| `/dashboard/owners` | functional with impersonation entry |
| `/dashboard/audit` | 119 |
| `/dashboard/notifications` | 216 |
| `/dashboard/integrations` | 176 |
| `/dashboard/owner-intelligence` | 147 |
| `/dashboard/security` | 500 |
| `/dashboard/service-fulfilment` | 96 |
| `/dashboard/direct-bookings` | 120 |
| `/dashboard/guest-journey` | 117 |
| `/development-os/risk-radar` | 114 |
| `/development-os/cabinets/cfo-accountant` | 420 |
| `/development-os/cabinets/marketing-staff` | 445 |
| `/development-os/cabinets/sales-manager` | 470 |
| `/development-os/cabinets/warehouse-manager` | 374 |

These pages may benefit from VISUAL-FIDELITY enrichment (port KPI strips / table treatments from prototypes) but they're not empty stubs. Treat as **visual-polish** scope, not TASK-8 stub-backfill.

## Available prototypes

`_handoff/management/`: 31 HTML files
`_handoff/development/`: 23 HTML files

## Recommended next-session sprints

1. **TASK-8-VISUAL-POLISH-1** — Enrich existing functional pages with prototype's KPI strips + roll-up tables (e.g., `/dashboard/projects` add 5-up KPI + roll-up table from `_handoff/management/projects.html`)
2. **TASK-8-MISSING-ROUTES-1** — Create the 9 Dev OS cabinet routes that don't exist yet (cfo, communications, knowledge, marketing, platform, schedule, settings, strategic, warehouse) with mock data from prototypes
3. **TASK-10** — After visual work substantially complete, Playwright baselines

## Halt rationale

P3 not attempted this session because:
1. Audit reveals most high-priority routes are NOT stubs — they're functional
2. The genuine stubs are mostly redirect pages or missing routes (different scope)
3. Visual-polish ports require care (preserving existing wiring) — best done in dedicated session

Better next-session strategy: pick ONE specific cabinet, do a clean visual-polish port preserving its existing live-data wiring, commit, iterate.
