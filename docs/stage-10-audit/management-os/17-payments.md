# Payments — management-os

**Pages audited**: 3
**Verdicts**: EMPTY-OK=1 · USABLE=2
**Severity counts**: BLOCKER=0 · HIGH=1 · MEDIUM=0 · LOW=0 · OK=2

---

## Issues by severity


**[HIGH]** `/dashboard/payments/providers` — add but no edit/delete affordance; add navigates to page (should be modal)

---

## Per-page detail

### `/dashboard/payments`

- **Status**: EMPTY-OK · HTTP 200 · 2.9s
- **Title**: Payments · Arconique Management OS
- **CRUD**: add=0 edit=0 delete=0
- **UX leaks**: none
- **Empty state**: "No real provider integration is active. The manual stub records deposits as `pending`; admins flip them to `manually_mar" · no CTA
- **Console errors**: 0
- **Severity**: OK
- **Screenshot**: `tmp/stage-10-screenshots/_dashboard_payments.jpeg`

---

### `/dashboard/payments/providers`

- **Status**: USABLE · HTTP 200 · 3.8s
- **Title**: Payment providers · Arconique Management OS
- **CRUD**: add=1 (page) edit=0 delete=0
- **UX leaks**: none
- **Empty state**: "No payment processor connections yet. Click Add connection to wire Stripe / Wise / PayPal / Manual." · has CTA
- **Console errors**: 0
- **Severity**: HIGH
- **Issues**: 
  - add but no edit/delete affordance
  - add navigates to page (should be modal)
- **Screenshot**: `tmp/stage-10-screenshots/_dashboard_payments_providers.jpeg`

---

### `/dashboard/payments/webhooks`

- **Status**: USABLE · HTTP 200 · 3.4s
- **Title**: Payment webhooks · Arconique Management OS
- **CRUD**: add=0 edit=0 delete=0
- **UX leaks**: none
- **Empty state**: —
- **Console errors**: 0
- **Severity**: OK
- **Screenshot**: `tmp/stage-10-screenshots/_dashboard_payments_webhooks.jpeg`

