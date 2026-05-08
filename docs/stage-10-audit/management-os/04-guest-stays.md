# Guest stays — management-os

**Pages audited**: 19
**Verdicts**: EMPTY-OK=1 · USABLE=7 · MISSING=11
**Severity counts**: BLOCKER=11 · HIGH=3 · MEDIUM=1 · LOW=0 · OK=4

---

## Issues by severity


**[BLOCKER]** `/dashboard/villa-guides/concierge-ai` — 404 not found

**[BLOCKER]** `/dashboard/villa-guides/concierge-ai/attachments` — 404 not found

**[BLOCKER]** `/dashboard/villa-guides/concierge-ai/handoff-sla` — 404 not found

**[BLOCKER]** `/dashboard/villa-guides/concierge-ai/handoffs` — 404 not found

**[BLOCKER]** `/dashboard/villa-guides/concierge-ai/sessions` — 404 not found

**[BLOCKER]** `/dashboard/villa-guides/security/events` — 404 not found

**[BLOCKER]** `/dashboard/villa-guides/security/verifications` — 404 not found

**[BLOCKER]** `/dashboard/villa-guides/security/wifi-migration` — 404 not found

**[BLOCKER]** `/dashboard/villa-guides/services` — 404 not found

**[BLOCKER]** `/dashboard/villa-guides/services/finance-bridge` — 404 not found

**[BLOCKER]** `/dashboard/villa-guides/services/orders` — 404 not found

**[HIGH]** `/dashboard/villa-guides/emergency-contacts` — add but no edit/delete affordance; add navigates to page (should be modal)

**[HIGH]** `/dashboard/villa-guides/neighborhood` — add but no edit/delete affordance; add navigates to page (should be modal)

**[HIGH]** `/dashboard/villa-guides/sections` — add but no edit/delete affordance; add navigates to page (should be modal)

**[MEDIUM]** `/dashboard/villa-guides/wifi` — add navigates to page (should be modal)

---

## Per-page detail

### `/dashboard/guest-stays`

- **Status**: EMPTY-OK · HTTP 200 · 3.6s
- **Title**: Guest stays · Arconique Management OS
- **CRUD**: add=0 edit=0 delete=0
- **UX leaks**: none
- **Empty state**: "Issue signed stay tokens, edit the villa guide, manage the smart-lock stub. The guest portal at /stay/[token] reads thro" · no CTA
- **Console errors**: 0
- **Severity**: OK
- **Screenshot**: `tmp/stage-10-screenshots/_dashboard_guest-stays.jpeg`

---

### `/dashboard/guest-stays/tokens`

- **Status**: USABLE · HTTP 200 · 3.4s
- **Title**: Guest stay tokens · Arconique Management OS
- **CRUD**: add=0 edit=0 delete=0
- **UX leaks**: none
- **Empty state**: —
- **Console errors**: 0
- **Severity**: OK
- **Screenshot**: `tmp/stage-10-screenshots/_dashboard_guest-stays_tokens.jpeg`

---

### `/dashboard/villa-guides`

- **Status**: USABLE · HTTP 200 · 4.1s
- **Title**: Villa guides · Arconique Management OS
- **CRUD**: add=0 edit=0 delete=0
- **UX leaks**: none
- **Empty state**: —
- **Console errors**: 0
- **Severity**: OK
- **Screenshot**: `tmp/stage-10-screenshots/_dashboard_villa-guides.jpeg`

---

### `/dashboard/villa-guides/concierge-ai`

- **Status**: MISSING · HTTP 404 · 0.8s
- **Title**: Arconique Management OS
- **CRUD**: add=0 edit=0 delete=0
- **UX leaks**: none
- **Empty state**: —
- **Console errors**: 1 · Failed to load resource: the server responded with a status of 404 ()
- **Severity**: BLOCKER
- **Issues**: 
  - 404 not found
- **Screenshot**: `tmp/stage-10-screenshots/_dashboard_villa-guides_concierge-ai.jpeg`

---

### `/dashboard/villa-guides/concierge-ai/attachments`

- **Status**: MISSING · HTTP 404 · 0.8s
- **Title**: Arconique Management OS
- **CRUD**: add=0 edit=0 delete=0
- **UX leaks**: none
- **Empty state**: —
- **Console errors**: 1 · Failed to load resource: the server responded with a status of 404 ()
- **Severity**: BLOCKER
- **Issues**: 
  - 404 not found
- **Screenshot**: `tmp/stage-10-screenshots/_dashboard_villa-guides_concierge-ai_attachments.jpeg`

---

### `/dashboard/villa-guides/concierge-ai/handoff-sla`

- **Status**: MISSING · HTTP 404 · 0.8s
- **Title**: Arconique Management OS
- **CRUD**: add=0 edit=0 delete=0
- **UX leaks**: none
- **Empty state**: —
- **Console errors**: 1 · Failed to load resource: the server responded with a status of 404 ()
- **Severity**: BLOCKER
- **Issues**: 
  - 404 not found
- **Screenshot**: `tmp/stage-10-screenshots/_dashboard_villa-guides_concierge-ai_handoff-sla.jpeg`

---

### `/dashboard/villa-guides/concierge-ai/handoffs`

- **Status**: MISSING · HTTP 404 · 0.8s
- **Title**: Arconique Management OS
- **CRUD**: add=0 edit=0 delete=0
- **UX leaks**: none
- **Empty state**: —
- **Console errors**: 1 · Failed to load resource: the server responded with a status of 404 ()
- **Severity**: BLOCKER
- **Issues**: 
  - 404 not found
- **Screenshot**: `tmp/stage-10-screenshots/_dashboard_villa-guides_concierge-ai_handoffs.jpeg`

---

### `/dashboard/villa-guides/concierge-ai/sessions`

- **Status**: MISSING · HTTP 404 · 0.8s
- **Title**: Arconique Management OS
- **CRUD**: add=0 edit=0 delete=0
- **UX leaks**: none
- **Empty state**: —
- **Console errors**: 1 · Failed to load resource: the server responded with a status of 404 ()
- **Severity**: BLOCKER
- **Issues**: 
  - 404 not found
- **Screenshot**: `tmp/stage-10-screenshots/_dashboard_villa-guides_concierge-ai_sessions.jpeg`

---

### `/dashboard/villa-guides/emergency-contacts`

- **Status**: USABLE · HTTP 200 · 3.3s
- **Title**: Emergency contacts · Arconique Management OS
- **CRUD**: add=1 (page) edit=0 delete=0
- **UX leaks**: none
- **Empty state**: —
- **Console errors**: 0
- **Severity**: HIGH
- **Issues**: 
  - add but no edit/delete affordance
  - add navigates to page (should be modal)
- **Screenshot**: `tmp/stage-10-screenshots/_dashboard_villa-guides_emergency-contacts.jpeg`

---

### `/dashboard/villa-guides/neighborhood`

- **Status**: USABLE · HTTP 200 · 2.8s
- **Title**: Neighborhood places · Arconique Management OS
- **CRUD**: add=1 (page) edit=0 delete=0
- **UX leaks**: none
- **Empty state**: —
- **Console errors**: 0
- **Severity**: HIGH
- **Issues**: 
  - add but no edit/delete affordance
  - add navigates to page (should be modal)
- **Screenshot**: `tmp/stage-10-screenshots/_dashboard_villa-guides_neighborhood.jpeg`

---

### `/dashboard/villa-guides/sections`

- **Status**: USABLE · HTTP 200 · 3.0s
- **Title**: Guide sections · Arconique Management OS
- **CRUD**: add=1 (page) edit=0 delete=0
- **UX leaks**: none
- **Empty state**: —
- **Console errors**: 0
- **Severity**: HIGH
- **Issues**: 
  - add but no edit/delete affordance
  - add navigates to page (should be modal)
- **Screenshot**: `tmp/stage-10-screenshots/_dashboard_villa-guides_sections.jpeg`

---

### `/dashboard/villa-guides/security/events`

- **Status**: MISSING · HTTP 404 · 0.8s
- **Title**: Arconique Management OS
- **CRUD**: add=0 edit=0 delete=0
- **UX leaks**: none
- **Empty state**: —
- **Console errors**: 1 · Failed to load resource: the server responded with a status of 404 ()
- **Severity**: BLOCKER
- **Issues**: 
  - 404 not found
- **Screenshot**: `tmp/stage-10-screenshots/_dashboard_villa-guides_security_events.jpeg`

---

### `/dashboard/villa-guides/security/verifications`

- **Status**: MISSING · HTTP 404 · 0.8s
- **Title**: Arconique Management OS
- **CRUD**: add=0 edit=0 delete=0
- **UX leaks**: none
- **Empty state**: —
- **Console errors**: 1 · Failed to load resource: the server responded with a status of 404 ()
- **Severity**: BLOCKER
- **Issues**: 
  - 404 not found
- **Screenshot**: `tmp/stage-10-screenshots/_dashboard_villa-guides_security_verifications.jpeg`

---

### `/dashboard/villa-guides/security/wifi-migration`

- **Status**: MISSING · HTTP 404 · 0.8s
- **Title**: Arconique Management OS
- **CRUD**: add=0 edit=0 delete=0
- **UX leaks**: none
- **Empty state**: —
- **Console errors**: 1 · Failed to load resource: the server responded with a status of 404 ()
- **Severity**: BLOCKER
- **Issues**: 
  - 404 not found
- **Screenshot**: `tmp/stage-10-screenshots/_dashboard_villa-guides_security_wifi-migration.jpeg`

---

### `/dashboard/villa-guides/services`

- **Status**: MISSING · HTTP 404 · 0.9s
- **Title**: Arconique Management OS
- **CRUD**: add=0 edit=0 delete=0
- **UX leaks**: none
- **Empty state**: —
- **Console errors**: 1 · Failed to load resource: the server responded with a status of 404 ()
- **Severity**: BLOCKER
- **Issues**: 
  - 404 not found
- **Screenshot**: `tmp/stage-10-screenshots/_dashboard_villa-guides_services.jpeg`

---

### `/dashboard/villa-guides/services/finance-bridge`

- **Status**: MISSING · HTTP 404 · 0.8s
- **Title**: Arconique Management OS
- **CRUD**: add=0 edit=0 delete=0
- **UX leaks**: none
- **Empty state**: —
- **Console errors**: 1 · Failed to load resource: the server responded with a status of 404 ()
- **Severity**: BLOCKER
- **Issues**: 
  - 404 not found
- **Screenshot**: `tmp/stage-10-screenshots/_dashboard_villa-guides_services_finance-bridge.jpeg`

---

### `/dashboard/villa-guides/services/orders`

- **Status**: MISSING · HTTP 404 · 0.8s
- **Title**: Arconique Management OS
- **CRUD**: add=0 edit=0 delete=0
- **UX leaks**: none
- **Empty state**: —
- **Console errors**: 1 · Failed to load resource: the server responded with a status of 404 ()
- **Severity**: BLOCKER
- **Issues**: 
  - 404 not found
- **Screenshot**: `tmp/stage-10-screenshots/_dashboard_villa-guides_services_orders.jpeg`

---

### `/dashboard/villa-guides/wifi`

- **Status**: USABLE · HTTP 200 · 3.7s
- **Title**: Wi-Fi credentials · Arconique Management OS
- **CRUD**: add=1 (page) edit=2 delete=0
- **UX leaks**: none
- **Empty state**: —
- **Console errors**: 0
- **Severity**: MEDIUM
- **Issues**: 
  - add navigates to page (should be modal)
- **Screenshot**: `tmp/stage-10-screenshots/_dashboard_villa-guides_wifi.jpeg`

---

### `/dashboard/villa-guides/wifi/migrate`

- **Status**: USABLE · HTTP 200 · 4.7s
- **Title**: Migrate Wi-Fi to encrypted · Arconique Management OS
- **CRUD**: add=0 edit=0 delete=0
- **UX leaks**: none
- **Empty state**: —
- **Console errors**: 0
- **Severity**: OK
- **Screenshot**: `tmp/stage-10-screenshots/_dashboard_villa-guides_wifi_migrate.jpeg`

