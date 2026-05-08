# Operations — development-os

**Pages audited**: 12
**Verdicts**: USABLE=9 · EMPTY-LEAKY=2 · MISSING=1
**Severity counts**: BLOCKER=1 · HIGH=5 · MEDIUM=6 · LOW=0 · OK=0

---

## Issues by severity


**[BLOCKER]** `/development-os/procurement/quotation-comparison` — 404 not found

**[HIGH]** `/development-os/channels` — stage label leak: 5.F, 5.E, 5.D, 5.C, 5.B, 4.A, 3.C, 3.D, 4.C, 5.H, 5.A, 3.A, 5.J; next-wave badge: soon; add but no edit/delete affordance

**[HIGH]** `/development-os/materials` — developer leak: npm run db:seed:dev-os, db:seed; stage label leak: 5.F, 5.E, 5.D, 5.C, 5.B, 4.A, 3.C, 3.D, 4.C, 5.H, 5.A, 3.A, 5.J; next-wave badge: soon; add but no edit/delete affordance; add navigates to page (should be modal)

**[HIGH]** `/development-os/procurement` — stage label leak: 5.F, 5.E, 5.D, 5.C, 5.B, 4.A, 3.C, 3.D, 4.C, 5.H, 5.A, 3.A, 5.J; next-wave badge: soon; add but no edit/delete affordance; add navigates to page (should be modal)

**[HIGH]** `/development-os/procurement/purchase-requests` — stage label leak: 5.F, 5.E, 5.D, 5.C, 5.B, 4.A, 3.C, 3.D, 4.C, 5.H, 5.A, 3.A, 5.J; next-wave badge: soon; add but no edit/delete affordance; add navigates to page (should be modal)

**[HIGH]** `/development-os/safety` — developer leak: npm run db:seed:dev-os, db:seed; stage label leak: 5.F, 5.E, 5.D, 5.C, 5.B, 4.A, 3.C, 3.D, 4.C, 5.H, 5.A, 3.A, 5.J; next-wave badge: soon; add but no edit/delete affordance; add navigates to page (should be modal)

**[MEDIUM]** `/development-os/channels/calendar` — stage label leak: 5.F, 5.E, 5.D, 5.C, 5.B, 4.A, 3.C, 3.D, 4.C, 5.H, 5.A, 3.A, 5.J; next-wave badge: soon

**[MEDIUM]** `/development-os/channels/conflicts` — stage label leak: 5.F, 5.E, 5.D, 5.C, 5.B, 4.A, 3.C, 3.D, 4.C, 5.H, 5.A, 3.A, 5.J; next-wave badge: soon

**[MEDIUM]** `/development-os/channels/inbox` — stage label leak: 5.F, 5.E, 5.D, 5.C, 5.B, 4.A, 3.C, 3.D, 4.C, 5.H, 5.A, 3.A, 5.J; next-wave badge: soon

**[MEDIUM]** `/development-os/materials/deliveries` — stage label leak: 5.F, 5.E, 5.D, 5.C, 5.B, 4.A, 3.C, 3.D, 4.C, 5.H, 5.A, 3.A, 5.J; next-wave badge: soon

**[MEDIUM]** `/development-os/materials/new` — stage label leak: 5.F, 5.E, 5.D, 5.C, 5.B, 4.A, 3.C, 3.D, 4.C, 5.H, 5.A, 3.A, 5.J; next-wave badge: soon

**[MEDIUM]** `/development-os/procurement/quotations` — stage label leak: 5.F, 5.E, 5.D, 5.C, 5.B, 4.A, 3.C, 3.D, 4.C, 5.H, 5.A, 3.A, 5.J; next-wave badge: soon

---

## Per-page detail

### `/development-os/channels`

- **Status**: USABLE · HTTP 200 · 4.3s
- **Title**: Channels · Development OS · Arconique Management OS
- **CRUD**: add=1 (?) edit=0 delete=0
- **UX leaks**: stage-labels=[5.F, 5.E, 5.D, 5.C, 5.B, 4.A, 3.C, 3.D, 4.C, 5.H, 5.A, 3.A, 5.J] · next-wave=[soon]
- **Empty state**: —
- **Console errors**: 0
- **Severity**: HIGH
- **Issues**: 
  - stage label leak: 5.F, 5.E, 5.D, 5.C, 5.B, 4.A, 3.C, 3.D, 4.C, 5.H, 5.A, 3.A, 5.J
  - next-wave badge: soon
  - add but no edit/delete affordance
- **Screenshot**: `tmp/stage-10-screenshots/_development-os_channels.jpeg`

---

### `/development-os/channels/calendar`

- **Status**: USABLE · HTTP 200 · 2.6s
- **Title**: Cross-channel calendar · Channels · Arconique Management OS
- **CRUD**: add=0 edit=0 delete=0
- **UX leaks**: stage-labels=[5.F, 5.E, 5.D, 5.C, 5.B, 4.A, 3.C, 3.D, 4.C, 5.H, 5.A, 3.A, 5.J] · next-wave=[soon]
- **Empty state**: —
- **Console errors**: 0
- **Severity**: MEDIUM
- **Issues**: 
  - stage label leak: 5.F, 5.E, 5.D, 5.C, 5.B, 4.A, 3.C, 3.D, 4.C, 5.H, 5.A, 3.A, 5.J
  - next-wave badge: soon
- **Screenshot**: `tmp/stage-10-screenshots/_development-os_channels_calendar.jpeg`

---

### `/development-os/channels/conflicts`

- **Status**: USABLE · HTTP 200 · 2.3s
- **Title**: Channel conflicts · Channels · Arconique Management OS
- **CRUD**: add=0 edit=0 delete=0
- **UX leaks**: stage-labels=[5.F, 5.E, 5.D, 5.C, 5.B, 4.A, 3.C, 3.D, 4.C, 5.H, 5.A, 3.A, 5.J] · next-wave=[soon]
- **Empty state**: —
- **Console errors**: 0
- **Severity**: MEDIUM
- **Issues**: 
  - stage label leak: 5.F, 5.E, 5.D, 5.C, 5.B, 4.A, 3.C, 3.D, 4.C, 5.H, 5.A, 3.A, 5.J
  - next-wave badge: soon
- **Screenshot**: `tmp/stage-10-screenshots/_development-os_channels_conflicts.jpeg`

---

### `/development-os/channels/inbox`

- **Status**: USABLE · HTTP 200 · 2.3s
- **Title**: Channel inbox · Channels · Arconique Management OS
- **CRUD**: add=0 edit=0 delete=0
- **UX leaks**: stage-labels=[5.F, 5.E, 5.D, 5.C, 5.B, 4.A, 3.C, 3.D, 4.C, 5.H, 5.A, 3.A, 5.J] · next-wave=[soon]
- **Empty state**: —
- **Console errors**: 0
- **Severity**: MEDIUM
- **Issues**: 
  - stage label leak: 5.F, 5.E, 5.D, 5.C, 5.B, 4.A, 3.C, 3.D, 4.C, 5.H, 5.A, 3.A, 5.J
  - next-wave badge: soon
- **Screenshot**: `tmp/stage-10-screenshots/_development-os_channels_inbox.jpeg`

---

### `/development-os/materials`

- **Status**: EMPTY-LEAKY · HTTP 200 · 2.1s
- **Title**: Materials · Development OS · Arconique Management OS
- **CRUD**: add=1 (page) edit=0 delete=0
- **UX leaks**: stage-labels=[5.F, 5.E, 5.D, 5.C, 5.B, 4.A, 3.C, 3.D, 4.C, 5.H, 5.A, 3.A, 5.J] · dev-leaks=[npm run db:seed:dev-os | db:seed] · next-wave=[soon]
- **Empty state**: —
- **Console errors**: 0
- **Severity**: HIGH
- **Issues**: 
  - developer leak: npm run db:seed:dev-os, db:seed
  - stage label leak: 5.F, 5.E, 5.D, 5.C, 5.B, 4.A, 3.C, 3.D, 4.C, 5.H, 5.A, 3.A, 5.J
  - next-wave badge: soon
  - add but no edit/delete affordance
  - add navigates to page (should be modal)
- **Screenshot**: `tmp/stage-10-screenshots/_development-os_materials.jpeg`

---

### `/development-os/materials/deliveries`

- **Status**: USABLE · HTTP 200 · 2.0s
- **Title**: Deliveries · Development OS · Arconique Management OS
- **CRUD**: add=0 edit=0 delete=0
- **UX leaks**: stage-labels=[5.F, 5.E, 5.D, 5.C, 5.B, 4.A, 3.C, 3.D, 4.C, 5.H, 5.A, 3.A, 5.J] · next-wave=[soon]
- **Empty state**: —
- **Console errors**: 0
- **Severity**: MEDIUM
- **Issues**: 
  - stage label leak: 5.F, 5.E, 5.D, 5.C, 5.B, 4.A, 3.C, 3.D, 4.C, 5.H, 5.A, 3.A, 5.J
  - next-wave badge: soon
- **Screenshot**: `tmp/stage-10-screenshots/_development-os_materials_deliveries.jpeg`

---

### `/development-os/materials/new`

- **Status**: USABLE · HTTP 200 · 2.4s
- **Title**: New PO · Development OS · Arconique Management OS
- **CRUD**: add=1 (?) edit=0 delete=0
- **UX leaks**: stage-labels=[5.F, 5.E, 5.D, 5.C, 5.B, 4.A, 3.C, 3.D, 4.C, 5.H, 5.A, 3.A, 5.J] · next-wave=[soon]
- **Empty state**: —
- **Console errors**: 0
- **Severity**: MEDIUM
- **Issues**: 
  - stage label leak: 5.F, 5.E, 5.D, 5.C, 5.B, 4.A, 3.C, 3.D, 4.C, 5.H, 5.A, 3.A, 5.J
  - next-wave badge: soon
- **Screenshot**: `tmp/stage-10-screenshots/_development-os_materials_new.jpeg`

---

### `/development-os/procurement`

- **Status**: USABLE · HTTP 200 · 3.5s
- **Title**: Purchase requests · Development OS · Arconique Management OS
- **CRUD**: add=1 (page) edit=0 delete=0
- **UX leaks**: stage-labels=[5.F, 5.E, 5.D, 5.C, 5.B, 4.A, 3.C, 3.D, 4.C, 5.H, 5.A, 3.A, 5.J] · next-wave=[soon]
- **Empty state**: —
- **Console errors**: 0
- **Severity**: HIGH
- **Issues**: 
  - stage label leak: 5.F, 5.E, 5.D, 5.C, 5.B, 4.A, 3.C, 3.D, 4.C, 5.H, 5.A, 3.A, 5.J
  - next-wave badge: soon
  - add but no edit/delete affordance
  - add navigates to page (should be modal)
- **Screenshot**: `tmp/stage-10-screenshots/_development-os_procurement.jpeg`

---

### `/development-os/procurement/purchase-requests`

- **Status**: USABLE · HTTP 200 · 2.5s
- **Title**: Purchase requests · Development OS · Arconique Management OS
- **CRUD**: add=1 (page) edit=0 delete=0
- **UX leaks**: stage-labels=[5.F, 5.E, 5.D, 5.C, 5.B, 4.A, 3.C, 3.D, 4.C, 5.H, 5.A, 3.A, 5.J] · next-wave=[soon]
- **Empty state**: —
- **Console errors**: 0
- **Severity**: HIGH
- **Issues**: 
  - stage label leak: 5.F, 5.E, 5.D, 5.C, 5.B, 4.A, 3.C, 3.D, 4.C, 5.H, 5.A, 3.A, 5.J
  - next-wave badge: soon
  - add but no edit/delete affordance
  - add navigates to page (should be modal)
- **Screenshot**: `tmp/stage-10-screenshots/_development-os_procurement_purchase-requests.jpeg`

---

### `/development-os/procurement/quotation-comparison`

- **Status**: MISSING · HTTP 404 · 1.0s
- **Title**: Arconique Management OS
- **CRUD**: add=0 edit=0 delete=0
- **UX leaks**: none
- **Empty state**: —
- **Console errors**: 1 · Failed to load resource: the server responded with a status of 404 ()
- **Severity**: BLOCKER
- **Issues**: 
  - 404 not found
- **Screenshot**: `tmp/stage-10-screenshots/_development-os_procurement_quotation-comparison.jpeg`

---

### `/development-os/procurement/quotations`

- **Status**: USABLE · HTTP 200 · 2.4s
- **Title**: Quotations · Development OS · Arconique Management OS
- **CRUD**: add=0 edit=0 delete=0
- **UX leaks**: stage-labels=[5.F, 5.E, 5.D, 5.C, 5.B, 4.A, 3.C, 3.D, 4.C, 5.H, 5.A, 3.A, 5.J] · next-wave=[soon]
- **Empty state**: —
- **Console errors**: 0
- **Severity**: MEDIUM
- **Issues**: 
  - stage label leak: 5.F, 5.E, 5.D, 5.C, 5.B, 4.A, 3.C, 3.D, 4.C, 5.H, 5.A, 3.A, 5.J
  - next-wave badge: soon
- **Screenshot**: `tmp/stage-10-screenshots/_development-os_procurement_quotations.jpeg`

---

### `/development-os/safety`

- **Status**: EMPTY-LEAKY · HTTP 200 · 2.1s
- **Title**: Safety · Development OS · Arconique Management OS
- **CRUD**: add=1 (page) edit=0 delete=0
- **UX leaks**: stage-labels=[5.F, 5.E, 5.D, 5.C, 5.B, 4.A, 3.C, 3.D, 4.C, 5.H, 5.A, 3.A, 5.J] · dev-leaks=[npm run db:seed:dev-os | db:seed] · next-wave=[soon]
- **Empty state**: —
- **Console errors**: 0
- **Severity**: HIGH
- **Issues**: 
  - developer leak: npm run db:seed:dev-os, db:seed
  - stage label leak: 5.F, 5.E, 5.D, 5.C, 5.B, 4.A, 3.C, 3.D, 4.C, 5.H, 5.A, 3.A, 5.J
  - next-wave badge: soon
  - add but no edit/delete affordance
  - add navigates to page (should be modal)
- **Screenshot**: `tmp/stage-10-screenshots/_development-os_safety.jpeg`

