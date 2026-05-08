# Integrations — management-os

**Pages audited**: 5
**Verdicts**: USABLE=4 · MISSING=1
**Severity counts**: BLOCKER=1 · HIGH=2 · MEDIUM=0 · LOW=0 · OK=2

---

## Issues by severity


**[BLOCKER]** `/dashboard/integrations/automation-rules` — 404 not found

**[HIGH]** `/dashboard/integrations/calendar-events` — add but no edit/delete affordance

**[HIGH]** `/dashboard/integrations/calendar-feeds` — add but no edit/delete affordance; add navigates to page (should be modal)

---

## Per-page detail

### `/dashboard/integrations`

- **Status**: USABLE · HTTP 200 · 3.1s
- **Title**: Integrations · Arconique Management OS
- **CRUD**: add=0 edit=0 delete=0
- **UX leaks**: none
- **Empty state**: —
- **Console errors**: 0
- **Severity**: OK
- **Screenshot**: `tmp/stage-10-screenshots/_dashboard_integrations.jpeg`

---

### `/dashboard/integrations/automation-rules`

- **Status**: MISSING · HTTP 404 · 0.8s
- **Title**: Arconique Management OS
- **CRUD**: add=0 edit=0 delete=0
- **UX leaks**: none
- **Empty state**: —
- **Console errors**: 1 · Failed to load resource: the server responded with a status of 404 ()
- **Severity**: BLOCKER
- **Issues**: 
  - 404 not found
- **Screenshot**: `tmp/stage-10-screenshots/_dashboard_integrations_automation-rules.jpeg`

---

### `/dashboard/integrations/calendar-events`

- **Status**: USABLE · HTTP 200 · 3.4s
- **Title**: Calendar events · Arconique Management OS
- **CRUD**: add=1 (?) edit=0 delete=0
- **UX leaks**: none
- **Empty state**: —
- **Console errors**: 0
- **Severity**: HIGH
- **Issues**: 
  - add but no edit/delete affordance
- **Screenshot**: `tmp/stage-10-screenshots/_dashboard_integrations_calendar-events.jpeg`

---

### `/dashboard/integrations/calendar-feeds`

- **Status**: USABLE · HTTP 200 · 3.4s
- **Title**: Calendar feeds · Arconique Management OS
- **CRUD**: add=1 (page) edit=0 delete=0
- **UX leaks**: none
- **Empty state**: —
- **Console errors**: 0
- **Severity**: HIGH
- **Issues**: 
  - add but no edit/delete affordance
  - add navigates to page (should be modal)
- **Screenshot**: `tmp/stage-10-screenshots/_dashboard_integrations_calendar-feeds.jpeg`

---

### `/dashboard/integrations/conflicts`

- **Status**: USABLE · HTTP 200 · 2.8s
- **Title**: Booking conflicts · Arconique Management OS
- **CRUD**: add=0 edit=0 delete=0
- **UX leaks**: none
- **Empty state**: —
- **Console errors**: 0
- **Severity**: OK
- **Screenshot**: `tmp/stage-10-screenshots/_dashboard_integrations_conflicts.jpeg`

