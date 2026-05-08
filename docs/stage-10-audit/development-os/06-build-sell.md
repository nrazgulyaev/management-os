# Build & sell — development-os

**Pages audited**: 5
**Verdicts**: USABLE=2 · EMPTY-OK=1 · MISSING=2
**Severity counts**: BLOCKER=2 · HIGH=1 · MEDIUM=2 · LOW=0 · OK=0

---

## Issues by severity


**[BLOCKER]** `/development-os/operations/site-reports` — 404 not found

**[BLOCKER]** `/development-os/projects/new` — 404 not found

**[HIGH]** `/development-os/asset-types` — stage label leak: 5.F, 5.E, 5.D, 5.C, 5.B, 4.A, 3.C, 3.D, 4.C, 5.H, 5.A, 3.A, 5.J, 5.B.1; next-wave badge: soon; add but no edit/delete affordance

**[MEDIUM]** `/development-os/assets` — stage label leak: 5.F, 5.E, 5.D, 5.C, 5.B, 4.A, 3.C, 3.D, 4.C, 5.H, 5.A, 3.A, 5.J, 5.B.1; next-wave badge: soon

**[MEDIUM]** `/development-os/projects` — stage label leak: 5.F, 5.E, 5.D, 5.C, 5.B, 4.A, 3.C, 3.D, 4.C, 5.H, 5.A, 3.A, 5.J; next-wave badge: soon; delete without visible confirmation pattern

---

## Per-page detail

### `/development-os/asset-types`

- **Status**: USABLE · HTTP 200 · 4.1s
- **Title**: Asset types · Development OS · Arconique Management OS
- **CRUD**: add=1 (?) edit=0 delete=0
- **UX leaks**: stage-labels=[5.F, 5.E, 5.D, 5.C, 5.B, 4.A, 3.C, 3.D, 4.C, 5.H, 5.A, 3.A, 5.J, 5.B.1] · next-wave=[soon]
- **Empty state**: "Strategy B for the multi-asset refactor: every entry in `villas` (now semantically the assets table) carries an asset_ty" · has CTA
- **Console errors**: 0
- **Severity**: HIGH
- **Issues**: 
  - stage label leak: 5.F, 5.E, 5.D, 5.C, 5.B, 4.A, 3.C, 3.D, 4.C, 5.H, 5.A, 3.A, 5.J, 5.B.1
  - next-wave badge: soon
  - add but no edit/delete affordance
- **Screenshot**: `tmp/stage-10-screenshots/_development-os_asset-types.jpeg`

---

### `/development-os/assets`

- **Status**: EMPTY-OK · HTTP 200 · 4.1s
- **Title**: Assets · Development OS · Arconique Management OS
- **CRUD**: add=0 edit=0 delete=0
- **UX leaks**: stage-labels=[5.F, 5.E, 5.D, 5.C, 5.B, 4.A, 3.C, 3.D, 4.C, 5.H, 5.A, 3.A, 5.J, 5.B.1] · next-wave=[soon]
- **Empty state**: "Every saleable / rentable / revenue-generating unit in the portfolio. Backed by the `villas` table — the name is preserv" · no CTA
- **Console errors**: 0
- **Severity**: MEDIUM
- **Issues**: 
  - stage label leak: 5.F, 5.E, 5.D, 5.C, 5.B, 4.A, 3.C, 3.D, 4.C, 5.H, 5.A, 3.A, 5.J, 5.B.1
  - next-wave badge: soon
- **Screenshot**: `tmp/stage-10-screenshots/_development-os_assets.jpeg`

---

### `/development-os/operations/site-reports`

- **Status**: MISSING · HTTP 404 · 1.1s
- **Title**: Arconique Management OS
- **CRUD**: add=0 edit=0 delete=0
- **UX leaks**: none
- **Empty state**: —
- **Console errors**: 1 · Failed to load resource: the server responded with a status of 404 ()
- **Severity**: BLOCKER
- **Issues**: 
  - 404 not found
- **Screenshot**: `tmp/stage-10-screenshots/_development-os_operations_site-reports.jpeg`

---

### `/development-os/projects`

- **Status**: USABLE · HTTP 200 · 4.4s
- **Title**: Projects · Development OS · Arconique Management OS
- **CRUD**: add=1 (?) edit=0 delete=1 (no confirm)
- **UX leaks**: stage-labels=[5.F, 5.E, 5.D, 5.C, 5.B, 4.A, 3.C, 3.D, 4.C, 5.H, 5.A, 3.A, 5.J] · next-wave=[soon]
- **Empty state**: —
- **Console errors**: 0
- **Severity**: MEDIUM
- **Issues**: 
  - stage label leak: 5.F, 5.E, 5.D, 5.C, 5.B, 4.A, 3.C, 3.D, 4.C, 5.H, 5.A, 3.A, 5.J
  - next-wave badge: soon
  - delete without visible confirmation pattern
- **Screenshot**: `tmp/stage-10-screenshots/_development-os_projects.jpeg`

---

### `/development-os/projects/new`

- **Status**: MISSING · HTTP 404 · 3.7s
- **Title**: Project · Development OS · Arconique Management OS
- **CRUD**: add=0 edit=0 delete=0
- **UX leaks**: stage-labels=[5.F, 5.E, 5.D, 5.C, 5.B, 4.A, 3.C, 3.D, 4.C, 5.H, 5.A, 3.A, 5.J] · next-wave=[soon]
- **Empty state**: —
- **Console errors**: 1 · Failed to load resource: the server responded with a status of 404 ()
- **Severity**: BLOCKER
- **Issues**: 
  - 404 not found
- **Screenshot**: `tmp/stage-10-screenshots/_development-os_projects_new.jpeg`

