# Sales & buyers — development-os

**Pages audited**: 7
**Verdicts**: USABLE=7
**Severity counts**: BLOCKER=0 · HIGH=3 · MEDIUM=4 · LOW=0 · OK=0

---

## Issues by severity


**[HIGH]** `/development-os/buyers` — stage label leak: 5.F, 5.E, 5.D, 5.C, 5.B, 4.A, 3.C, 3.D, 4.C, 5.H, 5.A, 3.A, 5.J; next-wave badge: soon; add but no edit/delete affordance

**[HIGH]** `/development-os/reservations` — stage label leak: 5.F, 5.E, 5.D, 5.C, 5.B, 4.A, 3.C, 3.D, 4.C, 5.H, 5.A, 3.A, 5.J; next-wave badge: soon; SOON; add but no edit/delete affordance

**[HIGH]** `/development-os/sales` — stage label leak: 5.F, 5.E, 5.D, 5.C, 5.B, 4.A, 3.C, 3.D, 4.C, 5.H, 5.A, 3.A, 5.J, 2.A; next-wave badge: soon; add but no edit/delete affordance

**[MEDIUM]** `/development-os/contracts` — stage label leak: 5.F, 5.E, 5.D, 5.C, 5.B, 4.A, 3.C, 3.D, 4.C, 5.H, 5.A, 3.A, 5.J; next-wave badge: soon

**[MEDIUM]** `/development-os/discounts` — stage label leak: 5.F, 5.E, 5.D, 5.C, 5.B, 4.A, 3.C, 3.D, 4.C, 5.H, 5.A, 3.A, 5.J, 2.B; next-wave badge: soon

**[MEDIUM]** `/development-os/invoices` — stage label leak: 5.F, 5.E, 5.D, 5.C, 5.B, 4.A, 3.C, 3.D, 4.C, 5.H, 5.A, 3.A, 5.J; next-wave badge: soon

**[MEDIUM]** `/development-os/residual-inventory` — stage label leak: 5.F, 5.E, 5.D, 5.C, 5.B, 4.A, 3.C, 3.D, 4.C, 5.H, 5.A, 3.A, 5.J; next-wave badge: soon

---

## Per-page detail

### `/development-os/buyers`

- **Status**: USABLE · HTTP 200 · 2.5s
- **Title**: Buyers · Development OS · Arconique Management OS
- **CRUD**: add=1 (?) edit=0 delete=0
- **UX leaks**: stage-labels=[5.F, 5.E, 5.D, 5.C, 5.B, 4.A, 3.C, 3.D, 4.C, 5.H, 5.A, 3.A, 5.J] · next-wave=[soon]
- **Empty state**: —
- **Console errors**: 0
- **Severity**: HIGH
- **Issues**: 
  - stage label leak: 5.F, 5.E, 5.D, 5.C, 5.B, 4.A, 3.C, 3.D, 4.C, 5.H, 5.A, 3.A, 5.J
  - next-wave badge: soon
  - add but no edit/delete affordance
- **Screenshot**: `tmp/stage-10-screenshots/_development-os_buyers.jpeg`

---

### `/development-os/contracts`

- **Status**: USABLE · HTTP 200 · 2.5s
- **Title**: Contracts · Development OS · Arconique Management OS
- **CRUD**: add=0 edit=0 delete=0
- **UX leaks**: stage-labels=[5.F, 5.E, 5.D, 5.C, 5.B, 4.A, 3.C, 3.D, 4.C, 5.H, 5.A, 3.A, 5.J] · next-wave=[soon]
- **Empty state**: —
- **Console errors**: 0
- **Severity**: MEDIUM
- **Issues**: 
  - stage label leak: 5.F, 5.E, 5.D, 5.C, 5.B, 4.A, 3.C, 3.D, 4.C, 5.H, 5.A, 3.A, 5.J
  - next-wave badge: soon
- **Screenshot**: `tmp/stage-10-screenshots/_development-os_contracts.jpeg`

---

### `/development-os/discounts`

- **Status**: USABLE · HTTP 200 · 2.3s
- **Title**: Discounts · Development OS · Arconique Management OS
- **CRUD**: add=0 edit=0 delete=0
- **UX leaks**: stage-labels=[5.F, 5.E, 5.D, 5.C, 5.B, 4.A, 3.C, 3.D, 4.C, 5.H, 5.A, 3.A, 5.J, 2.B] · next-wave=[soon]
- **Empty state**: —
- **Console errors**: 0
- **Severity**: MEDIUM
- **Issues**: 
  - stage label leak: 5.F, 5.E, 5.D, 5.C, 5.B, 4.A, 3.C, 3.D, 4.C, 5.H, 5.A, 3.A, 5.J, 2.B
  - next-wave badge: soon
- **Screenshot**: `tmp/stage-10-screenshots/_development-os_discounts.jpeg`

---

### `/development-os/invoices`

- **Status**: USABLE · HTTP 200 · 2.2s
- **Title**: Invoices · Development OS · Arconique Management OS
- **CRUD**: add=0 edit=0 delete=0
- **UX leaks**: stage-labels=[5.F, 5.E, 5.D, 5.C, 5.B, 4.A, 3.C, 3.D, 4.C, 5.H, 5.A, 3.A, 5.J] · next-wave=[soon]
- **Empty state**: —
- **Console errors**: 0
- **Severity**: MEDIUM
- **Issues**: 
  - stage label leak: 5.F, 5.E, 5.D, 5.C, 5.B, 4.A, 3.C, 3.D, 4.C, 5.H, 5.A, 3.A, 5.J
  - next-wave badge: soon
- **Screenshot**: `tmp/stage-10-screenshots/_development-os_invoices.jpeg`

---

### `/development-os/reservations`

- **Status**: USABLE · HTTP 200 · 4.0s
- **Title**: Reservations · Development OS · Arconique Management OS
- **CRUD**: add=1 (?) edit=0 delete=0
- **UX leaks**: stage-labels=[5.F, 5.E, 5.D, 5.C, 5.B, 4.A, 3.C, 3.D, 4.C, 5.H, 5.A, 3.A, 5.J] · next-wave=[soon | SOON]
- **Empty state**: —
- **Console errors**: 0
- **Severity**: HIGH
- **Issues**: 
  - stage label leak: 5.F, 5.E, 5.D, 5.C, 5.B, 4.A, 3.C, 3.D, 4.C, 5.H, 5.A, 3.A, 5.J
  - next-wave badge: soon; SOON
  - add but no edit/delete affordance
- **Screenshot**: `tmp/stage-10-screenshots/_development-os_reservations.jpeg`

---

### `/development-os/residual-inventory`

- **Status**: USABLE · HTTP 200 · 2.4s
- **Title**: Residual inventory · Development OS · Arconique Management OS
- **CRUD**: add=0 edit=0 delete=0
- **UX leaks**: stage-labels=[5.F, 5.E, 5.D, 5.C, 5.B, 4.A, 3.C, 3.D, 4.C, 5.H, 5.A, 3.A, 5.J] · next-wave=[soon]
- **Empty state**: —
- **Console errors**: 0
- **Severity**: MEDIUM
- **Issues**: 
  - stage label leak: 5.F, 5.E, 5.D, 5.C, 5.B, 4.A, 3.C, 3.D, 4.C, 5.H, 5.A, 3.A, 5.J
  - next-wave badge: soon
- **Screenshot**: `tmp/stage-10-screenshots/_development-os_residual-inventory.jpeg`

---

### `/development-os/sales`

- **Status**: USABLE · HTTP 200 · 6.5s
- **Title**: Sales · Development OS · Arconique Management OS
- **CRUD**: add=2 (?) edit=0 delete=0
- **UX leaks**: stage-labels=[5.F, 5.E, 5.D, 5.C, 5.B, 4.A, 3.C, 3.D, 4.C, 5.H, 5.A, 3.A, 5.J, 2.A] · next-wave=[soon]
- **Empty state**: "Live pipeline backed by the contacts foundation. Drag-and-drop is intentionally not enabled in 2.2.A — status changes fl" · has CTA
- **Console errors**: 0
- **Severity**: HIGH
- **Issues**: 
  - stage label leak: 5.F, 5.E, 5.D, 5.C, 5.B, 4.A, 3.C, 3.D, 4.C, 5.H, 5.A, 3.A, 5.J, 2.A
  - next-wave badge: soon
  - add but no edit/delete affordance
- **Screenshot**: `tmp/stage-10-screenshots/_development-os_sales.jpeg`

