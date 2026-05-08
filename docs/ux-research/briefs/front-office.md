# Front Office brief — Stage 10.K

**Status:** draft (interviews pending)
**Last updated:** 2026-05-08
**Stage 10 phase consumer:** 10.K Front Office Journey Timeline
**Existing surfaces (codebase):**
- `/development-os/reservations`
- `/development-os/channels` + `/channels/calendar`, `/channels/inbox`, `/channels/conflicts`
- `/development-os/inbox`, `/inbox/[threadId]`, `/inbox/templates`, `/inbox/auto-responses`
- Direct booking flow at `/book/hold/[token]` (guest-facing) + ops surfaces
- Server actions: `src/lib/development/server/reservations/*`, `src/lib/development/server/channels/*`
- Existing role: `concierge`, `booking_manager`

---

## 1. Who is this person?

- **Title variants:** Front Office Manager, Reservations Manager, Concierge, Guest Services
- **Tenure / skill profile:** 3-10 years hospitality; sometimes shift-rotating; multilingual a plus
- **Device profile:** desktop at front desk (primary); phone for floor patrols + after-hours coverage
- **Working context:** day shift (08-20) vs. night shift (20-08); volume peaks at check-in/out windows
- **Volume:** 5-20 active stays per villa cluster; daily checklist around arrivals/departures
- **Reports to:** GM / operations manager. Coordinates: housekeeping, maintenance, F&B vendors.

## 2. Top-3 daily tasks (placeholder — interviews to confirm)

1. **Day-of arrivals/departures dashboard** — who's arriving, who's leaving, what's prepped
2. **In-stay request handling** — guest texts / calls; dispatch to housekeeping / maintenance / F&B
3. **Check-in / check-out execution** — ID, payment confirmation, key handoff, briefing

## 3. Friction (verbatim from interviews — TBD)

> "{quote}" — placeholder

Pattern hypothesis: front office juggles guest-facing communication, internal coordination, and operations status — often in 5+ tools (channel inbox, WhatsApp, paper checklist, email, walkie). Single timeline view per guest is missing.

## 4. Refusal points (hypothesis — verify in interviews)

- Tabs that hide whether guest has paid / signed / IDed
- Manual handoff between shifts (must be persistent in tool)
- Auto-message workflows that send without preview
- Channel inbox separated from direct inbox

## 5. Reference-app patterns to adopt

From `docs/ux-research/reference-apps/front-office.md` (research complete):
- **Pattern A** (Mews / Cloudbeds) — guest journey timeline: pre-arrival → check-in → in-stay → check-out → post-stay; status badge per phase
- **Pattern B** — required-fields-per-stage gate (e.g. "cannot check in without ID + signed agreement + payment")
- **Pattern C** — auto-message-with-edit-before-send (lifecycle triggered, but human approves)

Anti-patterns:
- "Reservation list" without timeline view
- Per-channel inbox (must unify)
- Send-now automation that surprises the guest

## 6. Proposed flow (sketch — fill from interviews)

### Flow 1: Day-of cockpit

```
/cabinets/front-office (NEW) → 
  Top: today indicator
  3 columns:
    [Arriving today]   [In-house]      [Departing today]
    GuestA 14:00 ✓ID   GuestC night 3  GuestE 11:00 ✓bill
    GuestB 16:00 ⚠pay  ...             ...
  Click guest → journey timeline (Flow 2)
```

### Flow 2: Per-guest journey timeline

```
[ Inquiry ]──[ Hold ]──[ Quoted ]──[ Booked ]──[ Pre-arrival ]──[ Check-in ]──[ In-stay ]──[ Check-out ]──[ Reviewed ]
  ✓             ✓         ✓           ✓          ✓ ID, payment    [ pending ]    

Below:
  Required for next step:
    □ ID uploaded
    □ Damage deposit captured
    □ Welcome message sent
  Each gated by required-fields rule
  
  Right side: full message thread (unified channels)
```

### Flow 3: Shift handoff

```
End of shift → "Print/send handoff brief" → 
  Auto-summary: arrivals served, departures, in-flight requests, escalations
  Adds shift-handoff note (free text)
  Visible to next shift on cockpit open
```

## 7. Acceptance criteria (consumed by Stage 10.K)

- [ ] Front office sees day-of cockpit in <2 seconds page-load (cached + Stage 9.I optimizations)
- [ ] Per-guest timeline renders all 9 lifecycle stages with status badges
- [ ] Required-fields-per-stage gate prevents check-in without ID + payment + signature
- [ ] Unified inbox merges direct + channel inboxes per reservation
- [ ] Auto-message templates require human preview-and-send (no surprise sends)
- [ ] Shift handoff brief auto-generates in <10 seconds (covers 8h of activity)

## 8. Out of scope for Stage 10

- Smart-lock integration (third-party hardware) — Stage 11+
- AI auto-reply to in-stay requests — exists via existing AI agents (Tier 2)
- Upsell engine ("offer airport transfer at booking") — Stage 11 candidate
- Multilingual auto-translation in inbox — Stage 11

## 9. Open questions

- How are shifts split — fixed schedule or floating?
- How much do front office staff use WhatsApp Business vs. SMS vs. in-app inbox?
- Is the night-shift workload light enough that a single dashboard suffices, or do they need a different mode (e.g. emergency-focused)?

---

## Provenance

- Reference-app catalog: `docs/ux-research/reference-apps/front-office.md`
- Interview synthesis: `docs/ux-research/interviews/front-office/synthesis.md` (pending — 3-5, day + night shifts)
