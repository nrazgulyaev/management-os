# Stage 2.1 — Regression checklist

Run after every Development OS sub-stage to confirm Management OS, the public
site, and the workspace separation are still healthy.

## Automated (run first)

```bash
npm run typecheck
npm run lint
npm test                   # node:test, includes workspace-separation.test.ts
```

All three must pass. The `workspace-separation` test specifically checks:

- [x] `dashboardNav` contains zero `/development-os/*` routes.
- [x] `developmentAppNav` contains the Stage 2.1 routes (overview, projects,
      site-reports, sales, finance, investors).
- [x] All `developmentAppNav` entries are namespaced under `/development-os`.
- [x] `marketingNav` exposes the public `/development` page but NOT the
      internal `/development-os` workspace.
- [x] Both App Router groups exist (`(dashboard)/layout.tsx` and
      `(development-app)/layout.tsx`).
- [x] Stage 2.1 schema exports all five entities.
- [x] Migration 0034 creates all five tables.
- [x] WorkspaceSwitcher is mounted in both topbars.

## Manual smoke (browser)

Run `npm run dev` and click through:

### Management OS still works as it did
- [ ] `/dashboard` renders with the original sidebar (Overview, Portfolio,
      Owners & investors, Bookings, Guest stays, …, System).
- [ ] No "Development OS" entry appears in the dashboard sidebar.
- [ ] WorkspaceSwitcher in the topbar lists Management OS as the active
      workspace.
- [ ] Open three random Management OS routes and verify they render:
  - [ ] `/dashboard/projects`
  - [ ] `/dashboard/villas`
  - [ ] `/dashboard/finance`

### Development OS workspace
- [ ] `/development-os` renders the command center with KPIs, AI insight,
      project health cards (3), modules grid, snapshots, and the
      Development-OS sidebar (Command center, Projects, Site reports, Sales &
      buyers, Finance, Investors, Roadmap group).
- [ ] WorkspaceSwitcher in the topbar shows Development OS as active and lists
      Management OS, Owner Portal, Field App as switch targets.
- [ ] `/development-os/projects` renders the project list backed by DB seed:
      Eternal Villas, Enso Villas, Ahau Gardens. Filter chips work; search
      narrows the list; "+ New project" opens the drawer.
- [ ] Clicking a project card opens `/development-os/projects/<slug>`:
  - [ ] Header shows project name + location, acquisition mode badge.
  - [ ] **Overview tab** shows four KPIs and a "Project facts" stat grid.
  - [ ] **Phases tab** renders the Gantt-like timeline with overlapping
        phases; each phase listed underneath with date range and status.
  - [ ] **Land tab** renders one land plot card per project with payment
        installment list and lease tenure progress bar.
  - [ ] **Units tab** renders the unit table with construction status and
        progress bars.
  - [ ] **Documents / Finance / Sales** tabs show the "Stage 2.X" placeholder
        card.
- [ ] Roadmap entries (Site reports, Sales, Finance, Investors) carry their
      stage-target badge in the sidebar.

### Public preview
- [ ] `/development` still renders the public marketing page with hero,
      lifecycle map, modules grid, AI agent cards, management bridge.

### Cross-workspace switching
- [ ] WorkspaceSwitcher → Development OS from `/dashboard` lands on
      `/development-os`.
- [ ] WorkspaceSwitcher → Management OS from `/development-os` lands on
      `/dashboard`.
- [ ] Switcher closes on Escape and on outside click.

## Database (when DB is configured)

```bash
npm run db:migrate          # idempotent — re-running is safe
npm run db:seed             # base seed + drizzle/seed/development-stage-2-1.sql
```

After applying:

- [ ] `select count(*) from development_project_meta;` returns 3.
- [ ] `select count(*) from project_phases;` returns 16.
- [ ] `select count(*) from land_plots;` returns 3.
- [ ] `select count(*) from unit_types;` returns 4.
- [ ] `select count(*) from unit_development_meta;` returns 29.
- [ ] `/development-os/projects` shows the **Live** badge on each project card
      (vs the **Demo** badge when DB is not configured).

## Negative tests

- [ ] Visiting a non-existent project slug like
      `/development-os/projects/zzz-not-real` returns 404.
- [ ] Submitting the New Project drawer without a name shows a field error.
- [ ] Submitting the drawer with a duplicate slug shows the
      "already exists" error.
