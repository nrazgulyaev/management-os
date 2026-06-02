# Task — Phase 2.3 PR 4 — Owner · Calendar (pipeline + personal stays)

**Reference doc:** `_handoff/cabinets/owner-p1/04-calendar.html`

## Files

ROUTES:
- `src/app/(owner-portal)/owner/calendar/page.tsx` · month view (default) + ?month=YYYY-MM query
- `src/app/(owner-portal)/owner/calendar/request/page.tsx` · personal-stay request form (mobile alt to modal)

PRIMITIVES:
- `src/components/owner-portal/month-calendar.tsx` · 7-col grid · multi-day bars · color-encoded events
- `src/components/owner-portal/pipeline-list.tsx` · simplified booking list
- `src/components/owner-portal/personal-stay-modal.tsx` · form-md · date range picker + who's coming + notes

COLOR ENCODING:
- Terra = guest booking · Gold = pending owner request · Green = confirmed owner stay · Cream-deep = empty turnover day

MULTI-DAY EVENT LAYOUT:
- Server pre-computes `bookings[].dayStrip = {startCol, endCol, week}`
- Strip styling: rounded ends on start/end day, square middle

CROSS-CABINET:
- Personal request creates `booking` row with kind=owner_stay · status=requested
- Routes to Mgmt Bookings list (filtered tab "Owner requests")
- Mgmt confirm → notifies owner via Inbox · auto-updates calendar event to green

VALIDATION:
- Frontend: dates >= tomorrow, <= 12mo away
- Server: warn (but allow) if overlap with confirmed guest bookings — Mgmt arbitrates

## Mobile

≤900px: month grid → compact week-strip + day-detail drawer (tap day → drawer slides up with that day's events)

## Commit

`phase-2.3(owner-calendar): month view + pipeline list + personal-stay request flow + 3 primitives`
