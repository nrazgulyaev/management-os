# Dynamic pricing — management-os

**Pages audited**: 6
**Verdicts**: USABLE=4 · EMPTY-OK=1 · MISSING=1
**Severity counts**: BLOCKER=1 · HIGH=1 · MEDIUM=0 · LOW=0 · OK=4

---

## Issues by severity


**[BLOCKER]** `/dashboard/pricing/quote-tester` — 404 not found

**[HIGH]** `/dashboard/pricing/rule-sets` — add but no edit/delete affordance; add navigates to page (should be modal)

---

## Per-page detail

### `/dashboard/pricing`

- **Status**: USABLE · HTTP 200 · 2.9s
- **Title**: Dynamic pricing · Arconique Management OS
- **CRUD**: add=0 edit=0 delete=0
- **UX leaks**: none
- **Empty state**: —
- **Console errors**: 0
- **Severity**: OK
- **Screenshot**: `tmp/stage-10-screenshots/_dashboard_pricing.jpeg`

---

### `/dashboard/pricing/calendar`

- **Status**: USABLE · HTTP 200 · 4.9s
- **Title**: Pricing calendar · Arconique Management OS
- **CRUD**: add=0 edit=0 delete=0
- **UX leaks**: none
- **Empty state**: —
- **Console errors**: 0
- **Severity**: OK
- **Screenshot**: `tmp/stage-10-screenshots/_dashboard_pricing_calendar.jpeg`

---

### `/dashboard/pricing/channel-push`

- **Status**: EMPTY-OK · HTTP 200 · 2.9s
- **Title**: Channel push · Arconique Management OS
- **CRUD**: add=0 edit=0 delete=0
- **UX leaks**: none
- **Empty state**: "Outbound stub. Records what we WOULD push to a channel manager — no real OTA integration." · no CTA
- **Console errors**: 0
- **Severity**: OK
- **Screenshot**: `tmp/stage-10-screenshots/_dashboard_pricing_channel-push.jpeg`

---

### `/dashboard/pricing/logs`

- **Status**: USABLE · HTTP 200 · 3.6s
- **Title**: Quote logs · Arconique Management OS
- **CRUD**: add=0 edit=0 delete=0
- **UX leaks**: none
- **Empty state**: —
- **Console errors**: 0
- **Severity**: OK
- **Screenshot**: `tmp/stage-10-screenshots/_dashboard_pricing_logs.jpeg`

---

### `/dashboard/pricing/quote-tester`

- **Status**: MISSING · HTTP 404 · 0.8s
- **Title**: Arconique Management OS
- **CRUD**: add=0 edit=0 delete=0
- **UX leaks**: none
- **Empty state**: —
- **Console errors**: 1 · Failed to load resource: the server responded with a status of 404 ()
- **Severity**: BLOCKER
- **Issues**: 
  - 404 not found
- **Screenshot**: `tmp/stage-10-screenshots/_dashboard_pricing_quote-tester.jpeg`

---

### `/dashboard/pricing/rule-sets`

- **Status**: USABLE · HTTP 200 · 3.0s
- **Title**: Pricing rule sets · Arconique Management OS
- **CRUD**: add=1 (page) edit=0 delete=0
- **UX leaks**: none
- **Empty state**: —
- **Console errors**: 0
- **Severity**: HIGH
- **Issues**: 
  - add but no edit/delete affordance
  - add navigates to page (should be modal)
- **Screenshot**: `tmp/stage-10-screenshots/_dashboard_pricing_rule-sets.jpeg`

