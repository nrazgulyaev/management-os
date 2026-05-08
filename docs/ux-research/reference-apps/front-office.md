# Front-office reference apps

Role context: front-office manager running guest journey: arrival prep, check-in, in-stay requests, check-out. Day shift vs. night shift. Visualizes the 7-day journey timeline per guest. Desktop at front desk + phone for floor patrols. Volume 5-20 active stays per villa.

## Cloudbeds

### Positioning
Cloudbeds is the leading PMS for independent hotels, hostels, and small-property groups — known for an unusually approachable interface that gets new front-desk staff productive in under two weeks. Its strength is a unified dashboard that ties reservations, channel manager, payments, and housekeeping into one screen, with a calendar/timeline view of the property as the home surface. Pitched at properties that want hotel-grade ops without enterprise complexity.

### Top 3 patterns
1. **Drag-and-drop calendar timeline as the home screen.** The PMS opens to a horizontal grid: rows are rooms/units, columns are days, bookings appear as colored blocks you can drag to extend, shorten, or move. Arrival/departure are visually obvious; a glance answers "who's checking in today, who's still here, who needs the room flipped." For Arconique's front-office manager juggling 5-20 active stays this is the single most important UI: the timeline *is* the dashboard.
2. **Color-coded reservation status on the block.** Each booking block is tinted by status (confirmed / checked-in / checked-out / no-show / pending payment) and overlaid with payment / housekeeping / note icons. The manager sees state without clicking — a red border means unpaid, a broom icon means room not yet cleaned. Arconique's 7-day villa journey has the same need: arrival prep, in-stay, departure prep should all be readable from the block at 6 a.m. coffee glance.
3. **Shift-handover-friendly task list per day.** A daily-task panel beside the timeline lists arrivals, departures, in-house guests with action items, and overdue check-ins, with checkbox completion that persists across users. Day-to-night-shift handover is the riskiest moment in front-office; an explicit shared checklist beats verbal handover or Slack scrollback.

### Pricing
$ — $$ — published as "starting around $200-400/property/mo" plus channel manager add-ons, with custom pricing for multi-property groups.

### Why useful for Arconique
Cloudbeds is the most approachable reference for the timeline-as-home-screen pattern. The bar Arconique should meet: a new front-office hire produces value on shift two without a manual.

## Mews

### Positioning
Mews is the "modern hospitality cloud" — design-led, API-first, popular with boutique hotels and lifestyle groups across Europe. Known for elegant UI, strong contactless/online check-in, digital keys, and an open ecosystem of integrations. The Timeline is the centerpiece of the property-operations product; Mews has invested heavily in making bookings creatable and editable directly from it.

### Top 3 patterns
1. **Online check-in link sent automatically pre-arrival.** Each guest receives a personalized check-in link by email/SMS; they upload ID, sign registration, and provide arrival ETA from their phone before they hit the lobby. Front-desk staff arrive at shift with most paperwork already done. For Arconique villas — where guests often arrive jet-lagged and the "front desk" is sometimes the villa manager meeting them at the gate — this collapses 30 minutes of arrival friction.
2. **Filterable Timeline (floor / space category / feature).** Mews' Timeline supports filters for floors, space categories, and amenity features so the manager can isolate "all 2-bed villas" or "only pool villas" or "only ground-floor units." Arconique's portfolio spans villa types and bed counts; the timeline must filter the same way so the manager can spot capacity issues within a category, not just across the whole property.
3. **Guest profile with stay history + preferences carried across visits.** Returning guests' profiles auto-populate ID, dietary preferences, prior-stay notes, and complaints/issues, surfacing them to staff at check-in. For Arconique's repeat-guest segment (and Bali long-stays often return annually) this is the single biggest "wow" lever — staff greeting a guest with "welcome back, we have the same masseuse you liked last time" beats any tech feature.

### Pricing
$$ — $$$ — Mews publishes tiered pricing roughly $9-15/room/mo across plans, with add-ons for kiosks, payments, and integrations; mid-size properties typically land in $$$ range.

### Why useful for Arconique
Mews is the design-quality benchmark. The online-check-in flow is the cleanest in the industry; if Arconique wants villa guests to feel they're staying somewhere modern (not at a B&B with a clipboard), this is the bar.

## Hostfully

### Positioning
Hostfully is a vacation-rental-specific PMS — purpose-built for short-term-rental managers running portfolios across Airbnb, Vrbo, Booking.com, and direct sites. Strongest at multi-channel sync, automated guest messaging across the booking lifecycle, and digital guidebooks. Closer in shape to Arconique's actual use case than hotel PMSes are: villa-style properties, distributed locations, heavy reliance on automated comms.

### Top 3 patterns
1. **Trigger-based guest message sequences across the journey.** Templates fire automatically at lifecycle events: booking confirmation, 7-days-out arrival prep, 24-hours-out check-in instructions, mid-stay check-in, post-stay review request. Up to ~70% of guest messages can be automated. Arconique's front-office manager is currently doing this work in WhatsApp manually; Hostfully's pattern is the reference for moving that to the system without losing the personal voice (templates with variables, not bot-speak).
2. **Digital guidebook per property.** Each villa has a beautifully styled web guidebook the guest accesses by link — wifi password, gate code, restaurant recs, local emergency numbers, "how the AC works." Massively reduces inbound "how do I…" messages mid-stay. Arconique villas have the same problem at 10x intensity (Indonesian context, expat guests); a per-villa guidebook is high-leverage.
3. **InboxAI / unified guest-message inbox across channels.** All Airbnb / Vrbo / direct / WhatsApp messages converge into one inbox; an AI assistant scans property + reservation + guidebook data and drafts replies for the manager to approve. For a front-office manager juggling 20 active stays across two channels and a phone, the unified inbox + AI-draft pattern is the productivity unlock.

### Pricing
$$ — published roughly $90-150/property/mo for the Pro tier, with Premium tiers higher; cheaper at small portfolio sizes than Cloudbeds/Mews per-unit math.

### Why useful for Arconique
Hostfully is structurally the closest peer — vacation rental, multi-property, channel-distributed, message-heavy. The lifecycle-triggered messaging templates and per-property guidebook are the highest-leverage borrows for the in-stay portion of the journey.

## Top 3 cross-app patterns to adopt
1. **Timeline-as-home-screen for the manager.** Cloudbeds and Mews both make a horizontal calendar grid the default surface — rooms/villas as rows, days as columns, bookings as draggable blocks with status color and icon overlays. Arconique's front-office home should be exactly this, with the 7-day journey states (prep / arrival / in-stay / departure prep / cleaned) readable on the block.
2. **Lifecycle-triggered guest comms with personal-voice templates.** Hostfully's automated message sequences + Mews's online check-in link together = the right model. Send the right message at the right time automatically, but let the manager edit a draft before send when the situation needs care (complaint, special occasion, late arrival). Don't fully automate; assist.
3. **Shared, daily, role-aware task list.** Cloudbeds-style daily task list keyed to the timeline, owned across shifts, with checkbox state that survives handover. Day-shift closes "arrivals confirmed"; night-shift opens to "next-day arrivals prepped" already filtered. Eliminates the verbal-handover failure mode.

## Anti-patterns to avoid
- **Modal-heavy check-in flow.** Cloudbeds' older flows pop multiple modals to complete check-in; on a slow connection at 11 p.m. this is painful. Arconique should make check-in a single in-place form, not a wizard.
- **Mobile = miniature desktop.** All three have mobile apps that try to cram the timeline onto a phone and fail. Arconique's phone experience should be task-focused (today's arrivals, current guest message, one-tap "guest checked in"), not the full board.
- **Generic templated messages.** Hostfully users complain that over-automated messaging makes guests feel they're talking to a bot. Templates must support variables (guest name, villa, specific local detail), and the manager must be able to intercept any message before send during the first stay.
- **Hidden housekeeping/maintenance state.** When a villa is "checked out but not cleaned" or "maintenance issue blocking re-rental," that state must be visible on the timeline block, not buried two clicks deep. Cloudbeds does this well; many competitors don't.
- **Separate apps for housekeeping, front desk, and guest messaging.** Mews and Cloudbeds both consolidate these onto one timeline; properties that bolt on three vendors lose handover discipline. Arconique should keep the front-office surface unified from day one.
- **No offline / poor-connectivity tolerance.** Bali villa front-offices regularly lose internet. A PMS that requires constant connection (Mews skews this way) will fail in the field. Plan for graceful degradation: cached today's arrivals, queued status updates, sync-on-reconnect.
