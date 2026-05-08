# Settings — management-os

**Pages audited**: 5
**Verdicts**: USABLE=4 · MISSING=1
**Severity counts**: BLOCKER=1 · HIGH=1 · MEDIUM=1 · LOW=1 · OK=1

---

## Issues by severity


**[BLOCKER]** `/dashboard/settings/account-security` — 404 not found

**[HIGH]** `/dashboard/settings/responsibility-scopes` — add but no edit/delete affordance

**[MEDIUM]** `/dashboard/settings/ai-agents` — stage label leak: Stage 7.F

**[LOW]** `/dashboard/settings/team` — delete without visible confirmation pattern

---

## Per-page detail

### `/dashboard/settings`

- **Status**: USABLE · HTTP 200 · 6.2s
- **Title**: Settings · Arconique Management OS
- **CRUD**: add=0 edit=0 delete=0
- **UX leaks**: none
- **Empty state**: —
- **Console errors**: 0
- **Severity**: OK
- **Screenshot**: `tmp/stage-10-screenshots/_dashboard_settings.jpeg`

---

### `/dashboard/settings/account-security`

- **Status**: MISSING · HTTP 404 · 0.8s
- **Title**: Arconique Management OS
- **CRUD**: add=0 edit=0 delete=0
- **UX leaks**: none
- **Empty state**: —
- **Console errors**: 1 · Failed to load resource: the server responded with a status of 404 ()
- **Severity**: BLOCKER
- **Issues**: 
  - 404 not found
- **Screenshot**: `tmp/stage-10-screenshots/_dashboard_settings_account-security.jpeg`

---

### `/dashboard/settings/ai-agents`

- **Status**: USABLE · HTTP 200 · 5.2s
- **Title**: AI agents · Settings · Arconique Management OS
- **CRUD**: add=0 edit=0 delete=0
- **UX leaks**: stage-labels=[Stage 7.F]
- **Empty state**: —
- **Console errors**: 0
- **Severity**: MEDIUM
- **Issues**: 
  - stage label leak: Stage 7.F
- **Screenshot**: `tmp/stage-10-screenshots/_dashboard_settings_ai-agents.jpeg`

---

### `/dashboard/settings/responsibility-scopes`

- **Status**: USABLE · HTTP 200 · 3.2s
- **Title**: Responsibility scopes · Arconique Management OS
- **CRUD**: add=1 (?) edit=0 delete=0
- **UX leaks**: none
- **Empty state**: "No scopes yet." · has CTA
- **Console errors**: 0
- **Severity**: HIGH
- **Issues**: 
  - add but no edit/delete affordance
- **Screenshot**: `tmp/stage-10-screenshots/_dashboard_settings_responsibility-scopes.jpeg`

---

### `/dashboard/settings/team`

- **Status**: USABLE · HTTP 200 · 3.1s
- **Title**: Team · Settings · Arconique Management OS
- **CRUD**: add=0 edit=0 delete=2 (no confirm)
- **UX leaks**: none
- **Empty state**: —
- **Console errors**: 0
- **Severity**: LOW
- **Issues**: 
  - delete without visible confirmation pattern
- **Screenshot**: `tmp/stage-10-screenshots/_dashboard_settings_team.jpeg`

