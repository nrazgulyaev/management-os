# Task — Phase 2.2 PR 4 — Mgmt · Operations command center

**Reference doc:** `_handoff/cabinets/mgmt-p1/operations.html`

## Files

ROUTES:
- `src/app/(dashboard)/dashboard/operations/page.tsx` — new single-page command center (3 zones: hero + maintenance + turnovers compact)
- `src/app/(dashboard)/dashboard/operations/maintenance/[id]/page.tsx` — new ticket detail (template 05 assembly A)
- `src/app/(dashboard)/dashboard/operations/turnovers/page.tsx` — new full housekeeping board

PRIMITIVES:
- `src/components/operations/ops-hero.tsx` — 3-tile hero. Dark arrivals tile + 2 supporting tiles (SLA, turnovers).
- `src/components/operations/ops-tile.tsx` — polymorphic primitive (label + big-num + context + footer). Used in hero.
- `src/components/operations/maintenance-queue.tsx` — grid-row layout per ticket. Sort SLA-risk-first.
- `src/components/operations/turnover-board.tsx` — `<TurnoverBoard compact? />`. 4-col kanban. Uses `@dnd-kit/core` + `@dnd-kit/sortable` (new dep, ~12KB gzip).
- `src/components/operations/sla-pill.tsx` — 3 states
- `src/components/operations/priority-badge.tsx` — P0/P1/P2/P3
- `src/components/operations/staff-chip.tsx` — used everywhere. Unassigned variant dashed. Click → AssignStaffModal.

FEATURES:
- `src/features/maintenance/sla.ts` — pure fn `computeSlaStatus(ticket, now): "on-track"|"at-risk"|"breached"`. Targets per priority: P0=2h, P1=8h, P2=48h, P3=14d. Status = at-risk if age >= 60% of target, breached if >= target.

SCHEMA:
- `sla_breaches` — new (FK ticket_id, breached_at, resolved_at?, breach_minutes denormalised)
- Existing: `maintenance_tickets`, `turnovers`, `arrival_prep_checklist`, `staff`

MODALS:
- `src/components/operations/new-ticket-modal.tsx` — form-md (priority + photo + villa + description)
- `src/components/operations/assign-staff-modal.tsx` — form-sm typeahead. **Cross-cabinet reusable** (also used by Bookings cabinet for arrival prep + Owners cabinet for villa staff)
- `src/components/operations/resolve-ticket-modal.tsx` — confirm (cost + photos + owner-visible toggle)
- `src/components/operations/escalate-ticket-modal.tsx` — form-sm (reassign + bump priority + reason)

AGENTS:
- `maintenance-triage` — refactored from 2.1 catalog
- `src/features/ai-agents/turnover-allocator/` — new. Runs every 90s. Assigns cleaners by geography + workload.
- `arrival-prep` — shared with Bookings cabinet (PR 1)

## New dep

`npm install @dnd-kit/core @dnd-kit/sortable` (~12KB gzip total)

## Wiring example — single-page command center

```tsx
const { arrivals, slaSummary, turnovers, tickets } = await getOpsData();

return (
  <main>
    <PageHeader title="Operations" timestamp={now} actions={…} />
    <OpsHero arrivals={arrivals} sla={slaSummary} turnovers={turnovers} />
    <section className="mt-6">
      <h2 className="display-md">Maintenance · {tickets.length} open</h2>
      <MaintenanceQueue tickets={tickets} onAssign={…} />
    </section>
    <section className="mt-6">
      <h2 className="display-md">Turnovers · today</h2>
      <TurnoverBoard compact turnovers={turnovers} onMove={…} />
    </section>
  </main>
);
```

## Validation

- SLA computation is server-side every render (no client recompute drift)
- Breached tickets visually distinct (warn bg + warn SLA pill)
- Kanban: drag-between columns works; release commits status change to DB
- `@dnd-kit` correctly disabled at <=900px (touch UX deferred to Field portal in 2.5)

## Commit

`phase-2.2(mgmt-operations): command center + maintenance queue + turnover board (dnd-kit) + SLA model + 4 modals + 2 agents`
