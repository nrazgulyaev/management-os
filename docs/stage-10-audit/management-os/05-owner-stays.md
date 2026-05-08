# Owner stays — management-os

**Pages audited**: 5
**Verdicts**: EMPTY-OK=2 · USABLE=3
**Severity counts**: BLOCKER=0 · HIGH=2 · MEDIUM=0 · LOW=0 · OK=3

---

## Issues by severity


**[HIGH]** `/dashboard/owner-stays/equivalence-groups` — add but no edit/delete affordance; add navigates to page (should be modal)

**[HIGH]** `/dashboard/owner-stays/policies` — add but no edit/delete affordance; add navigates to page (should be modal)

---

## Per-page detail

### `/dashboard/owner-stays`

- **Status**: EMPTY-OK · HTTP 200 · 4.1s
- **Title**: Owner stays · Arconique Management OS
- **CRUD**: add=0 edit=0 delete=0
- **UX leaks**: none
- **Empty state**: "Owner-portal requests + admin approval. Approved stays materialise as owner_stay calendar blocks. Owner stays do not cou" · no CTA
- **Console errors**: 0
- **Severity**: OK
- **Screenshot**: `tmp/stage-10-screenshots/_dashboard_owner-stays.jpeg`

---

### `/dashboard/owner-stays/equivalence-groups`

- **Status**: USABLE · HTTP 200 · 3.4s
- **Title**: Equivalence groups · Arconique Management OS
- **CRUD**: add=2 (page) edit=0 delete=0
- **UX leaks**: none
- **Empty state**: —
- **Console errors**: 0
- **Severity**: HIGH
- **Issues**: 
  - add but no edit/delete affordance
  - add navigates to page (should be modal)
- **Screenshot**: `tmp/stage-10-screenshots/_dashboard_owner-stays_equivalence-groups.jpeg`

---

### `/dashboard/owner-stays/finance-bridge`

- **Status**: EMPTY-OK · HTTP 200 · 4.1s
- **Title**: Owner stay finance bridge · Arconique Management OS
- **CRUD**: add=0 edit=0 delete=0
- **UX leaks**: none
- **Empty state**: "None." · no CTA
- **Console errors**: 0
- **Severity**: OK
- **Screenshot**: `tmp/stage-10-screenshots/_dashboard_owner-stays_finance-bridge.jpeg`

---

### `/dashboard/owner-stays/policies`

- **Status**: USABLE · HTTP 200 · 3.6s
- **Title**: Owner stay policies · Arconique Management OS
- **CRUD**: add=1 (page) edit=0 delete=0
- **UX leaks**: none
- **Empty state**: —
- **Console errors**: 0
- **Severity**: HIGH
- **Issues**: 
  - add but no edit/delete affordance
  - add navigates to page (should be modal)
- **Screenshot**: `tmp/stage-10-screenshots/_dashboard_owner-stays_policies.jpeg`

---

### `/dashboard/owner-stays/requests`

- **Status**: USABLE · HTTP 200 · 4.1s
- **Title**: Owner stay requests · Arconique Management OS
- **CRUD**: add=0 edit=0 delete=0
- **UX leaks**: none
- **Empty state**: —
- **Console errors**: 0
- **Severity**: OK
- **Screenshot**: `tmp/stage-10-screenshots/_dashboard_owner-stays_requests.jpeg`

