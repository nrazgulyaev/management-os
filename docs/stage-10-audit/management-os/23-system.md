# System — management-os

**Pages audited**: 6
**Verdicts**: MISSING=5 · EMPTY-LEAKY=1
**Severity counts**: BLOCKER=5 · HIGH=1 · MEDIUM=0 · LOW=0 · OK=0

---

## Issues by severity


**[BLOCKER]** `/dashboard/system/demo-walkthrough` — 404 not found

**[BLOCKER]** `/dashboard/system/deployment-readiness` — 404 not found

**[BLOCKER]** `/dashboard/system/job-locks` — 404 not found

**[BLOCKER]** `/dashboard/system/job-runs` — 404 not found

**[BLOCKER]** `/dashboard/system/jobs` — 404 not found

**[HIGH]** `/dashboard/system/health` — developer leak: npm run db:migrate, db:migrate

---

## Per-page detail

### `/dashboard/system/demo-walkthrough`

- **Status**: MISSING · HTTP 404 · 0.8s
- **Title**: Arconique Management OS
- **CRUD**: add=0 edit=0 delete=0
- **UX leaks**: none
- **Empty state**: —
- **Console errors**: 1 · Failed to load resource: the server responded with a status of 404 ()
- **Severity**: BLOCKER
- **Issues**: 
  - 404 not found
- **Screenshot**: `tmp/stage-10-screenshots/_dashboard_system_demo-walkthrough.jpeg`

---

### `/dashboard/system/deployment-readiness`

- **Status**: MISSING · HTTP 404 · 0.8s
- **Title**: Arconique Management OS
- **CRUD**: add=0 edit=0 delete=0
- **UX leaks**: none
- **Empty state**: —
- **Console errors**: 1 · Failed to load resource: the server responded with a status of 404 ()
- **Severity**: BLOCKER
- **Issues**: 
  - 404 not found
- **Screenshot**: `tmp/stage-10-screenshots/_dashboard_system_deployment-readiness.jpeg`

---

### `/dashboard/system/health`

- **Status**: EMPTY-LEAKY · HTTP 200 · 3.0s
- **Title**: System health · Arconique Management OS
- **CRUD**: add=0 edit=0 delete=0
- **UX leaks**: dev-leaks=[npm run db:migrate | db:migrate]
- **Empty state**: "Quick view of migration status, environment readiness, and recent table counts. Failed counts here usually mean a migrat" · no CTA
- **Console errors**: 0
- **Severity**: HIGH
- **Issues**: 
  - developer leak: npm run db:migrate, db:migrate
- **Screenshot**: `tmp/stage-10-screenshots/_dashboard_system_health.jpeg`

---

### `/dashboard/system/job-locks`

- **Status**: MISSING · HTTP 404 · 0.8s
- **Title**: Arconique Management OS
- **CRUD**: add=0 edit=0 delete=0
- **UX leaks**: none
- **Empty state**: —
- **Console errors**: 1 · Failed to load resource: the server responded with a status of 404 ()
- **Severity**: BLOCKER
- **Issues**: 
  - 404 not found
- **Screenshot**: `tmp/stage-10-screenshots/_dashboard_system_job-locks.jpeg`

---

### `/dashboard/system/job-runs`

- **Status**: MISSING · HTTP 404 · 0.8s
- **Title**: Arconique Management OS
- **CRUD**: add=0 edit=0 delete=0
- **UX leaks**: none
- **Empty state**: —
- **Console errors**: 1 · Failed to load resource: the server responded with a status of 404 ()
- **Severity**: BLOCKER
- **Issues**: 
  - 404 not found
- **Screenshot**: `tmp/stage-10-screenshots/_dashboard_system_job-runs.jpeg`

---

### `/dashboard/system/jobs`

- **Status**: MISSING · HTTP 404 · 0.8s
- **Title**: Arconique Management OS
- **CRUD**: add=0 edit=0 delete=0
- **UX leaks**: none
- **Empty state**: —
- **Console errors**: 1 · Failed to load resource: the server responded with a status of 404 ()
- **Severity**: BLOCKER
- **Issues**: 
  - 404 not found
- **Screenshot**: `tmp/stage-10-screenshots/_dashboard_system_jobs.jpeg`

