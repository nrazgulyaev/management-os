# Guest journey — management-os

**Pages audited**: 5
**Verdicts**: EMPTY-OK=2 · MISSING=1 · USABLE=2
**Severity counts**: BLOCKER=1 · HIGH=1 · MEDIUM=0 · LOW=0 · OK=3

---

## Issues by severity


**[BLOCKER]** `/dashboard/guest-journey/review-requests` — 404 not found

**[HIGH]** `/dashboard/guest-journey/rules` — add but no edit/delete affordance; add navigates to page (should be modal)

---

## Per-page detail

### `/dashboard/guest-journey`

- **Status**: EMPTY-OK · HTTP 200 · 3.3s
- **Title**: Guest journey · Arconique Management OS
- **CRUD**: add=0 edit=0 delete=0
- **UX leaks**: none
- **Empty state**: "Deterministic timed rules across pre-arrival → post-stay. Suggestions are CTAs (no purchases); review requests route by " · no CTA
- **Console errors**: 0
- **Severity**: OK
- **Screenshot**: `tmp/stage-10-screenshots/_dashboard_guest-journey.jpeg`

---

### `/dashboard/guest-journey/review-requests`

- **Status**: MISSING · HTTP 404 · 0.8s
- **Title**: Arconique Management OS
- **CRUD**: add=0 edit=0 delete=0
- **UX leaks**: none
- **Empty state**: —
- **Console errors**: 1 · Failed to load resource: the server responded with a status of 404 ()
- **Severity**: BLOCKER
- **Issues**: 
  - 404 not found
- **Screenshot**: `tmp/stage-10-screenshots/_dashboard_guest-journey_review-requests.jpeg`

---

### `/dashboard/guest-journey/rules`

- **Status**: USABLE · HTTP 200 · 3.3s
- **Title**: Journey rules · Arconique Management OS
- **CRUD**: add=1 (page) edit=0 delete=0
- **UX leaks**: none
- **Empty state**: "Each rule maps a (stage, anchor, offset, channel) tuple to either a guest suggestion, a queued notification, or both." · has CTA
- **Console errors**: 0
- **Severity**: HIGH
- **Issues**: 
  - add but no edit/delete affordance
  - add navigates to page (should be modal)
- **Screenshot**: `tmp/stage-10-screenshots/_dashboard_guest-journey_rules.jpeg`

---

### `/dashboard/guest-journey/runs`

- **Status**: EMPTY-OK · HTTP 200 · 4.8s
- **Title**: Journey runs · Arconique Management OS
- **CRUD**: add=0 edit=0 delete=0
- **UX leaks**: none
- **Empty state**: "Each row is one (booking, rule) pair. Idempotent — re-runs are no-ops on the unique index." · no CTA
- **Console errors**: 0
- **Severity**: OK
- **Screenshot**: `tmp/stage-10-screenshots/_dashboard_guest-journey_runs.jpeg`

---

### `/dashboard/guest-journey/suggestions`

- **Status**: USABLE · HTTP 200 · 2.9s
- **Title**: Journey suggestions · Arconique Management OS
- **CRUD**: add=0 edit=0 delete=0
- **UX leaks**: none
- **Empty state**: —
- **Console errors**: 0
- **Severity**: OK
- **Screenshot**: `tmp/stage-10-screenshots/_dashboard_guest-journey_suggestions.jpeg`

