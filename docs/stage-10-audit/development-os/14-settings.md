# Settings — development-os

**Pages audited**: 9
**Verdicts**: USABLE=7 · EMPTY-OK=2
**Severity counts**: BLOCKER=0 · HIGH=3 · MEDIUM=6 · LOW=0 · OK=0

---

## Issues by severity


**[HIGH]** `/development-os/bulk-import/jobs` — stage label leak: 5.F, 5.E, 5.D, 5.C, 5.B, 4.A, 3.C, 3.D, 4.C, 5.H, 5.A, 3.A, 5.J; next-wave badge: soon; add but no edit/delete affordance

**[HIGH]** `/development-os/inventory` — stage label leak: 5.F, 5.E, 5.D, 5.C, 5.B, 4.A, 3.C, 3.D, 4.C, 5.H, 5.A, 3.A, 5.J; next-wave badge: soon; add but no edit/delete affordance; add navigates to page (should be modal)

**[HIGH]** `/development-os/inventory/items` — stage label leak: 5.F, 5.E, 5.D, 5.C, 5.B, 4.A, 3.C, 3.D, 4.C, 5.H, 5.A, 3.A, 5.J; next-wave badge: soon; add but no edit/delete affordance; add navigates to page (should be modal)

**[MEDIUM]** `/development-os/bulk-import` — stage label leak: 5.F, 5.E, 5.D, 5.C, 5.B, 4.A, 3.C, 3.D, 4.C, 5.H, 5.A, 3.A, 5.J; next-wave badge: soon

**[MEDIUM]** `/development-os/inventory/locations` — stage label leak: 5.F, 5.E, 5.D, 5.C, 5.B, 4.A, 3.C, 3.D, 4.C, 5.H, 5.A, 3.A, 5.J; next-wave badge: soon

**[MEDIUM]** `/development-os/inventory/movements` — stage label leak: 5.F, 5.E, 5.D, 5.C, 5.B, 4.A, 3.C, 3.D, 4.C, 5.H, 5.A, 3.A, 5.J; next-wave badge: soon

**[MEDIUM]** `/development-os/inventory/stocktake` — stage label leak: 5.F, 5.E, 5.D, 5.C, 5.B, 4.A, 3.C, 3.D, 4.C, 5.H, 5.A, 3.A, 5.J; next-wave badge: soon

**[MEDIUM]** `/development-os/settings` — stage label leak: 5.F, 5.E, 5.D, 5.C, 5.B, 4.A, 3.C, 3.D, 4.C, 5.H, 5.A, 3.A, 5.J; next-wave badge: soon

**[MEDIUM]** `/development-os/settings/ai-usage` — stage label leak: 5.F, 5.E, 5.D, 5.C, 5.B, 4.A, 3.C, 3.D, 4.C, 5.H, 5.A, 3.A, 5.J; next-wave badge: soon

---

## Per-page detail

### `/development-os/bulk-import`

- **Status**: USABLE · HTTP 200 · 2.2s
- **Title**: Bulk import · Development OS · Arconique Management OS
- **CRUD**: add=0 edit=0 delete=0
- **UX leaks**: stage-labels=[5.F, 5.E, 5.D, 5.C, 5.B, 4.A, 3.C, 3.D, 4.C, 5.H, 5.A, 3.A, 5.J] · next-wave=[soon]
- **Empty state**: —
- **Console errors**: 0
- **Severity**: MEDIUM
- **Issues**: 
  - stage label leak: 5.F, 5.E, 5.D, 5.C, 5.B, 4.A, 3.C, 3.D, 4.C, 5.H, 5.A, 3.A, 5.J
  - next-wave badge: soon
- **Screenshot**: `tmp/stage-10-screenshots/_development-os_bulk-import.jpeg`

---

### `/development-os/bulk-import/jobs`

- **Status**: USABLE · HTTP 200 · 5.2s
- **Title**: Bulk import jobs · Development OS · Arconique Management OS
- **CRUD**: add=1 (?) edit=0 delete=0
- **UX leaks**: stage-labels=[5.F, 5.E, 5.D, 5.C, 5.B, 4.A, 3.C, 3.D, 4.C, 5.H, 5.A, 3.A, 5.J] · next-wave=[soon]
- **Empty state**: —
- **Console errors**: 0
- **Severity**: HIGH
- **Issues**: 
  - stage label leak: 5.F, 5.E, 5.D, 5.C, 5.B, 4.A, 3.C, 3.D, 4.C, 5.H, 5.A, 3.A, 5.J
  - next-wave badge: soon
  - add but no edit/delete affordance
- **Screenshot**: `tmp/stage-10-screenshots/_development-os_bulk-import_jobs.jpeg`

---

### `/development-os/inventory`

- **Status**: USABLE · HTTP 200 · 3.2s
- **Title**: Inventory items · Development OS · Arconique Management OS
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
- **Screenshot**: `tmp/stage-10-screenshots/_development-os_inventory.jpeg`

---

### `/development-os/inventory/items`

- **Status**: USABLE · HTTP 200 · 2.3s
- **Title**: Inventory items · Development OS · Arconique Management OS
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
- **Screenshot**: `tmp/stage-10-screenshots/_development-os_inventory_items.jpeg`

---

### `/development-os/inventory/locations`

- **Status**: USABLE · HTTP 200 · 2.4s
- **Title**: Inventory locations · Development OS · Arconique Management OS
- **CRUD**: add=0 edit=0 delete=0
- **UX leaks**: stage-labels=[5.F, 5.E, 5.D, 5.C, 5.B, 4.A, 3.C, 3.D, 4.C, 5.H, 5.A, 3.A, 5.J] · next-wave=[soon]
- **Empty state**: —
- **Console errors**: 0
- **Severity**: MEDIUM
- **Issues**: 
  - stage label leak: 5.F, 5.E, 5.D, 5.C, 5.B, 4.A, 3.C, 3.D, 4.C, 5.H, 5.A, 3.A, 5.J
  - next-wave badge: soon
- **Screenshot**: `tmp/stage-10-screenshots/_development-os_inventory_locations.jpeg`

---

### `/development-os/inventory/movements`

- **Status**: USABLE · HTTP 200 · 3.0s
- **Title**: Movements · Development OS · Arconique Management OS
- **CRUD**: add=0 edit=0 delete=0
- **UX leaks**: stage-labels=[5.F, 5.E, 5.D, 5.C, 5.B, 4.A, 3.C, 3.D, 4.C, 5.H, 5.A, 3.A, 5.J] · next-wave=[soon]
- **Empty state**: —
- **Console errors**: 0
- **Severity**: MEDIUM
- **Issues**: 
  - stage label leak: 5.F, 5.E, 5.D, 5.C, 5.B, 4.A, 3.C, 3.D, 4.C, 5.H, 5.A, 3.A, 5.J
  - next-wave badge: soon
- **Screenshot**: `tmp/stage-10-screenshots/_development-os_inventory_movements.jpeg`

---

### `/development-os/inventory/stocktake`

- **Status**: EMPTY-OK · HTTP 200 · 4.0s
- **Title**: Stocktake · Development OS · Arconique Management OS
- **CRUD**: add=0 edit=0 delete=0
- **UX leaks**: stage-labels=[5.F, 5.E, 5.D, 5.C, 5.B, 4.A, 3.C, 3.D, 4.C, 5.H, 5.A, 3.A, 5.J] · next-wave=[soon]
- **Empty state**: "Items at or below their reorder point. Daily cron `dev_os_inventory_low_stock_alert` notifies procurement when these gro" · no CTA
- **Console errors**: 0
- **Severity**: MEDIUM
- **Issues**: 
  - stage label leak: 5.F, 5.E, 5.D, 5.C, 5.B, 4.A, 3.C, 3.D, 4.C, 5.H, 5.A, 3.A, 5.J
  - next-wave badge: soon
- **Screenshot**: `tmp/stage-10-screenshots/_development-os_inventory_stocktake.jpeg`

---

### `/development-os/settings`

- **Status**: EMPTY-OK · HTTP 200 · 1.6s
- **Title**: Settings · Development OS · Arconique Management OS
- **CRUD**: add=0 edit=0 delete=0
- **UX leaks**: stage-labels=[5.F, 5.E, 5.D, 5.C, 5.B, 4.A, 3.C, 3.D, 4.C, 5.H, 5.A, 3.A, 5.J] · next-wave=[soon]
- **Empty state**: "Operator-configurable knobs across the Development OS workspace. Each section below opens a dedicated configuration page" · no CTA
- **Console errors**: 0
- **Severity**: MEDIUM
- **Issues**: 
  - stage label leak: 5.F, 5.E, 5.D, 5.C, 5.B, 4.A, 3.C, 3.D, 4.C, 5.H, 5.A, 3.A, 5.J
  - next-wave badge: soon
- **Screenshot**: `tmp/stage-10-screenshots/_development-os_settings.jpeg`

---

### `/development-os/settings/ai-usage`

- **Status**: USABLE · HTTP 200 · 5.2s
- **Title**: AI usage · Development OS · Arconique Management OS
- **CRUD**: add=0 edit=0 delete=0
- **UX leaks**: stage-labels=[5.F, 5.E, 5.D, 5.C, 5.B, 4.A, 3.C, 3.D, 4.C, 5.H, 5.A, 3.A, 5.J] · next-wave=[soon]
- **Empty state**: —
- **Console errors**: 0
- **Severity**: MEDIUM
- **Issues**: 
  - stage label leak: 5.F, 5.E, 5.D, 5.C, 5.B, 4.A, 3.C, 3.D, 4.C, 5.H, 5.A, 3.A, 5.J
  - next-wave badge: soon
- **Screenshot**: `tmp/stage-10-screenshots/_development-os_settings_ai-usage.jpeg`

