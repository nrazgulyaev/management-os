# Guest Stay Portal — pixel build prompt

> **Read `../00-MASTER.md` first** for the global contract (tokens, primitives-first, no inline styles,
> the pixel-verify loop). This file is the orientation for the guest-facing stay portal.

> ⚠️ **Scope note.** Per `CLAUDE.md`, the `(guest)` stay portal is **"Field/Guest get their own UI
> later"** — NOT in the current redesign wave. The repo already has **28 `(guest)` pages**
> (check-in, concierge, services, wifi, emergency, guide, requests). This prompt is for when that wave
> is greenlit. Confirm with the product owner before building.

## Source of truth
- **Mockup (pixel target):** `Guest Stay Portal.html` (project root)
- Mobile-first, **390px** reference width. The guest opens this via a magic link (`/stay/[code]`) — **no
  login**, no dashboard chrome. It is a lightweight public surface, not a cabinet.

## Product / palette — NEW lightened-hospitality theme (not a dashboard palette)
This is **not** `[data-product="management"]` density. It reuses the Mgmt *hues* but airier + larger:
```
Surfaces  paper #FFFCF7 · cream #F7F2E9 · sand #FAF6EE (app bg)
Ink       #1B2A25 / #3A4D47 / #6B7B75 / #9AA7A1
Brand     forest #1F3A33 · terra #C4583C (accent) · gold #BC9A5C · sage #88A89A
Lines     #E7DECB / soft #F0E9D9
Radii     generous — card 22 · lg 28 · hero 32 · pill 999
Type      Newsreader (display, large) · Inter (body) · JetBrains Mono (eyebrows)
```
Decide with the team whether this lands as a new `[data-product="guest"]` token set or a standalone
public-site theme. It must **not** pollute the dashboard Layer-B palette.

## Sub-screens to deliver (8 — pixel-match each)
- **Stay home** — TWO variants in the mockup (toggle top-right):
  - **A · editorial** — full-bleed villa hero, serif greeting, countdown-to-arrival card, calm service list, stay timeline.
  - **B · concierge-forward** — greeting + weather, "next up" card, quick-action grid, plan-of-day timeline, concierge nudge.
  - Ship the one the team picks (or both as an A/B). Don't merge them into a compromise.
- **Online check-in** — 4-step stepper (mockup shows step 3: guests + passport scan + ETA chips).
- **Concierge** — chat thread; includes an **auto-assistant** bubble (terra-tinted) distinct from the human concierge. Composer pinned bottom.
- **Services** — category chips + service cards (breakfast/spa/transfer/chef/cleaning/groceries) + cart CTA.
- **Villa guide** — Wi-Fi card (copy password), in-home rows, house rules.
- **Requests** — new-request CTA + active/done request cards with status badges.
- **Emergency / contacts** — call-manager banner + contact rows (manager/police/ambulance/driver) + villa address.
- **Nearby / explore** — map with pins + category chips + place cards (distance + rating).

## Navigation
- Bottom tab bar: **Stay · Services · Concierge · Explore · Guide** (5 tabs).
- Floating **SOS** button (hidden on concierge + emergency screens).
- Check-in is a full-flow screen (tab bar hidden); Requests/Emergency reached from home.

## Repo wiring (when greenlit)
- Guest message stacks already exist: `guest_ai_concierge_sessions/messages/runs` (mig 0018),
  `direct_booking_guest_message_threads` (0031), `guest_ai_handoffs` (0019/0020). The concierge screen
  binds to these — **agent attribution must be stripped from guest-facing copy** (critical UX rule).
- Check-in / services / requests map to the existing `(guest)` routes — read them before restyling.

## Gotchas
- **No dashboard density.** Hit targets ≥44px, large type, generous whitespace — this is a guest, not an operator.
- The hero in the mockup is an inline styled SVG (sunset + palms). In production swap for a **real villa
  photo** (the booking's villa hero image); keep the gradient scrim for text legibility.
- Emergency numbers (Bali police 110, ambulance 118/119) are real — keep locale-correct per property.

## Acceptance (in addition to MASTER §7)
- [ ] All 8 screens visually match the mockup at **390px**.
- [ ] Chosen home variant matches exactly; tab bar + SOS behavior matches.
- [ ] New theme tokens live in their own scope, not mixed into dashboard Layer B.
- [ ] Concierge auto-assistant vs human distinction preserved; agent name hidden from guest copy.
- [ ] Public, no-login route; works on a cold magic-link open.
