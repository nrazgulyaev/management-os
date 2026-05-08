# Project Manager reference apps

Role context: a PM running a Bali villa-construction project. Daily site updates, schedule shifts, RFIs, change orders, photo logs. Hybrid desktop (office) + tablet (site). Manages 20-100 active tasks across 3-10 vendors.

## Procore

### Positioning

Procore is the de-facto enterprise platform for general contractors and owners running multi-million-dollar construction projects. It is known for breadth — daily logs, RFIs, submittals, change orders, drawings, schedules, and budget all in one tightly-integrated suite — and for its mobile-first field tooling that lets superintendents file reports from a phone or tablet without leaving the jobsite.

### Top 3 patterns

- **"Ball-in-court" RFI routing with auto-aging.** Every RFI shows whose action it is blocking right now, with a colored chip and an aging clock. When a question sits with a vendor for 5+ days, the row visually escalates and surfaces in the PM's overdue queue. This eliminates the "who owes whom an answer" thrash that consumes a Bali PM's WhatsApp threads.
- **Mobile daily log with photo + weather + manpower stamping.** A field user opens the app, the log auto-populates date / weather (from the project's GPS) / crew on site from the schedule, and they only add notes + photos. Each photo is timestamped and geo-tagged, so it becomes legal-grade evidence for change orders.
- **Change-order chain linked to RFI + budget line.** A change order is created from the RFI that triggered it, auto-attaches affected drawings, and pushes the cost delta straight onto the line item in the budget. The PM never copy-pastes between modules; the audit trail is automatic.

### Pricing

$$$ — annual contract priced on Annual Construction Volume (ACV); typically $15-30k/year for small GCs ($10-50M ACV), $30-80k+ for mid-size. Unlimited users included.

### Why useful for Arconique

Procore is the gold standard for the "site-truth" loop — RFI, photo log, change order, budget — that Arconique needs for villa construction. Steal the ball-in-court visualization and the auto-stamped daily log; do not copy the enterprise breadth or the steep onboarding.

## Buildertrend

### Positioning

Buildertrend is the leading project tool for residential homebuilders and remodelers — exactly the build profile of a single Bali villa. It is known for being approachable enough that a working foreman can adopt it in a week, while still covering schedules, daily logs, change orders, selections (finish materials), and a client portal in one place.

### Top 3 patterns

- **Drag-and-drop schedule with auto-shift dependencies and vendor notifications.** When the PM drags a task three days later on the Gantt, downstream dependent tasks shift with it, and the vendors on each affected task get an automated push + email with the new dates. This kills the "tile guy showed up two days early because nobody told him concrete slipped" failure mode.
- **Daily log with auto-weather + multi-photo upload from device gallery.** Open the log on a phone, weather is already filled from the site's address, and the user multi-selects photos from the camera roll in one tap. Logs are then shareable with internal team, subs, or the client (owner) with one toggle — solving the "send daily progress to investor" job in-product.
- **Selections (finish-material) board with client approval gating.** Each finish (tile, fixture, paint) is a card with options, prices, and a deadline; the owner approves inside the portal, which freezes the line item and flows the price into the budget. This is exactly the model Arconique needs for villa fitout decisions made jointly with investor-owners.

### Pricing

$$ — flat monthly per company (no per-user fees). Roughly $339/mo Essential, $699-799/mo Advanced, $829-1,099/mo Complete (annual billing). Unlimited users + projects.

### Why useful for Arconique

Buildertrend is the closest reference for "a small team building one or two villas at a time" with an investor-as-client. Steal the auto-shifting schedule with vendor push, the one-tap multi-photo daily log, and the selections-board approval pattern.

## Asana

### Positioning

Asana is the leading horizontal work-management platform — known for its clean task model, multiple views (list / board / timeline / calendar) on the same data, and Portfolios for cross-project rollup. It is not construction-specific, but it is the cleanest reference for how to make 20-100 tasks across 3-10 vendors feel calm rather than chaotic.

### Top 3 patterns

- **One task, four views (list, board, timeline, calendar) with no data duplication.** The PM picks the view that fits the moment — timeline for re-sequencing, board for daily standup, list for bulk edits — and the underlying tasks are the same records. For a villa PM who toggles between scheduling and triage all day, this is the single biggest UX unlock.
- **Portfolio Workload view with drag-and-drop reassignment across projects.** Across a portfolio of 3-5 active villa builds, the PM sees each vendor's load by week and can drag a task to another week or another assignee to rebalance. Capacity bars turn red when a vendor is over-allocated.
- **Rules engine: "when X, do Y" automations on tasks.** When a task is moved to "Blocked," auto-create a follow-up task assigned to the relevant vendor lead and post in the project channel. When a milestone is missed, auto-notify the PM. Cheap automation that turns Asana into a lightweight ops engine — exactly what Arconique should ship for routine site events.

### Pricing

$ to $$ — free for up to 10 users with basic features; Starter ~$11/user/mo, Advanced ~$25/user/mo (annual). Enterprise quote-based.

### Why useful for Arconique

Asana is the reference for *information architecture* — how to model a task once and surface it across views. Steal the multi-view-on-one-record pattern and the rules engine; do not try to compete with construction-specific depth.

## Top 3 cross-app patterns to adopt

1. **One canonical record, multiple views.** A task / RFI / change order is one entity, surfaced as a row in a list, a card on a board, a bar on a Gantt, a marker on a calendar, and a row in a budget table. Edit anywhere, see everywhere.
2. **Auto-stamped field input.** Daily logs, photos, and delivery acceptances should auto-populate context (date, geo, weather, project, crew on schedule today) so the field user only adds the human-judgment delta — notes + photos.
3. **"Ball-in-court" + auto-aging on every blocking item.** Every RFI, change order, and approval shows whose action is blocking it and how long it has been pending. Color escalates with age. This is the single most-cited reason PMs love Procore.

## Anti-patterns to avoid

- **Module silos that force re-entry.** Procore at the wrong configuration makes you re-enter cost data three times. Arconique should pass data by reference — an RFI links to the budget line, a change order links to the RFI, a photo links to both.
- **Desktop-first forms that require typing on a phone.** Anything a foreman or supervisor does daily must be tap, select, photo — not free-text fields and 12-step wizards.
- **Notification floods.** Buildertrend and Asana both ship with overly chatty defaults; users mute everything and miss the real signals. Arconique should default to *digest + escalation*: routine items in a daily digest, only true blockers as push.
- **Vendor portals with separate logins per project.** Vendors working across 3 villas should not log in 3 times. One vendor identity, scoped task list across projects.
