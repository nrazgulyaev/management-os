# Marketing reference apps

Role context: marketing/sales manager running a Kanban funnel for direct-booking inquiries (Inquiry → Hold → Quoted → Booked → Stayed). Daily volume 10-50 leads. Wants attribution: which channel converted. Desktop primary.

## HubSpot CRM (Free + Marketing Hub)

### Positioning
HubSpot is the de facto CRM for SMBs that want a free starting point that scales into a full marketing/sales/service suite. It's known for the tight loop between forms-on-website, contact records, deal pipelines, and reporting — every lead has an enriched timeline showing pageviews, emails, and meetings without manual logging. The free tier is generous enough to run a real funnel; paid Marketing Hub tiers add automation, attribution, and multi-pipeline support.

### Top 3 patterns
1. **Deal-stage Kanban with required fields per stage.** Each stage in the deal pipeline can enforce mandatory properties before a card can advance (e.g. "Quoted" requires quote amount + expiry date). This eliminates the "ghost deals" problem where reps drag cards forward without filling in critical data — directly applicable to forcing villa/dates/quote on Arconique's Hold→Quoted transition.
2. **Original-source attribution baked into the contact record.** Every contact carries an immutable `Original Source` + `Source Drill-Down` property captured at first touch (Organic Search, Paid, Direct, Referral, Offline). Reports group revenue by source without manual tagging — exactly the channel-attribution view Arconique needs to know whether Instagram or Google drove a booking.
3. **Timeline view per contact/deal.** A unified chronological feed of every email, form submission, page view, note, and stage change against one record. The marketing manager can answer "what happened with this inquiry?" in one scroll instead of jumping between tabs — critical for a high-volume inbox where 10-50 inquiries collide daily.

### Pricing
Free tier (2 paid seats, 1 pipeline). Marketing Hub Starter ~$/mo, Professional $$$, Enterprise $$$$. Most SMBs live on Free + Starter.

### Why useful for Arconique
HubSpot is the gold standard for "lead → deal → revenue" attribution wired into a Kanban — Arconique's funnel is structurally identical, just with villas-and-nights instead of SaaS contracts. The required-fields-per-stage pattern is the single highest-leverage borrow.

## Pipedrive

### Positioning
Pipedrive is the sales-rep-first CRM, built around a single visceral idea: a Kanban pipeline you live inside all day. It's narrower than HubSpot — no marketing automation suite — but the pipeline UX is more refined, with deal-rotting indicators, weighted forecasts, and activity-based selling baked in. Targets small sales teams who want to close deals, not configure a CRM.

### Top 3 patterns
1. **Deal Rotting (idle-deal warnings).** Each pipeline stage has a configurable "max days idle" — deals exceeding it visually flag (red/orange tint on the card) so the rep sees stalled inquiries at a glance. This is exactly the "guest asked about Christmas weeks and we never replied" failure mode the marketing manager fears; surfacing it on the board prevents dropped revenue.
2. **Activity-next-step on every card.** Every deal must have a single "next activity" (call, email, follow-up) with a date — cards without one show as overdue/empty. The board becomes a to-do list ordered by deal stage, not a passive archive. For Arconique's daily 10-50 lead volume this is how you stop losing track of who's waiting on a quote.
3. **One-click stage probability + weighted forecast.** Each stage has a default probability (Hold 30%, Quoted 60%, Booked 100%); the pipeline header shows weighted pipeline value in real time. The marketing manager can answer "what's our expected revenue this month?" without exporting to a spreadsheet — and tune probabilities once they have data.

### Pricing
$ — $14-29/user/mo (Lite/Growth) covers most needs; $$ Premium/Ultimate for forecasting and team management. No free tier (14-day trial).

### Why useful for Arconique
Pipedrive shows what a Kanban looks like when it's the *only* surface a user touches — every card carries enough urgency and forecast metadata to drive the day. Borrow the rotting indicator and the next-activity requirement; ignore the heavier sales-team plumbing.

## Trello

### Positioning
Trello is the original consumer Kanban — Boards → Lists → Cards, drag-and-drop, almost zero learning curve. It's not a CRM, but it's a reference for *interaction quality*: how a card flips open, how labels filter the board, how Butler automations fire on stage moves. Used heavily by small teams who reject heavyweight tools.

### Top 3 patterns
1. **Label-as-filter for channel/source tagging.** Colored labels (Instagram, Direct, Booking.com, Referral) double as both visual markers on the card and one-click board filters — clicking a label header isolates only those cards. For Arconique's channel-attribution need this is a far lighter pattern than building a full reporting tab; the manager filters the live board to see "all Instagram leads in Hold."
2. **Butler automations on stage move.** When a card moves to "Quoted," Butler can auto-set a 3-day due date, post a comment, assign the rep, and add a "follow-up" label — all configured by the user, no code. Arconique's funnel has predictable side-effects per stage transition (send quote PDF, schedule follow-up, log to attribution); this is the cleanest UX precedent for exposing those automations.
3. **Card-back as a long-form workspace.** Clicking a card opens a detail panel with checklists, attachments, comments, activity log, and custom fields — without leaving the board. The Kanban stays the home base; depth lives in the slide-out. Arconique's inquiry cards need the same: villa/dates/quote/messages/notes all reachable without a route change.

### Pricing
Free (10 boards, 250 automation runs/mo) → Standard $5-6/user/mo → Premium $10-12.50 → Enterprise $17.50.

### Why useful for Arconique
Trello is the interaction-design reference, not the feature reference. When deciding what dragging a card *feels* like, what a label-filter chip looks like, and how a card-back panel slides over the board, Trello's UX has been copied for a reason — borrow the motion and density, not the data model.

## Top 3 cross-app patterns to adopt
1. **Required fields per stage transition.** All three (HubSpot explicitly, Pipedrive via mandatory activities, Trello via Butler validation) gate forward motion on data completeness. Arconique should require villa+dates+quote-amount on Hold→Quoted and a payment confirmation on Quoted→Booked.
2. **Idle-deal / rotting indicator on every card.** A red dot or tint on cards that have sat in-stage past a threshold (Pipedrive's signature, Trello via Butler, HubSpot via workflows). At 10-50 leads/day this is the difference between a healthy pipeline and a graveyard.
3. **Channel/source attribution as a first-class card property + filter.** HubSpot's Original Source + Trello's label filters together = Arconique's answer to "which channel converted." Capture source at lead creation, expose as both a card chip and a board filter, roll up to a simple revenue-by-source report.

## Anti-patterns to avoid
- **Over-configuration on day one.** HubSpot's "configure 30 properties before you can use it" is a known onboarding cliff. Arconique should ship 5-7 stages and ~6 card fields, not 20.
- **Hidden automation magic.** Trello Butler rules silently firing without a visible audit trail confuses users when something "just happens." Every automation must surface a comment/log entry on the card.
- **Mobile parity ambition.** Pipedrive and HubSpot mobile apps are widely cited as the weakest part of each product because they tried to mirror the desktop board. Arconique is desktop-primary; don't waste cycles on a phone Kanban — phone should be a read-only inbox notifier.
- **Reports as a separate destination.** All three force you to leave the board to see funnel metrics. Arconique should put conversion rate and revenue-by-source as a thin strip *on top of* the board, not in a separate /reports route.
