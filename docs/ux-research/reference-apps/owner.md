# Owner / Investor reference apps

Role context: investor / owner. Multiple capital commitments across villas. Wants confidence dashboard: "is my money safe, growing, on schedule?" Reviews quarterly distributions, doc room, capital calls, return projections. Desktop + occasional phone. Read-only mostly, writes only on commit/sign workflows.

## AppFolio Investment Manager

### Positioning
AppFolio Investment Manager is the investor-portal arm of AppFolio's real estate suite, aimed at sponsors raising capital for property funds and syndications. It's known for a polished, white-labeled investor portal that surfaces position-by-position holdings, distribution history, and document access in one dashboard. Strong at automated distribution calculations and end-to-end fundraising workflows (offering page → subscription → e-sign → funded position).

### Top 3 patterns
1. **Position-summary dashboard as the landing page.** When the investor logs in they see a single screen showing total committed, total contributed, total distributed, and current value — broken down per investment with thumbnails. No drilling required to answer "where do I stand?" This is precisely the confidence question Arconique's owner has at quarterly check-ins; the dashboard is the calm-down screen.
2. **Action-items strip surfacing pending items.** The portal dynamically promotes outstanding tasks (sign this subscription, acknowledge a capital call, update wiring info) to the top of the dashboard so the investor never has to hunt for "what does this require of me." For an Arconique owner who logs in monthly, a "1 capital call awaiting acknowledgement" banner at the top is the difference between on-time funding and chasing emails.
3. **Per-asset detail page with photos, valuation, and loan balance.** Each holding has a dedicated page showing property descriptions, photos, location, current valuation, and loan balance — not just a number on a spreadsheet row. Arconique investors are emotionally invested in *specific Bali villas*; showing the asset itself (drone shot, occupancy this quarter, NOI trend) reinforces the "my money is in *that* villa" feeling.

### Pricing
$$$ — enterprise pricing, typically multi-thousand-dollar monthly commitments scaled to AUM. Not published publicly; negotiated per sponsor.

### Why useful for Arconique
AppFolio is the closest analog to Arconique's owner-side scope: capital tracking + per-asset detail + document room + distribution history, all on the same login. The position-summary-as-landing-page is the single most important borrow.

## Juniper Square

### Positioning
Juniper Square is the institutional-grade investor management platform favored by private equity, venture, and commercial real estate fund managers. Known for a sophisticated investor portal, robust fund administration services, and a reporting engine trusted by larger sponsors. The tone is "trusted data room + capital tracker for serious LPs," not the friendly small-syndicator aesthetic of AppFolio.

### Top 3 patterns
1. **Document data room with lifecycle tagging.** Every investor document (subscription doc, K-1, capital call notice, quarterly statement) sits in a structured library tagged by year, fund, and document type, with a "new since last login" indicator. For Arconique, where owners receive 4-6 docs/year per villa across multiple villas, the structured library + new-since-last-visit pattern beats an email-based delivery model that gets lost in inboxes.
2. **Automated capital-call / distribution notice generation with portal sync.** The same workflow that sends the email also updates the portal's transaction ledger and posts the PDF to the doc room — investor and sponsor see the same source of truth. Arconique should mirror this: a capital call is one event that fans out to email, owner ledger, doc room, and acknowledgement task simultaneously, never three separate manual steps.
3. **Secure self-service for sensitive updates (wiring instructions, profile data).** Investors update bank/wire info inside the portal with a secondary approval step; sponsors aren't fielding "please update my account" emails with attached forms. For Arconique this matters for IDR/USD wire details — owners should self-serve with a confirmation flow, not email a PDF to ops.

### Pricing
$$$$ — enterprise. Typically only justifiable for sponsors with $50M+ AUM; pricing is negotiated and not public.

### Why useful for Arconique
Juniper Square shows the institutional bar for trust signals — document structure, audit trails, secondary-approval flows. Arconique doesn't need their full depth, but the doc-room IA and the unified capital-call event model are directly portable.

## RealPage IMS

### Positioning
IMS (acquired by RealPage in 2019) is a real-estate-focused investor management platform that competes head-on with Juniper Square and AppFolio. It's known specifically for its waterfall calculation engine — the rule-based math that splits distributions across LP/GP/promote tiers — and for white-labeled investor portals with iOS/Android mobile apps. Pitched at mid-to-large CRE sponsors.

### Top 3 patterns
1. **Waterfall calculator with transparent tier breakdown.** The platform shows each investor not just "you got $X" but the underlying waterfall logic — pref tier, catch-up, promote split — so sophisticated LPs can verify the math. Arconique villa investors will eventually ask "why is this distribution this size?"; surfacing the calculation tier-by-tier (revenue → expenses → debt service → owner share) builds trust faster than a black-box number.
2. **White-labeled, branded portal.** Every sponsor gets their own logo, color palette, and domain on the investor-facing portal — investors feel they're using *their sponsor's* tool, not a third-party SaaS. For Arconique this is the multi-developer story: each villa-development brand can present a coherent portal to its own owners while running on the same underlying platform.
3. **Mobile app with secure document storage + K-1 / tax-doc auto-upload.** Annual tax documents land in the mobile app automatically with push notification; investors don't chase them via email. Arconique's owners (often international, often on phones) need the same: quarterly statements and Indonesian tax docs pushed to a mobile app with offline document access, not buried in an email thread.

### Pricing
$$$ — enterprise SaaS, custom-quoted. Generally comparable to Juniper Square, scaled to investor count and AUM.

### Why useful for Arconique
IMS's waterfall transparency is the reference for explaining villa-economics math to owners (occupancy, ADR, expenses, owner share). The white-label pattern is also relevant if Arconique ever hosts multiple developer brands.

## Top 3 cross-app patterns to adopt
1. **Position-summary dashboard as the default landing screen.** All three open with "here's where you stand across all holdings" — committed, contributed, distributed, current value, IRR. For Arconique this is the owner's home page, full stop. No nav decisions before they see the answer to their core question.
2. **Action-items / pending-tasks strip pinned to the top.** Capital calls to acknowledge, documents to sign, wire info to update — surface these above the fold so the owner never logs out wondering "did I miss something?" This converts a passive report into an interactive workspace for the rare moments owners *do* need to write.
3. **Unified event model: one capital call = email + ledger entry + doc-room PDF + acknowledgement task.** Juniper Square and AppFolio both treat capital events as atomic — they fan out to every surface automatically. Arconique should commit to this from day one; never let email and portal drift out of sync.

## Anti-patterns to avoid
- **Read-only PDF dump as the "portal."** Many smaller competitors are essentially a document folder with a login. Owners can't see their position, can't track distributions over time, can't act. Arconique must do better than glorified Dropbox.
- **Spreadsheet aesthetic for capital tables.** IMS and AppFolio both default to dense data tables that look intimidating to non-finance owners. Arconique's audience is lifestyle-investor heavy (villa buyers, not LPs); lead with chart + photo, push the table to a "details" tab.
- **Mobile feature parity attempt.** All three cited platforms have "we have a mobile app" but the apps are widely reviewed as cut-down portals that confuse rather than help. Arconique's phone experience should be ruthlessly scoped: balance, latest distribution, pending action, document inbox. Nothing else.
- **Hidden math in distributions.** Without a tier breakdown, a single distribution number erodes trust the moment an owner does back-of-envelope math and gets a different answer. Always show the working — revenue, costs, debt service, owner share, distribution amount — not just the final number.
- **Login friction on every visit.** Quarterly-frequency users forget passwords; aggressive 2FA without magic-link/biometric fallback drives users back to email. Use phone biometric + magic link as the default for read-only access; reserve full auth for write actions (sign, acknowledge, update wire).
