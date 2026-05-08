# Inventory — management-os

**Pages audited**: 8
**Verdicts**: USABLE=6 · EMPTY-OK=1 · MISSING=1
**Severity counts**: BLOCKER=1 · HIGH=5 · MEDIUM=0 · LOW=0 · OK=2

---

## Issues by severity


**[BLOCKER]** `/dashboard/inventory/stock-by-location` — 404 not found

**[HIGH]** `/dashboard/inventory` — add but no edit/delete affordance; add navigates to page (should be modal)

**[HIGH]** `/dashboard/inventory/items` — add but no edit/delete affordance; add navigates to page (should be modal)

**[HIGH]** `/dashboard/inventory/locations` — add but no edit/delete affordance; add navigates to page (should be modal)

**[HIGH]** `/dashboard/inventory/movements` — add but no edit/delete affordance; add navigates to page (should be modal)

**[HIGH]** `/dashboard/inventory/suppliers` — add but no edit/delete affordance; add navigates to page (should be modal)

---

## Per-page detail

### `/dashboard/inventory`

- **Status**: USABLE · HTTP 200 · 4.8s
- **Title**: Inventory · Arconique Management OS
- **CRUD**: add=1 (page) edit=0 delete=0
- **UX leaks**: none
- **Empty state**: —
- **Console errors**: 0
- **Severity**: HIGH
- **Issues**: 
  - add but no edit/delete affordance
  - add navigates to page (should be modal)
- **Screenshot**: `tmp/stage-10-screenshots/_dashboard_inventory.jpeg`

---

### `/dashboard/inventory/categories`

- **Status**: USABLE · HTTP 200 · 4.1s
- **Title**: Inventory · Categories · Arconique Management OS
- **CRUD**: add=0 edit=0 delete=0
- **UX leaks**: none
- **Empty state**: —
- **Console errors**: 0
- **Severity**: OK
- **Screenshot**: `tmp/stage-10-screenshots/_dashboard_inventory_categories.jpeg`

---

### `/dashboard/inventory/counts`

- **Status**: EMPTY-OK · HTTP 200 · 3.8s
- **Title**: Inventory counts · Arconique Management OS
- **CRUD**: add=0 edit=0 delete=0
- **UX leaks**: none
- **Empty state**: "No counts on record yet." · no CTA
- **Console errors**: 0
- **Severity**: OK
- **Screenshot**: `tmp/stage-10-screenshots/_dashboard_inventory_counts.jpeg`

---

### `/dashboard/inventory/items`

- **Status**: USABLE · HTTP 200 · 2.9s
- **Title**: Inventory · Items · Arconique Management OS
- **CRUD**: add=1 (page) edit=0 delete=0
- **UX leaks**: none
- **Empty state**: —
- **Console errors**: 0
- **Severity**: HIGH
- **Issues**: 
  - add but no edit/delete affordance
  - add navigates to page (should be modal)
- **Screenshot**: `tmp/stage-10-screenshots/_dashboard_inventory_items.jpeg`

---

### `/dashboard/inventory/locations`

- **Status**: USABLE · HTTP 200 · 4.9s
- **Title**: Inventory · Locations · Arconique Management OS
- **CRUD**: add=1 (page) edit=0 delete=0
- **UX leaks**: none
- **Empty state**: —
- **Console errors**: 0
- **Severity**: HIGH
- **Issues**: 
  - add but no edit/delete affordance
  - add navigates to page (should be modal)
- **Screenshot**: `tmp/stage-10-screenshots/_dashboard_inventory_locations.jpeg`

---

### `/dashboard/inventory/movements`

- **Status**: USABLE · HTTP 200 · 5.1s
- **Title**: Inventory · Movements · Arconique Management OS
- **CRUD**: add=1 (page) edit=0 delete=0
- **UX leaks**: none
- **Empty state**: —
- **Console errors**: 0
- **Severity**: HIGH
- **Issues**: 
  - add but no edit/delete affordance
  - add navigates to page (should be modal)
- **Screenshot**: `tmp/stage-10-screenshots/_dashboard_inventory_movements.jpeg`

---

### `/dashboard/inventory/stock-by-location`

- **Status**: MISSING · HTTP 404 · 0.8s
- **Title**: Arconique Management OS
- **CRUD**: add=0 edit=0 delete=0
- **UX leaks**: none
- **Empty state**: —
- **Console errors**: 1 · Failed to load resource: the server responded with a status of 404 ()
- **Severity**: BLOCKER
- **Issues**: 
  - 404 not found
- **Screenshot**: `tmp/stage-10-screenshots/_dashboard_inventory_stock-by-location.jpeg`

---

### `/dashboard/inventory/suppliers`

- **Status**: USABLE · HTTP 200 · 3.9s
- **Title**: Suppliers · Arconique Management OS
- **CRUD**: add=1 (page) edit=0 delete=0
- **UX leaks**: none
- **Empty state**: —
- **Console errors**: 0
- **Severity**: HIGH
- **Issues**: 
  - add but no edit/delete affordance
  - add navigates to page (should be modal)
- **Screenshot**: `tmp/stage-10-screenshots/_dashboard_inventory_suppliers.jpeg`

