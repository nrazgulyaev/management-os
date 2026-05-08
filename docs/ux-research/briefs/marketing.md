# Marketing brief — Stage 10.I

**Status:** draft (interviews pending)
**Last updated:** 2026-05-08
**Stage 10 phase consumer:** 10.I Marketing Kanban Funnel
**Existing surfaces (codebase):**
- `/development-os/marketing` — landing
- `/development-os/marketing/dashboard`
- `/development-os/marketing/campaigns`, `/marketing/content`, `/marketing/connections`
- `/development-os/marketing/conversions`, `/marketing/conversations`, `/marketing/manager-performance`
- `/development-os/marketing/lead-sources`, `/marketing/attribution`
- `/development-os/sales`, `/development-os/inbox`
- `/development-os/cabinets/marketing-staff`, `/cabinets/sales-manager`
- `/development-os/reports/sales-funnel`
- AI agent: `marketing_assistant` (Tier 2)
- Server actions: `src/lib/development/server/marketing/*`, `src/lib/development/server/sales/*`

---

## 1. Who is this person?

- **Title variants:** Marketing Manager, Sales Manager, Reservations Manager, Booking Coordinator (overlap)
- **Tenure / skill profile:** 3-10 years; uses HubSpot / Pipedrive / Trello / WhatsApp Business
- **Device profile:** desktop primary, phone heavy for inquiry response speed
- **Working context:** office; responsiveness-driven (must reply to inquiries within an hour to win bookings)
- **Volume:** 10-50 leads/day at peak; converts 5-15% to bookings; manages campaigns + content + influencer/agent relationships
- **Reports to:** GM / director. Often solo or pair.

## 2. Top-3 daily tasks (placeholder — interviews to confirm)

1. **Inquiry triage + first response** — currently WhatsApp + email, sometimes Booking.com inbox
2. **Quote → hold → book pipeline movement** — currently spreadsheet or memory
3. **Attribution review** — which channel / influencer / campaign produced that booking — currently manual

## 3. Friction (verbatim from interviews — TBD)

> "{quote}" — placeholder

Pattern hypothesis: leads come in across 5+ channels (Direct site, Booking.com, Airbnb, Instagram DM, WhatsApp, Agent referrals). They get triaged in the channel they arrived in. Attribution is reconstructed weekly.

## 4. Refusal points (hypothesis — verify in interviews)

- Pipeline UI that doesn't unify channels (one inbox > N inboxes)
- Manual stage transitions (auto-detect "they paid the deposit" → move to Booked)
- Attribution with arbitrary windows (must be configurable: first-touch / last-touch / multi-touch)
- Quote builder slower than typing in WhatsApp directly

## 5. Reference-app patterns to adopt

From `docs/ux-research/reference-apps/marketing.md` (TBD):
- **Pattern A** — Kanban funnel: Inquiry → Hold → Quoted → Booked → Stayed → Reviewed; drag cards between columns; SLA timer per card
- **Pattern B** — unified inbox: WhatsApp + email + channel-manager DMs in one thread, with channel-source badge per message
- **Pattern C** — quote builder inline in inbox: pick villa + dates → auto-priced via dynamic pricing → "send" inserts as message

Anti-patterns:
- Switching apps to compose a reply
- Attribution that hides paid vs. organic split
- Funnel without SLA aging color

## 6. Proposed flow (sketch — fill from interviews)

### Flow 1: Kanban inbox (target: respond to new lead in ≤5 min — current ≥30 min)

```
/marketing/dashboard → 
  Top: SLA aging widget (X leads waiting > 1h)
  Kanban: [Inquiry] [Hold] [Quoted] [Booked] [Stayed]
  Card: name, source badge, villa, dates, $ value, last-message preview, age timer
  Drag to next column → updates status + sends auto-message ("Your villa is held until X")
  Click card → side panel: full thread + quick actions [send template] [send quote] [escalate]
```

### Flow 2: Quote in 30 seconds

```
In thread, type "/quote" → autocomplete:
  Villa, Check-in, Check-out, Guests, Promo
  Auto-fills price from dynamic pricing engine
  Preview message → send → moves card to "Quoted"
```

### Flow 3: Attribution review

```
/marketing/attribution → 
  Toggle: first-touch / last-touch / linear / position-based
  Sankey: source → stage → outcome
  Click flow → list of contributing leads with $ + conversion %
  Compare period MoM
```

## 7. Acceptance criteria (consumed by Stage 10.I)

- [ ] Marketing manager moves a lead through the full funnel in ≤8 clicks (not counting message composition)
- [ ] Unified inbox surfaces ≥4 channels (Direct / Booking / Airbnb / WhatsApp) in one thread
- [ ] Quote sent in ≤30 seconds from inquiry message (with dynamic-pricing auto-fill)
- [ ] SLA aging visible on every card; >1h shows amber, >4h red
- [ ] Attribution toggles between ≥3 models without page reload
- [ ] AI agent `marketing_assistant` can suggest reply templates from prior winning conversions

## 8. Out of scope for Stage 10

- Outbound campaign builder (existing `/marketing/campaigns` covers it)
- Influencer payout management (overlap with finance)
- Programmatic ad-spend optimization — Stage 11+
- Cross-channel deduplication (same guest across email + IG) — Stage 11

## 9. Open questions

- What's the actual SLA expectation in this market — 30 min, 1 hour, 4 hours?
- How much WhatsApp volume vs. email vs. channel-manager DMs?
- Do they pay channel managers (Hostaway/Guesty) per booking, and would replacing those tools affect commission flow?

---

## Provenance

- Reference-app catalog: `docs/ux-research/reference-apps/marketing.md`
- Interview synthesis: `docs/ux-research/interviews/marketing/synthesis.md` (pending — 2-3)
