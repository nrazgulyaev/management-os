# Procurement — management-os

**Pages audited**: 3
**Verdicts**: USABLE=1 · MISSING=2
**Severity counts**: BLOCKER=2 · HIGH=1 · MEDIUM=0 · LOW=0 · OK=0

---

## Issues by severity


**[BLOCKER]** `/dashboard/procurement/purchase-orders` — 404 not found

**[BLOCKER]** `/dashboard/procurement/purchase-requests` — 404 not found

**[HIGH]** `/dashboard/procurement` — add but no edit/delete affordance; add navigates to page (should be modal)

---

## Per-page detail

### `/dashboard/procurement`

- **Status**: USABLE · HTTP 200 · 2.9s
- **Title**: Procurement · Arconique Management OS
- **CRUD**: add=2 (page) edit=0 delete=0
- **UX leaks**: none
- **Empty state**: —
- **Console errors**: 0
- **Severity**: HIGH
- **Issues**: 
  - add but no edit/delete affordance
  - add navigates to page (should be modal)
- **Screenshot**: `tmp/stage-10-screenshots/_dashboard_procurement.jpeg`

---

### `/dashboard/procurement/purchase-orders`

- **Status**: MISSING · HTTP 404 · 0.8s
- **Title**: Arconique Management OS
- **CRUD**: add=0 edit=0 delete=0
- **UX leaks**: none
- **Empty state**: —
- **Console errors**: 1 · Failed to load resource: the server responded with a status of 404 ()
- **Severity**: BLOCKER
- **Issues**: 
  - 404 not found
- **Screenshot**: `tmp/stage-10-screenshots/_dashboard_procurement_purchase-orders.jpeg`

---

### `/dashboard/procurement/purchase-requests`

- **Status**: MISSING · HTTP 404 · 0.8s
- **Title**: Arconique Management OS
- **CRUD**: add=0 edit=0 delete=0
- **UX leaks**: none
- **Empty state**: —
- **Console errors**: 1 · Failed to load resource: the server responded with a status of 404 ()
- **Severity**: BLOCKER
- **Issues**: 
  - 404 not found
- **Screenshot**: `tmp/stage-10-screenshots/_dashboard_procurement_purchase-requests.jpeg`

