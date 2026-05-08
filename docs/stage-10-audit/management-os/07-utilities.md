# Utilities — management-os

**Pages audited**: 5
**Verdicts**: USABLE=3 · EMPTY-OK=2
**Severity counts**: BLOCKER=0 · HIGH=1 · MEDIUM=0 · LOW=0 · OK=4

---

## Issues by severity


**[HIGH]** `/dashboard/utilities/accounts` — add but no edit/delete affordance; add navigates to page (should be modal)

---

## Per-page detail

### `/dashboard/utilities`

- **Status**: USABLE · HTTP 200 · 3.5s
- **Title**: Utilities · Arconique Management OS
- **CRUD**: add=0 edit=0 delete=0
- **UX leaks**: none
- **Empty state**: —
- **Console errors**: 0
- **Severity**: OK
- **Screenshot**: `tmp/stage-10-screenshots/_dashboard_utilities.jpeg`

---

### `/dashboard/utilities/accounts`

- **Status**: USABLE · HTTP 200 · 2.9s
- **Title**: Utility accounts · Arconique Management OS
- **CRUD**: add=1 (page) edit=0 delete=0
- **UX leaks**: none
- **Empty state**: —
- **Console errors**: 0
- **Severity**: HIGH
- **Issues**: 
  - add but no edit/delete affordance
  - add navigates to page (should be modal)
- **Screenshot**: `tmp/stage-10-screenshots/_dashboard_utilities_accounts.jpeg`

---

### `/dashboard/utilities/payments`

- **Status**: EMPTY-OK · HTTP 200 · 3.4s
- **Title**: Utility payments · Arconique Management OS
- **CRUD**: add=0 edit=0 delete=0
- **UX leaks**: none
- **Empty state**: "Operator-side payment ledger. Marking a reminder paid optionally creates an expense_line if the period is open; locked p" · no CTA
- **Console errors**: 0
- **Severity**: OK
- **Screenshot**: `tmp/stage-10-screenshots/_dashboard_utilities_payments.jpeg`

---

### `/dashboard/utilities/readings`

- **Status**: USABLE · HTTP 200 · 3.2s
- **Title**: Utility readings · Arconique Management OS
- **CRUD**: add=0 edit=0 delete=0
- **UX leaks**: none
- **Empty state**: —
- **Console errors**: 0
- **Severity**: OK
- **Screenshot**: `tmp/stage-10-screenshots/_dashboard_utilities_readings.jpeg`

---

### `/dashboard/utilities/risks`

- **Status**: EMPTY-OK · HTTP 200 · 3.3s
- **Title**: Utility risks · Arconique Management OS
- **CRUD**: add=0 edit=0 delete=0
- **UX leaks**: none
- **Empty state**: "Open risks scoped to utility accounts: low/critical balance + no recent reading. Run the unified scanner to refresh." · no CTA
- **Console errors**: 0
- **Severity**: OK
- **Screenshot**: `tmp/stage-10-screenshots/_dashboard_utilities_risks.jpeg`

