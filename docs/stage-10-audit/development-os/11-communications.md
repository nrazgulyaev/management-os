# Communications — development-os

**Pages audited**: 5
**Verdicts**: USABLE=3 · BROKEN=1 · MISSING=1
**Severity counts**: BLOCKER=2 · HIGH=2 · MEDIUM=1 · LOW=0 · OK=0

---

## Issues by severity


**[BLOCKER]** `/development-os/integrations` — 500 server error

**[BLOCKER]** `/development-os/notifications` — 404 not found

**[HIGH]** `/development-os/inbox/auto-responses` — stage label leak: 5.F, 5.E, 5.D, 5.C, 5.B, 4.A, 3.C, 3.D, 4.C, 5.H, 5.A, 3.A, 5.J; next-wave badge: soon; add but no edit/delete affordance

**[HIGH]** `/development-os/inbox/templates` — stage label leak: 5.F, 5.E, 5.D, 5.C, 5.B, 4.A, 3.C, 3.D, 4.C, 5.H, 5.A, 3.A, 5.J; next-wave badge: soon; add but no edit/delete affordance

**[MEDIUM]** `/development-os/inbox` — stage label leak: 5.F, 5.E, 5.D, 5.C, 5.B, 4.A, 3.C, 3.D, 4.C, 5.H, 5.A, 3.A, 5.J; next-wave badge: soon

---

## Per-page detail

### `/development-os/inbox`

- **Status**: USABLE · HTTP 200 · 2.3s
- **Title**: Inbox · Development OS · Arconique Management OS
- **CRUD**: add=0 edit=0 delete=0
- **UX leaks**: stage-labels=[5.F, 5.E, 5.D, 5.C, 5.B, 4.A, 3.C, 3.D, 4.C, 5.H, 5.A, 3.A, 5.J] · next-wave=[soon]
- **Empty state**: —
- **Console errors**: 0
- **Severity**: MEDIUM
- **Issues**: 
  - stage label leak: 5.F, 5.E, 5.D, 5.C, 5.B, 4.A, 3.C, 3.D, 4.C, 5.H, 5.A, 3.A, 5.J
  - next-wave badge: soon
- **Screenshot**: `tmp/stage-10-screenshots/_development-os_inbox.jpeg`

---

### `/development-os/inbox/auto-responses`

- **Status**: USABLE · HTTP 200 · 2.0s
- **Title**: Auto-responses · Inbox · Arconique Management OS
- **CRUD**: add=1 (?) edit=0 delete=0
- **UX leaks**: stage-labels=[5.F, 5.E, 5.D, 5.C, 5.B, 4.A, 3.C, 3.D, 4.C, 5.H, 5.A, 3.A, 5.J] · next-wave=[soon]
- **Empty state**: "Triggered automations for inbound messages. Keyword + first_message + after_hours fire inline as messages arrive; no_res" · has CTA
- **Console errors**: 0
- **Severity**: HIGH
- **Issues**: 
  - stage label leak: 5.F, 5.E, 5.D, 5.C, 5.B, 4.A, 3.C, 3.D, 4.C, 5.H, 5.A, 3.A, 5.J
  - next-wave badge: soon
  - add but no edit/delete affordance
- **Screenshot**: `tmp/stage-10-screenshots/_development-os_inbox_auto-responses.jpeg`

---

### `/development-os/inbox/templates`

- **Status**: USABLE · HTTP 200 · 2.0s
- **Title**: Message templates · Inbox · Arconique Management OS
- **CRUD**: add=1 (?) edit=0 delete=0
- **UX leaks**: stage-labels=[5.F, 5.E, 5.D, 5.C, 5.B, 4.A, 3.C, 3.D, 4.C, 5.H, 5.A, 3.A, 5.J] · next-wave=[soon]
- **Empty state**: —
- **Console errors**: 0
- **Severity**: HIGH
- **Issues**: 
  - stage label leak: 5.F, 5.E, 5.D, 5.C, 5.B, 4.A, 3.C, 3.D, 4.C, 5.H, 5.A, 3.A, 5.J
  - next-wave badge: soon
  - add but no edit/delete affordance
- **Screenshot**: `tmp/stage-10-screenshots/_development-os_inbox_templates.jpeg`

---

### `/development-os/integrations`

- **Status**: BROKEN · HTTP 500 · 1.7s
- **Title**: (none)
- **CRUD**: add=0 edit=0 delete=0
- **UX leaks**: none
- **Empty state**: —
- **Console errors**: 1 · Failed to load resource: the server responded with a status of 500 ()
- **Severity**: BLOCKER
- **Issues**: 
  - 500 server error
- **Screenshot**: `tmp/stage-10-screenshots/_development-os_integrations.jpeg`

---

### `/development-os/notifications`

- **Status**: MISSING · HTTP 404 · 0.8s
- **Title**: Arconique Management OS
- **CRUD**: add=0 edit=0 delete=0
- **UX leaks**: none
- **Empty state**: —
- **Console errors**: 1 · Failed to load resource: the server responded with a status of 404 ()
- **Severity**: BLOCKER
- **Issues**: 
  - 404 not found
- **Screenshot**: `tmp/stage-10-screenshots/_development-os_notifications.jpeg`

