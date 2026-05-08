# Cabinets — development-os

**Pages audited**: 10
**Verdicts**: MISSING=1 · USABLE=8 · EMPTY-OK=1
**Severity counts**: BLOCKER=1 · HIGH=0 · MEDIUM=9 · LOW=0 · OK=0

---

## Issues by severity


**[BLOCKER]** `/development-os/cabinets` — 404 not found

**[MEDIUM]** `/development-os/cabinets/cfo-accountant` — stage label leak: 5.F, 5.E, 5.D, 5.C, 5.B, 4.A, 3.C, 3.D, 4.C, 5.H, 5.A, 3.A, 5.J; next-wave badge: soon

**[MEDIUM]** `/development-os/cabinets/marketing-staff` — stage label leak: 5.F, 5.E, 5.D, 5.C, 5.B, 4.A, 3.C, 3.D, 4.C, 5.H, 5.A, 3.A, 5.J; next-wave badge: soon

**[MEDIUM]** `/development-os/cabinets/my-cabinet` — stage label leak: 5.F, 5.E, 5.D, 5.C, 5.B, 4.A, 3.C, 3.D, 4.C, 5.H, 5.A, 3.A, 5.J; next-wave badge: NEXT WAVE; NOT YET BUILT

**[MEDIUM]** `/development-os/cabinets/procurement-manager` — stage label leak: 5.F, 5.E, 5.D, 5.C, 5.B, 4.A, 3.C, 3.D, 4.C, 5.H, 5.A, 3.A, 5.J; next-wave badge: soon

**[MEDIUM]** `/development-os/cabinets/project-manager` — stage label leak: 5.F, 5.E, 5.D, 5.C, 5.B, 4.A, 3.C, 3.D, 4.C, 5.H, 5.A, 3.A, 5.J; next-wave badge: soon

**[MEDIUM]** `/development-os/cabinets/qs` — stage label leak: 5.F, 5.E, 5.D, 5.C, 5.B, 4.A, 3.C, 3.D, 4.C, 5.H, 5.A, 3.A, 5.J; next-wave badge: soon

**[MEDIUM]** `/development-os/cabinets/sales-manager` — stage label leak: 5.F, 5.E, 5.D, 5.C, 5.B, 4.A, 3.C, 3.D, 4.C, 5.H, 5.A, 3.A, 5.J; next-wave badge: soon

**[MEDIUM]** `/development-os/cabinets/site-supervisor` — stage label leak: 5.F, 5.E, 5.D, 5.C, 5.B, 4.A, 3.C, 3.D, 4.C, 5.H, 5.A, 3.A, 5.J; next-wave badge: soon

**[MEDIUM]** `/development-os/cabinets/warehouse-manager` — stage label leak: 5.F, 5.E, 5.D, 5.C, 5.B, 4.A, 3.C, 3.D, 4.C, 5.H, 5.A, 3.A, 5.J; next-wave badge: soon

---

## Per-page detail

### `/development-os/cabinets`

- **Status**: MISSING · HTTP 404 · 1.5s
- **Title**: Arconique Management OS
- **CRUD**: add=0 edit=0 delete=0
- **UX leaks**: none
- **Empty state**: —
- **Console errors**: 1 · Failed to load resource: the server responded with a status of 404 ()
- **Severity**: BLOCKER
- **Issues**: 
  - 404 not found
- **Screenshot**: `tmp/stage-10-screenshots/_development-os_cabinets.jpeg`

---

### `/development-os/cabinets/cfo-accountant`

- **Status**: USABLE · HTTP 200 · 3.7s
- **Title**: CFO / Accountant · Cabinet · Arconique Management OS
- **CRUD**: add=0 edit=0 delete=0
- **UX leaks**: stage-labels=[5.F, 5.E, 5.D, 5.C, 5.B, 4.A, 3.C, 3.D, 4.C, 5.H, 5.A, 3.A, 5.J] · next-wave=[soon]
- **Empty state**: —
- **Console errors**: 0
- **Severity**: MEDIUM
- **Issues**: 
  - stage label leak: 5.F, 5.E, 5.D, 5.C, 5.B, 4.A, 3.C, 3.D, 4.C, 5.H, 5.A, 3.A, 5.J
  - next-wave badge: soon
- **Screenshot**: `tmp/stage-10-screenshots/_development-os_cabinets_cfo-accountant.jpeg`

---

### `/development-os/cabinets/marketing-staff`

- **Status**: USABLE · HTTP 200 · 4.4s
- **Title**: Marketing staff · Cabinet · Arconique Management OS
- **CRUD**: add=0 edit=0 delete=0
- **UX leaks**: stage-labels=[5.F, 5.E, 5.D, 5.C, 5.B, 4.A, 3.C, 3.D, 4.C, 5.H, 5.A, 3.A, 5.J] · next-wave=[soon]
- **Empty state**: —
- **Console errors**: 0
- **Severity**: MEDIUM
- **Issues**: 
  - stage label leak: 5.F, 5.E, 5.D, 5.C, 5.B, 4.A, 3.C, 3.D, 4.C, 5.H, 5.A, 3.A, 5.J
  - next-wave badge: soon
- **Screenshot**: `tmp/stage-10-screenshots/_development-os_cabinets_marketing-staff.jpeg`

---

### `/development-os/cabinets/my-cabinet`

- **Status**: EMPTY-OK · HTTP 200 · 3.9s
- **Title**: Command center · Development OS · Arconique Management OS
- **CRUD**: add=0 edit=0 delete=0
- **UX leaks**: stage-labels=[5.F, 5.E, 5.D, 5.C, 5.B, 4.A, 3.C, 3.D, 4.C, 5.H, 5.A, 3.A, 5.J] · next-wave=[NEXT WAVE | NOT YET BUILT]
- **Empty state**: "Main risks: MEP procurement delay (Surabaya port, 9 days), buyer payment milestone due in 6 days with no confirmation, a" · no CTA
- **Console errors**: 0
- **Severity**: MEDIUM
- **Issues**: 
  - stage label leak: 5.F, 5.E, 5.D, 5.C, 5.B, 4.A, 3.C, 3.D, 4.C, 5.H, 5.A, 3.A, 5.J
  - next-wave badge: NEXT WAVE; NOT YET BUILT
- **Screenshot**: `tmp/stage-10-screenshots/_development-os_cabinets_my-cabinet.jpeg`

---

### `/development-os/cabinets/procurement-manager`

- **Status**: USABLE · HTTP 200 · 3.0s
- **Title**: Procurement manager · Cabinet · Arconique Management OS
- **CRUD**: add=0 edit=0 delete=0
- **UX leaks**: stage-labels=[5.F, 5.E, 5.D, 5.C, 5.B, 4.A, 3.C, 3.D, 4.C, 5.H, 5.A, 3.A, 5.J] · next-wave=[soon]
- **Empty state**: —
- **Console errors**: 0
- **Severity**: MEDIUM
- **Issues**: 
  - stage label leak: 5.F, 5.E, 5.D, 5.C, 5.B, 4.A, 3.C, 3.D, 4.C, 5.H, 5.A, 3.A, 5.J
  - next-wave badge: soon
- **Screenshot**: `tmp/stage-10-screenshots/_development-os_cabinets_procurement-manager.jpeg`

---

### `/development-os/cabinets/project-manager`

- **Status**: USABLE · HTTP 200 · 4.9s
- **Title**: Project manager · Cabinet · Arconique Management OS
- **CRUD**: add=0 edit=0 delete=0
- **UX leaks**: stage-labels=[5.F, 5.E, 5.D, 5.C, 5.B, 4.A, 3.C, 3.D, 4.C, 5.H, 5.A, 3.A, 5.J] · next-wave=[soon]
- **Empty state**: —
- **Console errors**: 0
- **Severity**: MEDIUM
- **Issues**: 
  - stage label leak: 5.F, 5.E, 5.D, 5.C, 5.B, 4.A, 3.C, 3.D, 4.C, 5.H, 5.A, 3.A, 5.J
  - next-wave badge: soon
- **Screenshot**: `tmp/stage-10-screenshots/_development-os_cabinets_project-manager.jpeg`

---

### `/development-os/cabinets/qs`

- **Status**: USABLE · HTTP 200 · 3.2s
- **Title**: QS / Cost analyst · Cabinet · Arconique Management OS
- **CRUD**: add=0 edit=0 delete=0
- **UX leaks**: stage-labels=[5.F, 5.E, 5.D, 5.C, 5.B, 4.A, 3.C, 3.D, 4.C, 5.H, 5.A, 3.A, 5.J] · next-wave=[soon]
- **Empty state**: —
- **Console errors**: 0
- **Severity**: MEDIUM
- **Issues**: 
  - stage label leak: 5.F, 5.E, 5.D, 5.C, 5.B, 4.A, 3.C, 3.D, 4.C, 5.H, 5.A, 3.A, 5.J
  - next-wave badge: soon
- **Screenshot**: `tmp/stage-10-screenshots/_development-os_cabinets_qs.jpeg`

---

### `/development-os/cabinets/sales-manager`

- **Status**: USABLE · HTTP 200 · 7.1s
- **Title**: Sales manager · Cabinet · Arconique Management OS
- **CRUD**: add=0 edit=0 delete=0
- **UX leaks**: stage-labels=[5.F, 5.E, 5.D, 5.C, 5.B, 4.A, 3.C, 3.D, 4.C, 5.H, 5.A, 3.A, 5.J] · next-wave=[soon]
- **Empty state**: —
- **Console errors**: 0
- **Severity**: MEDIUM
- **Issues**: 
  - stage label leak: 5.F, 5.E, 5.D, 5.C, 5.B, 4.A, 3.C, 3.D, 4.C, 5.H, 5.A, 3.A, 5.J
  - next-wave badge: soon
- **Screenshot**: `tmp/stage-10-screenshots/_development-os_cabinets_sales-manager.jpeg`

---

### `/development-os/cabinets/site-supervisor`

- **Status**: USABLE · HTTP 200 · 7.2s
- **Title**: Site supervisor · Cabinet · Arconique Management OS
- **CRUD**: add=0 edit=0 delete=0
- **UX leaks**: stage-labels=[5.F, 5.E, 5.D, 5.C, 5.B, 4.A, 3.C, 3.D, 4.C, 5.H, 5.A, 3.A, 5.J] · next-wave=[soon]
- **Empty state**: —
- **Console errors**: 0
- **Severity**: MEDIUM
- **Issues**: 
  - stage label leak: 5.F, 5.E, 5.D, 5.C, 5.B, 4.A, 3.C, 3.D, 4.C, 5.H, 5.A, 3.A, 5.J
  - next-wave badge: soon
- **Screenshot**: `tmp/stage-10-screenshots/_development-os_cabinets_site-supervisor.jpeg`

---

### `/development-os/cabinets/warehouse-manager`

- **Status**: USABLE · HTTP 200 · 3.0s
- **Title**: Warehouse manager · Cabinet · Arconique Management OS
- **CRUD**: add=0 edit=0 delete=0
- **UX leaks**: stage-labels=[5.F, 5.E, 5.D, 5.C, 5.B, 4.A, 3.C, 3.D, 4.C, 5.H, 5.A, 3.A, 5.J] · next-wave=[soon]
- **Empty state**: —
- **Console errors**: 0
- **Severity**: MEDIUM
- **Issues**: 
  - stage label leak: 5.F, 5.E, 5.D, 5.C, 5.B, 4.A, 3.C, 3.D, 4.C, 5.H, 5.A, 3.A, 5.J
  - next-wave badge: soon
- **Screenshot**: `tmp/stage-10-screenshots/_development-os_cabinets_warehouse-manager.jpeg`

