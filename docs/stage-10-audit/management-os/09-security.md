# Security — management-os

**Pages audited**: 5
**Verdicts**: EMPTY-OK=1 · MISSING=3 · USABLE=1
**Severity counts**: BLOCKER=3 · HIGH=1 · MEDIUM=0 · LOW=0 · OK=1

---

## Issues by severity


**[BLOCKER]** `/dashboard/security/auth/events` — 404 not found

**[BLOCKER]** `/dashboard/security/auth/login-attempts` — 404 not found

**[BLOCKER]** `/dashboard/security/auth/mfa-factors` — 404 not found

**[HIGH]** `/dashboard/security/cameras` — add but no edit/delete affordance; add navigates to page (should be modal)

---

## Per-page detail

### `/dashboard/security`

- **Status**: EMPTY-OK · HTTP 200 · 3.0s
- **Title**: Security · Arconique Management OS
- **CRUD**: add=0 edit=0 delete=0
- **UX leaks**: none
- **Empty state**: "Camera registry. The platform never streams video — every camera links out to its vendor app. Owners + guests cannot see" · no CTA
- **Console errors**: 0
- **Severity**: OK
- **Screenshot**: `tmp/stage-10-screenshots/_dashboard_security.jpeg`

---

### `/dashboard/security/auth/events`

- **Status**: MISSING · HTTP 404 · 0.8s
- **Title**: Arconique Management OS
- **CRUD**: add=0 edit=0 delete=0
- **UX leaks**: none
- **Empty state**: —
- **Console errors**: 1 · Failed to load resource: the server responded with a status of 404 ()
- **Severity**: BLOCKER
- **Issues**: 
  - 404 not found
- **Screenshot**: `tmp/stage-10-screenshots/_dashboard_security_auth_events.jpeg`

---

### `/dashboard/security/auth/login-attempts`

- **Status**: MISSING · HTTP 404 · 0.8s
- **Title**: Arconique Management OS
- **CRUD**: add=0 edit=0 delete=0
- **UX leaks**: none
- **Empty state**: —
- **Console errors**: 1 · Failed to load resource: the server responded with a status of 404 ()
- **Severity**: BLOCKER
- **Issues**: 
  - 404 not found
- **Screenshot**: `tmp/stage-10-screenshots/_dashboard_security_auth_login-attempts.jpeg`

---

### `/dashboard/security/auth/mfa-factors`

- **Status**: MISSING · HTTP 404 · 0.8s
- **Title**: Arconique Management OS
- **CRUD**: add=0 edit=0 delete=0
- **UX leaks**: none
- **Empty state**: —
- **Console errors**: 1 · Failed to load resource: the server responded with a status of 404 ()
- **Severity**: BLOCKER
- **Issues**: 
  - 404 not found
- **Screenshot**: `tmp/stage-10-screenshots/_dashboard_security_auth_mfa-factors.jpeg`

---

### `/dashboard/security/cameras`

- **Status**: USABLE · HTTP 200 · 3.0s
- **Title**: Cameras · Arconique Management OS
- **CRUD**: add=1 (page) edit=0 delete=0
- **UX leaks**: none
- **Empty state**: —
- **Console errors**: 0
- **Severity**: HIGH
- **Issues**: 
  - add but no edit/delete affordance
  - add navigates to page (should be modal)
- **Screenshot**: `tmp/stage-10-screenshots/_dashboard_security_cameras.jpeg`

