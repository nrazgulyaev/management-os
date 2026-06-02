# Task — Phase 2.2 PR 1 — Mgmt · Bookings

**Reference doc:** `_handoff/cabinets/mgmt-p1/bookings.html`

Phase 2.1 already shipped the list + detail scaffolds in `/dashboard/bookings` and `/dashboard/bookings/[id]`. This PR fills them in with channel pills, arrival calendar, the full 7-field new-booking modal, and the cancel-flow with refund policy.

## Files

ROUTES (refactor + new):
- `src/app/(dashboard)/dashboard/bookings/page.tsx` — refactor: today strip + 4 KPIs + 3 filter chips + row-tone
- `src/app/(dashboard)/dashboard/bookings/[id]/page.tsx` — refactor: 5 tabs (Overview / Charges / Guests / Activity / Documents); Overview spec'd in cabinet doc
- `src/app/(dashboard)/dashboard/bookings/new/page.tsx` — new (standalone full-page form alt to modal)
- `src/app/(dashboard)/dashboard/bookings/[id]/charges/[chargeId]/page.tsx` — new (refund flow)

COMPONENTS:
- `src/components/bookings/channel-pill.tsx` — `<ChannelPill kind="airbnb"|"bcom"|"agoda"|"direct"|"ta" />`. Brand colors. Tones in `src/styles/components.css` under `[data-product] .channel-pill`.
- `src/components/bookings/arrival-calendar.tsx` — 7-day grid (today highlighted, arr/dep pill counts). Renders only when filter view = "This week" OR no filter.

FEATURES:
- `src/features/bookings/row-tone.ts` — pure fn `getRowTone(booking): "arriving"|"departing"|"instay"|"cancelled"|undefined`. Logic from cabinet doc.
- `src/features/bookings/cancellation-policy.ts` — pure fn `computeRefund(booking, today): {amount, channel, reason}`. Rules: >14d full, 7–14d 50%, <7d 0%. Director override supported.

MODALS:
- `src/components/bookings/new-booking-modal.tsx` — extend existing 2.1 PoL to 7 fields (villa, check-in, check-out, primary guest + email + phone, party size adults+children, channel, internal notes)
- `src/components/bookings/extend-stay-modal.tsx` — new form-sm
- `src/components/bookings/cancel-booking-modal.tsx` — refactor with policy logic + Director override + notify-guest toggle
- `src/components/bookings/add-charge-modal.tsx` — new form-md
- `src/components/bookings/refund-charge-modal.tsx` — new destructive-sm

AGENTS:
- `src/features/ai-agents/arrival-prep/` — new stub. Scheduled hourly. Reads bookings with check-in < 24h, writes to `arrival_prep_checklist` table (room/chef/driver flags). Displayed in Stay Details card.

CSS:
- Add `.channel-pill` + 5 brand variants to `src/styles/components.css`
- Add `.row-arriving / .row-departing / .row-instay / .row-cancelled` row-bg overrides
- Add `.arrival-cal` grid + day cell styles

## Wiring example — list page

```tsx
import { ListPage } from "@/components/dashboard/list-page";
import { FilterBar } from "@/components/dashboard/filter-bar";
import { ArrivalCalendar } from "@/components/bookings/arrival-calendar";
import { ChannelPill } from "@/components/bookings/channel-pill";
import { getRowTone } from "@/features/bookings/row-tone";

const bookings = await getBookings({ filters });

return (
  <ListPage
    header={<PageHeader title="Bookings" actions={<NewBookingCta />} />}
    kpis={<BookingsKpiRow data={kpis} />}
    above={viewIsThisWeek ? <ArrivalCalendar days={7days} /> : null}
    filter={<FilterBar … />}
    table={
      <table className="data">
        {bookings.map(b => (
          <tr key={b.id} className={getRowTone(b) ? `row-${getRowTone(b)}` : ""}>
            …
            <td><ChannelPill kind={b.channel} /></td>
          </tr>
        ))}
      </table>
    }
    pager={<PagerNumbered total={total} page={page} onChange={…} urlKeyPrefix="" />}
  />
);
```

## Validation

- `npm run typecheck` / `npm run lint` / `npm run smoke:routes` — clean
- `/dashboard/bookings?view=this-week` renders arrival calendar above filter bar
- `/dashboard/bookings` with no filter — calendar shown
- Row tones visible: today's arrivals tinted accent · departures tinted gold · in-stay tinted ok · cancelled dim
- Channel pills render in brand colors (Airbnb red, Booking.com blue, etc.)
- `/dashboard/bookings/new` — full 7-field form; ⌘+Enter submits
- Cancel flow: select booking → click Cancel → modal shows computed refund amount (e.g. "100% refund, 18d to arrival") with policy-override checkbox

## Commit

`phase-2.2(mgmt-bookings): channel pills + today strip + 7-field new + cancel policy + 5 modals + arrival-prep agent`
