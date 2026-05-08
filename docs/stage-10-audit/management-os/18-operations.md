# Operations — management-os

**Pages audited**: 8
**Verdicts**: EMPTY-OK=1 · MISSING=1 · USABLE=6
**Severity counts**: BLOCKER=1 · HIGH=4 · MEDIUM=0 · LOW=0 · OK=3

---

## Issues by severity


**[BLOCKER]** `/dashboard/operations/command-center` — 404 not found

**[HIGH]** `/dashboard/operations/housekeeping` — add but no edit/delete affordance; add navigates to page (should be modal)

**[HIGH]** `/dashboard/operations/maintenance` — add but no edit/delete affordance; add navigates to page (should be modal)

**[HIGH]** `/dashboard/operations/preventive` — add but no edit/delete affordance; add navigates to page (should be modal)

**[HIGH]** `/dashboard/operations/tasks` — add but no edit/delete affordance; add navigates to page (should be modal)

---

## Per-page detail

### `/dashboard/operations/checklists`

- **Status**: EMPTY-OK · HTTP 200 · 3.5s
- **Title**: Operations · Checklists · Arconique Management OS
- **CRUD**: add=0 edit=0 delete=0
- **UX leaks**: none
- **Empty state**: "Standard turnover cleaning checklist used between guest stays." · no CTA
- **Console errors**: 0
- **Severity**: OK
- **Screenshot**: `tmp/stage-10-screenshots/_dashboard_operations_checklists.jpeg`

---

### `/dashboard/operations/command-center`

- **Status**: MISSING · HTTP 404 · 0.8s
- **Title**: Arconique Management OS
- **CRUD**: add=0 edit=0 delete=0
- **UX leaks**: none
- **Empty state**: —
- **Console errors**: 1 · Failed to load resource: the server responded with a status of 404 ()
- **Severity**: BLOCKER
- **Issues**: 
  - 404 not found
- **Screenshot**: `tmp/stage-10-screenshots/_dashboard_operations_command-center.jpeg`

---

### `/dashboard/operations/damage-reports`

- **Status**: USABLE · HTTP 200 · 3.2s
- **Title**: Operations · Damage reports · Arconique Management OS
- **CRUD**: add=0 edit=0 delete=0
- **UX leaks**: none
- **Empty state**: —
- **Console errors**: 0
- **Severity**: OK
- **Screenshot**: `tmp/stage-10-screenshots/_dashboard_operations_damage-reports.jpeg`

---

### `/dashboard/operations/housekeeping`

- **Status**: USABLE · HTTP 200 · 3.2s
- **Title**: Operations · Housekeeping · Arconique Management OS
- **CRUD**: add=1 (page) edit=0 delete=0
- **UX leaks**: none
- **Empty state**: "Cleaning turnovers, deep cleans, common-area inspections." · has CTA
- **Console errors**: 0
- **Severity**: HIGH
- **Issues**: 
  - add but no edit/delete affordance
  - add navigates to page (should be modal)
- **Screenshot**: `tmp/stage-10-screenshots/_dashboard_operations_housekeeping.jpeg`

---

### `/dashboard/operations/maintenance`

- **Status**: USABLE · HTTP 200 · 3.3s
- **Title**: Operations · Maintenance · Arconique Management OS
- **CRUD**: add=1 (page) edit=0 delete=0
- **UX leaks**: none
- **Empty state**: —
- **Console errors**: 0
- **Severity**: HIGH
- **Issues**: 
  - add but no edit/delete affordance
  - add navigates to page (should be modal)
- **Screenshot**: `tmp/stage-10-screenshots/_dashboard_operations_maintenance.jpeg`

---

### `/dashboard/operations/preventive`

- **Status**: USABLE · HTTP 200 · 3.2s
- **Title**: Operations · Preventive · Arconique Management OS
- **CRUD**: add=2 (page) edit=0 delete=0
- **UX leaks**: none
- **Empty state**: —
- **Console errors**: 0
- **Severity**: HIGH
- **Issues**: 
  - add but no edit/delete affordance
  - add navigates to page (should be modal)
- **Screenshot**: `tmp/stage-10-screenshots/_dashboard_operations_preventive.jpeg`

---

### `/dashboard/operations/service-requests`

- **Status**: USABLE · HTTP 200 · 3.6s
- **Title**: Operations · Service requests · Arconique Management OS
- **CRUD**: add=0 edit=0 delete=0
- **UX leaks**: none
- **Empty state**: —
- **Console errors**: 0
- **Severity**: OK
- **Screenshot**: `tmp/stage-10-screenshots/_dashboard_operations_service-requests.jpeg`

---

### `/dashboard/operations/tasks`

- **Status**: USABLE · HTTP 200 · 3.0s
- **Title**: Operations · Tasks · Arconique Management OS
- **CRUD**: add=1 (page) edit=0 delete=0
- **UX leaks**: none
- **Empty state**: —
- **Console errors**: 0
- **Severity**: HIGH
- **Issues**: 
  - add but no edit/delete affordance
  - add navigates to page (should be modal)
- **Screenshot**: `tmp/stage-10-screenshots/_dashboard_operations_tasks.jpeg`

