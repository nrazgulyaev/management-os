# Task — Phase 2.2 PR 0 — Seed cabinet docs as reference

Copy the 9 cabinet HTML docs from the design project into the repo. No code logic.

I'll attach 9 files (1 index + 4 Mgmt + 4 Dev). Save them at:

  _handoff/cabinets/index.html
  _handoff/cabinets/mgmt-p1/bookings.html
  _handoff/cabinets/mgmt-p1/finance.html
  _handoff/cabinets/mgmt-p1/owners.html
  _handoff/cabinets/mgmt-p1/operations.html
  _handoff/cabinets/dev-p1/projects.html
  _handoff/cabinets/dev-p1/cfo.html
  _handoff/cabinets/dev-p1/boq-qs.html
  _handoff/cabinets/dev-p1/procurement.html

These files are the spec for every following PR (PR 1–8). Each cabinet doc has:
- Information architecture (routes, agents, modals)
- Key screens with full mock UI
- State machines / behavior contracts where relevant
- "For Claude Code" table with exact file paths + prop shapes + schema notes

Each PR 1–8 prompt references its matching `_handoff/cabinets/<product>/<cabinet>.html`. Open it locally before coding.

## Validation

- All 9 files present in `_handoff/cabinets/`
- `npm run typecheck` clean (no code changed)

## Commit

`phase-2.2(seed): import 8 cabinet docs as reference material`
