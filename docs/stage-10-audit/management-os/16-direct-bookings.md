# Direct bookings — management-os

**Pages audited**: 7
**Verdicts**: EMPTY-OK=1 · USABLE=5 · MISSING=1
**Severity counts**: BLOCKER=1 · HIGH=0 · MEDIUM=0 · LOW=0 · OK=6

---

## Issues by severity


**[BLOCKER]** `/dashboard/direct-bookings/guest-messages` — 404 not found

---

## Per-page detail

### `/dashboard/direct-bookings`

- **Status**: EMPTY-OK · HTTP 200 · 4.7s
- **Title**: Direct bookings · Arconique Management OS
- **CRUD**: add=0 edit=0 delete=0
- **UX leaks**: none
- **Empty state**: "Quote → temporary inventory hold → guest contact form → manual concierge approval → canonical booking. No payment proces" · no CTA
- **Console errors**: 0
- **Severity**: OK
- **Screenshot**: `tmp/stage-10-screenshots/_dashboard_direct-bookings.jpeg`

---

### `/dashboard/direct-bookings/deposits`

- **Status**: USABLE · HTTP 200 · 3.0s
- **Title**: Deposits · Arconique Management OS
- **CRUD**: add=0 edit=0 delete=0
- **UX leaks**: none
- **Empty state**: —
- **Console errors**: 0
- **Severity**: OK
- **Screenshot**: `tmp/stage-10-screenshots/_dashboard_direct-bookings_deposits.jpeg`

---

### `/dashboard/direct-bookings/guest-messages`

- **Status**: MISSING · HTTP 404 · 0.8s
- **Title**: Arconique Management OS
- **CRUD**: add=0 edit=0 delete=0
- **UX leaks**: none
- **Empty state**: —
- **Console errors**: 1 · Failed to load resource: the server responded with a status of 404 ()
- **Severity**: BLOCKER
- **Issues**: 
  - 404 not found
- **Screenshot**: `tmp/stage-10-screenshots/_dashboard_direct-bookings_guest-messages.jpeg`

---

### `/dashboard/direct-bookings/guest-status`

- **Status**: USABLE · HTTP 200 · 4.9s
- **Title**: Guest status snapshots · Arconique Management OS
- **CRUD**: add=0 edit=0 delete=0
- **UX leaks**: none
- **Empty state**: —
- **Console errors**: 0
- **Severity**: OK
- **Screenshot**: `tmp/stage-10-screenshots/_dashboard_direct-bookings_guest-status.jpeg`

---

### `/dashboard/direct-bookings/holds`

- **Status**: USABLE · HTTP 200 · 5.7s
- **Title**: Direct booking holds · Arconique Management OS
- **CRUD**: add=0 edit=0 delete=0
- **UX leaks**: none
- **Empty state**: —
- **Console errors**: 0
- **Severity**: OK
- **Screenshot**: `tmp/stage-10-screenshots/_dashboard_direct-bookings_holds.jpeg`

---

### `/dashboard/direct-bookings/reconciliation`

- **Status**: USABLE · HTTP 200 · 4.2s
- **Title**: Direct booking reconciliation · Arconique Management OS
- **CRUD**: add=0 edit=0 delete=0
- **UX leaks**: none
- **Empty state**: —
- **Console errors**: 0
- **Severity**: OK
- **Screenshot**: `tmp/stage-10-screenshots/_dashboard_direct-bookings_reconciliation.jpeg`

---

### `/dashboard/direct-bookings/requests`

- **Status**: USABLE · HTTP 200 · 2.7s
- **Title**: Direct booking requests · Arconique Management OS
- **CRUD**: add=0 edit=0 delete=0
- **UX leaks**: none
- **Empty state**: —
- **Console errors**: 0
- **Severity**: OK
- **Screenshot**: `tmp/stage-10-screenshots/_dashboard_direct-bookings_requests.jpeg`

