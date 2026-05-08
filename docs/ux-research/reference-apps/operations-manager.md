# Operations manager reference apps

Role context: operations manager overseeing a multi-villa portfolio (5-30 villas). Day-of dashboard is the workspace: today's arrivals, departures, turnovers, urgent maintenance, channel issues. Approves cleaning checklists, escalates incidents to the right vendor, reviews channel performance and revenue at week's end. Desktop is primary; mobile is for spot-checks and approvals on the move.

## Hostaway

### Positioning
All-in-one PMS + channel manager for short-term rental managers, with a strong bias toward multi-property operators. Bundles channel distribution, unified inbox, automation, dynamic pricing integrations, owner portal, and tasks/cleaning into a single console. Aggressively integration-first (300+ integrations) which lets ops managers slot Hostaway in next to existing accounting, smart-lock, dynamic-pricing, and cleaning apps without ripping them out.

### Top 3 patterns
1. **Multi-calendar as the operations cockpit.** A horizontal calendar with one row per listing, color-coded by status (booked, blocked, cleaning, maintenance), filterable by property, team, or status, with drag-and-drop to move bookings. For a 5-30 villa ops manager, this is the single screen that answers "what is happening today and tomorrow" without clicking into each villa.
2. **Tasks tied to listing cleanliness status with photo + checklist evidence.** Each cleaning task carries a custom checklist; cleaners tick items, upload before/after photos, and flag damage/missing items inline. The listing's "Clean / Dirty / Inspecting" state is a first-class field that the calendar reflects, so the ops manager sees readiness at a glance, not by chasing a WhatsApp thread.
3. **Unified inbox spanning Airbnb, Vrbo, Booking.com, email, SMS, WhatsApp.** All guest threads collapse into one queue with auto-assignment rules and templated replies. For an ops manager triaging an arrival-day complaint that came in via WhatsApp while the booking lives on Booking.com, this collapses what is normally three apps into one.

### Pricing
Quote-based, scales with active listings. No flat published plan; portfolio size and integrations/add-ons drive cost. Channel-manager + core PMS features included; AI messaging and add-ons optional.

### Why useful for Arconique
Hostaway is the closest reference for the day-of ops cockpit. The multi-calendar layout, cleanliness-status-as-first-class-field, and unified inbox are the three patterns to copy almost directly. The opaque pricing is a anti-pattern to avoid.

## Guesty

### Positioning
The most enterprise-leaning of the three, aimed at professional property managers running anywhere from a handful to thousands of listings. Tiered into Lite (small, up to ~3 listings), Pro (mid-market, up to ~199), and Enterprise (200+, with brand/franchise features). Differentiates on a deeper task engine, robust automation rules, owner statements, accounting, and a more polished analytics layer than competitors.

### Top 3 patterns
1. **Auto-tasks triggered by reservation lifecycle events with ETA/ETD anchoring.** Tasks fire on rules like "2 hours before check-in" or "at check-out" rather than on calendar dates, so a late-arriving guest automatically pushes the linked tasks. Cleaning, maintenance, inspection, and check-in tasks all share the same engine. For Arconique's ops manager who today manually re-times turnovers when a flight delays, this is the pattern that removes the most daily friction.
2. **Cleaning checklists with timestamped item completion and total duration.** Each checklist item is timestamped as the cleaner ticks it; the system surfaces total task duration on completion. Over a month this produces a dataset the ops manager uses to spot slow turnovers, training gaps, and dishonest sign-offs. This is meaningfully better than a binary "done / not done" flag.
3. **Centralized tasks dashboard with real-time status across all properties.** A single board view of every active task across the portfolio, filterable by status, property, assignee, type. The ops manager opens this once in the morning and once before EOD instead of polling per villa.

### Pricing
Lite from ~$27/listing/month annual or ~$39 monthly (up to ~3 listings). Pro tailored quote (up to ~199). Enterprise custom (200+). Add-ons (Guesty Pay, Guesty AI, dynamic pricing, etc.) priced separately.

### Why useful for Arconique
Guesty is the reference for the task and automation engine. The lifecycle-event-triggered auto-tasks, the timestamped checklist items, and the central tasks dashboard are the three patterns to copy. Guesty's analytics layer is also the right "where Arconique should be at v3" reference.

## iGMS

### Positioning
The pragmatic, lower-cost option in this trio, popular with hosts and small-to-mid managers who want a competent PMS without enterprise pricing. Per-property pricing instead of feature tiers; honest about being a "do the operational basics very well" tool rather than a full ERP. Strong on auto-assignment of cleaners and lightweight automation that a single ops manager can configure without an implementation consultant.

### Top 3 patterns
1. **Auto-assignment of cleaners by property with role-based team management.** The system assigns cleaners to properties automatically based on rules; eight predefined team roles (cleaner, manager, owner, etc.) define what each user can see and do. Removes the daily "who is doing today's turnover at Villa X" message.
2. **Cleaning tasks auto-created from grouped channels without duplicates.** When the same property is listed on Airbnb + Booking.com + Vrbo, iGMS dedupes turnover tasks across channels, so an ops manager never has three cleaning tasks for one departure. Sounds trivial; in practice it eliminates one of the most common multi-channel ops errors.
3. **Per-property pricing with usage-based scaling.** Charged per active property, with discounts above 20 properties; you only pay for properties once they receive reservations. For a Bali operator onboarding villas in waves, the cost model itself reduces friction - no big-bang seat licensing.

### Pricing
From ~$14/property/month base, Pro from ~$20/property/month, with volume discounts above 20 properties. Pay only when a property receives bookings.

### Why useful for Arconique
iGMS is the reference for a sane SMB-shaped ops product. The auto-assignment of cleaners, the dedupe-across-channels task creation, and the per-property pricing model are the three patterns to copy. iGMS is what Arconique's ops module should feel like at v1; Hostaway/Guesty are the v2/v3 references.

## Top 3 cross-app patterns to adopt

1. **Multi-property calendar grid as the home screen for ops.** All three apps anchor the ops manager's day on a horizontal calendar with one row per villa, color-coded by booking + cleanliness + maintenance status. This must be the Arconique ops manager's default landing view, not a generic "dashboard with KPIs."
2. **Tasks driven by reservation lifecycle events, not manual scheduling.** Auto-create cleaning, inspection, and check-in tasks from check-in/check-out events with ETA/ETD anchoring (Guesty pattern). When a reservation moves, the linked tasks move with it. This removes the largest single source of manual ops work.
3. **Cleanliness / readiness as a first-class status on the property, not a side note.** Hostaway and Guesty both promote "Clean / Dirty / Inspecting" to a property-level field that drives the calendar color and gates check-in. This makes the ops manager's morning question - "which villas are ready?" - answerable in one glance.

## Anti-patterns to avoid

- **KPI-card dashboard as the home screen.** Revenue, occupancy, ADR cards are useful weekly, useless for the day-of operator. The home screen must be the calendar + today's tasks, not a tile wall.
- **Per-channel inboxes.** Forcing the ops manager to swivel between Airbnb, Booking.com, and email is the single biggest source of missed escalations. Unified inbox is non-negotiable.
- **Cleaning tasks duplicated per channel.** If the same departure produces three tasks because the villa is listed on three channels, cleaners miss or double-do work. Dedupe at the property + date level.
- **Tasks scheduled on calendar dates instead of reservation events.** Date-anchored tasks break every time a guest changes their flight. Anchor to check-in/check-out events with offsets.
- **Hiding incident status in chat/comments.** Maintenance and damage incidents need a structured object with status, assignee, vendor, photo, and ETA - not a thread of WhatsApp screenshots pasted into a comment field.
- **Opaque "request a quote" pricing for SMB customers.** Hostaway and Guesty Pro/Enterprise both gate pricing behind sales calls, which slows adoption in SMB markets like Bali villa management. iGMS's published per-property model is the better reference for Arconique.
- **Treating mobile as a parity-with-desktop port.** The ops manager's mobile use is approval, escalation, and spot-check - not full data entry. Mobile screens should be lean, action-oriented, and not attempt to mirror the desktop console.
