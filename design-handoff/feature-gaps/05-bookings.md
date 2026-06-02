# Feature gap · 05 · Bookings (Mgmt P1)

> ## ⚠️ GROUND-TRUTH CORRECTION (2026-05-29 · GitHub pull · see `_ground-truth-2026-05-29.md`)
> Built very deep. Route `/dashboard/bookings`: `page.tsx` **12.6kb** + `[id]` (9kb · `charges/[chargeId]` · `edit` · `guest-stay` 12.8kb) + `calendar` + `new` + `rates`(+`[id]/seasons`/`overrides`/`quote`) + `sync`. Feature: `bookings/` + `booking-automation/`. **Discard "not built".** Surviving real gap: the **`arrival-prep` agent is fiction** (shared with cab 08) — confirmed not in `agent_configurations`; the design's arrival-prep flow maps to `operation_tasks (task_type='arrival_inspection')`, not a new agent or table.

**Design sources**
- Desktop: `cabinets/mgmt-p1/bookings.html` — 8 sections (intro, anatomy/IA, hero strip, screen 1 list, screen 2 detail w/ 6 bricks, flow A create, flow B cancel, claude-code handoff)
- Mobile: `mobile-pass-mgmt-p1.html` § cabinet 01 (not separately audited)
- Phase: 2.2 mgmt-01 · commit `8c05a9a`

**Repo paths (imported)**
- Feature data: `src/features/bookings/{actions,bookings-cabinet-queries,cancellation-policy,form,row-tone,schema,services}.ts` — 7 files
- Components: `src/components/bookings/{add-charge-modal,arrival-calendar,booking-add-button,cancel-booking-modal,channel-pill,extend-stay-modal,refund-charge-modal}.tsx` — 7 files
- Routes: `src/app/(dashboard)/dashboard/bookings/` — 19 files incl. `[id]/{page,edit,guest-stay,charges/[chargeId]}`, `calendar/`, `new/`, `rates/{page,quote,[id]/{page,seasons,overrides},new}`, `sync/`, `_command-actions.ts`, `_list-client.tsx`, `_new-booking-cta.tsx`
- Schema: `bookings`, `booking_channels`, `guests` (mig 0000), `direct_booking_*` (migs 0027-0031)
- Agents: **no dedicated `_repo/src/features/ai-agents/bookings/` folder**; `arrival-prep` agent referenced in operations.html as "shared with Bookings cabinet"

## TL;DR

Bookings is the **most operationally complete cabinet in the audited set on every axis**: 7-file feature folder including real `services.ts` (158 lines, real Drizzle joins to villas/channels/guests with mock fallback), 14.6kb `bookings-cabinet-queries.ts` (vs other cabinets' stub queries.ts), full 19-file route tree covering list + detail + edit + charges + guest-stay + calendar + sync + rates sub-cabinet, all 7 component modals shipped, plus 3 polished pure modules — `cancellation-policy.ts` (100/50/0 ladder + director override), `row-tone.ts` (4-state arrival/departure/instay/cancelled), `schema.ts` (Zod with cross-field refine for check-in < check-out). **This is the cabinet most other Mgmt cabinets reference** (Operations.html flags "arrival-prep · shared with Bookings", Concierge gets its thread anchor from `bookings.id`, Channels treats bookings as the cell-blocker). The gap profile is narrow: **no dedicated booking-side agent code**, no per-booking AI surfaces, the design's "today's arrivals + departures" hero strip (sec 2.1) isn't a separate component (likely inlined or absent), and the rates sub-cabinet (7 routes) lives here but actually belongs to Dynamic Pricing (cabinet 03 — gates on the missing `rate_cells` table).

---

## Section-by-section

### Intro · "The operational heart" (~250 live bookings · 41 villas · 4 channels)

| Element | Design | Repo | Status | Priority |
|---|---|---|---|---|
| Cabinet positioning as ops-first triage surface | designed | matches code shape — routes are list-first, deep links to triage flows | ✅ | — |
| Multi-channel intake (Airbnb / Booking / Agoda / Direct) | designed | `booking_channels` shipped ✅, `services.ts` joins to it for channel name/key | ✅ | — |
| Travel-agent intake (1 channel) | designed | `booking_channels` seed includes `agent` type ✅ | ✅ | — |

### Anatomy · Information architecture

| Element | Design | Repo | Status | Priority |
|---|---|---|---|---|
| List → detail navigation | designed | `_list-client.tsx` + `[id]/page.tsx` shipped ✅ | ✅ | — |
| Detail tabs (overview / charges / guests / activity) | designed | `[id]/page.tsx` + `[id]/charges/[chargeId]/page.tsx` + `[id]/guest-stay/page.tsx` shipped ✅ | ✅ | — |
| Rates sub-cabinet under `/bookings/rates` | designed (sub-page) | 7 routes shipped under `rates/` ✅ — but ownership belongs to dynamic-pricing cabinet | 🟡 wrong cabinet | 💭 P2 (move) |
| Sync sub-page under `/bookings/sync` | designed | `sync/page.tsx` shipped ✅ — channel-sync log surface | ✅ | — |
| Calendar sub-page under `/bookings/calendar` | designed | `calendar/page.tsx` shipped ✅ | ✅ | — |

### Hero strip · "Today's arrivals + departures"

| Element | Design | Repo | Status | Priority |
|---|---|---|---|---|
| Above-list strip showing 7-day arrival/departure counts | designed | `arrival-calendar.tsx` component exists (1295 bytes — small) | 🟡 unclear if hero strip or per-day cell | ⭐ P1 |
| Day-cell click → list filter applied to that date | designed | `_list-client.tsx` (9382 bytes) likely handles filter; arrival-calendar wires | 🟡 likely shipped | ⭐ P1 |
| Visible only when filter view = "This week" | design constraint | not verified | 🟡 unclear | 💭 P2 |

### Screen 1 · Bookings list

| Element | Design | Repo | Status | Priority |
|---|---|---|---|---|
| Template 04 list layout | designed | `_list-client.tsx` shipped ✅ — large file (9382 bytes) | ✅ shipped | — |
| Row tone (arriving / departing / instay / cancelled) | designed | `row-tone.ts` pure fn ✅ — 4 states + undefined for neutral | ✅ shipped | — |
| Channel pill (dedicated column) | designed | `channel-pill.tsx` shipped ✅ | ✅ shipped | — |
| Currency-formatted gross right-aligned | designed | typed on `BookingListRow.grossAmount/currency` in services.ts ✅ | ✅ shipped | — |
| Filter chips (status · channel · villa · date range) | designed | filter wiring in `_list-client.tsx` not inspected | 🟡 likely shipped | ⭐ P1 |
| Bulk actions (mark-confirmed, etc.) | implied | not surfaced | 🔴 design only | 💭 P2 |
| Command-palette quick-actions | designed (Phase 2.1 ⌘K) | `_command-actions.ts` shipped ✅ — bookings-scoped actions in palette | ✅ shipped | — |

### Screen 2 · Booking detail (Template 05, 6 bricks)

| Element | Design | Repo | Status | Priority |
|---|---|---|---|---|
| B1 Header | designed | shipped in `[id]/page.tsx` | ✅ likely | — |
| B2 Tabs (overview / charges / guests / activity) | designed | overview = page.tsx, charges = `charges/[chargeId]/page.tsx`, guests = `guest-stay/page.tsx`; activity tab routing not visible separately | 🟡 partial | ⭐ P1 |
| B3 Main panel | designed | shipped | ✅ likely | — |
| B4 Side panel | designed | shipped | ✅ likely | — |
| B5 Related (linked items: villa · channel · guests · ops tasks) | designed | shipped per detail-client | ✅ likely | — |
| B8 Sticky bar (action shelf) | designed | shipped per Phase 2.1 brick pattern | ✅ likely | — |
| Detail-client (Phase 2.1 InlineEdit + useDetailForm) | designed | `_detail-client.tsx` shipped ✅ | ✅ shipped | — |
| Edit page (separate route vs inline) | designed | `[id]/edit/page.tsx` shipped — dedicated edit route | ✅ shipped | — |
| Activity timeline / audit log inline | designed | not surfaced as a separate route; likely inlined in B5 | 🟡 unclear | ⭐ P1 |

### Flow A · Create new booking

| Element | Design | Repo | Status | Priority |
|---|---|---|---|---|
| Page at `/bookings/new` | designed | `new/page.tsx` shipped ✅ | ✅ | — |
| 7-field form (villa · channel · guest · dates · status · gross · notes · fees) | designed (locks final field set as 7) | `schema.ts` enumerates 13 fields (villaId · channelId · guestId · bookingCode · sourceReference · status · checkIn · checkOut · adults · children · currency · grossAmount · cleaningFee · channelFee · paymentFee · notes) — superset of design's 7 | 🟡 broader than design | 💭 P2 |
| Validation (check-out > check-in) | designed | `.refine()` clause in `createBookingSchema` ✅ | ✅ shipped | — |
| Default status = confirmed | designed | `status.default("confirmed")` ✅ | ✅ shipped | — |
| Currency default USD | implied | `currency.default("USD")` ✅ | ✅ shipped | — |
| Server action handler | designed | `actions.ts` (6920 bytes) + `form.tsx` (8028 bytes) shipped ✅ | ✅ shipped | — |
| Booking-code unique check | designed | `bookings.booking_code` UNIQUE constraint in mig 0000 ✅ | ✅ schema | — |

### Flow B · Cancel booking with refund

| Element | Design | Repo | Status | Priority |
|---|---|---|---|---|
| Modal-confirm pattern (destructive, sm-confirm) | designed | `cancel-booking-modal.tsx` shipped ✅ (2768 bytes) | ✅ shipped | — |
| Refund ladder (100% &gt; 14d / 50% 7-14d / 0% &lt; 7d) | designed | `cancellation-policy.ts.computeRefund()` ✅ — pure fn matches design ladder verbatim | ✅ shipped | — |
| Director override → 100% | designed | `directorOverride: true` branch → `reason: "director-override"` ✅ | ✅ shipped | — |
| Real refund amount displayed | designed | `RefundResult.amount` + `pct` + `reason` ✅ | ✅ shipped | — |
| Reverse-deltas on linked finance | designed | linkage to finance not visible in this cabinet's code | 🟡 cross-cabinet | ⭐ P1 |
| Channel-specific overrides (Airbnb's policy) | designed (deferred) | comment in code says "today the function treats every channel identically" — flagged as 2.2 data feature | 🟠 future | ⭐ P1 |
| Refund-charge modal (separate from cancel) | implied (one for charge-level refund) | `refund-charge-modal.tsx` shipped ✅ | ✅ shipped | — |

### Sub-flows surfaced in components

| Element | Design | Repo | Status | Priority |
|---|---|---|---|---|
| Add charge to booking (mid-stay extras) | designed (implied by tabs) | `add-charge-modal.tsx` shipped ✅ | ✅ | — |
| Extend stay (push check-out forward) | designed (implied) | `extend-stay-modal.tsx` shipped ✅ | ✅ | — |
| Arrival calendar (per-day arrivals view) | designed | `arrival-calendar.tsx` shipped ✅ | ✅ | — |

### Rates sub-cabinet (7 routes under `/bookings/rates`)

| Element | Design | Repo | Status | Priority |
|---|---|---|---|---|
| Rates index `/rates/page.tsx` | designed | shipped ✅ — 4120 bytes | ✅ shipped | — |
| Rate plan detail `/rates/[id]/page.tsx` | designed | shipped ✅ — 4982 bytes | ✅ | — |
| Rate plan seasons `/rates/[id]/seasons/page.tsx` | designed | shipped ✅ — 2257 bytes | ✅ | — |
| Rate plan overrides `/rates/[id]/overrides/page.tsx` | designed | shipped ✅ — 2894 bytes | ✅ | — |
| New rate plan `/rates/new/page.tsx` | designed | shipped ✅ — 1033 bytes | ✅ | — |
| Quote test `/rates/quote/page.tsx` | designed | shipped ✅ — 6572 bytes (quote preview UI) | ✅ shipped | — |
| **Ownership question** | — | this whole rates sub-tree should belong to cabinet 03 (Dynamic Pricing), but lives under bookings routes | 🟡 architecture | 💭 P2 |

---

## Cross-cutting

### Data wiring

| Concern | Status |
|---|---|
| `listBookings()` reads from DB with joins | ✅ real Drizzle (villas + booking_channels + guests inner+leftJoins) with mock fallback |
| `bookings-cabinet-queries.ts` (14.6kb) | ✅ presumably real queries (not inspected line-by-line; size implies real implementation vs other cabinets' stub queries) |
| Create / update / cancel via actions.ts | ✅ shipped (6.9kb) |
| Form validation via Zod schema | ✅ shipped |
| Pure modules (cancellation policy + row tone) | ✅ shipped |

### Agents

| Agent | Declared | Real impl | Notes |
|---|---|---|---|
| `arrival-prep` | designed (per operations.html) | **🔴 not in `_repo/src/features/ai-agents/`** for bookings | "shared with Bookings cabinet · writes to `arrival_prep_checklist` table" |

This is the ONLY agent gap for bookings. The cabinet doesn't have dedicated AI surfaces in its design — most AI lives in adjacent cabinets (front-office for check-in, concierge for in-stay, finance for statements).

### Cross-cabinet dependencies

| Cabinet | Dependency | Direction | Status |
|---|---|---|---|
| 01 front-office | reads `bookings` for today's arrivals/departures | front-office reads bookings | ✅ |
| 02 channels | bookings block `rate_cells` (sec 08 channels FSM `booked` state) | channels read bookings | ✅ (model honoured) |
| 03 dynamic-pricing | bookings exclude from quotable nights | dynamic-pricing reads bookings | ✅ |
| 04 concierge | concierge_requests anchor to booking_id | concierge reads bookings | ✅ |
| 06 finance / statements | bookings → revenue_lines for statement engine | finance reads bookings | ✅ |
| 08 operations | `arrival_prep_checklist` rows per booking | operations reads bookings | ✅ |

Bookings is the **most-depended-on cabinet**. Schema is stable; every downstream cabinet has already wired against `bookings.id`. This is what makes bookings high-value to land well — the FK contract has been honoured platform-wide.

### Schema completeness

| Concern | Status |
|---|---|
| `bookings.id` as universal FK | ✅ honoured by ~20+ tables platform-wide |
| `bookings.status` 7-enum (inquiry/tentative/confirmed/checked_in/checked_out/cancelled/no_show) | ✅ shipped + matches Zod schema |
| `bookings.booking_code` UNIQUE | ✅ mig 0000 |
| Cross-field check-out > check-in | ✅ in Zod schema (not DB constraint — could add) |
| `bookings.channel_id` FK to `booking_channels` | ✅ mig 0000 |
| `bookings.guest_id` FK to `guests` (SET NULL on delete) | ✅ mig 0000 |
| Per-booking ops tasks (`operation_tasks`) | ✅ ops table FKs bookings |
| Per-booking concierge requests | ✅ via `bookings.id` reference in concierge data flow |

---

## Recommended additions (prioritized)

### 🔥 P0 — none

Bookings cabinet has no P0 gaps. The hero promise ("operational heart, 4-channel triage, refund flow with director override") is **fully met** by the imported code + schema. This is the only cabinet across the 7 audited that earns this rating.

### ⭐ P1 — Phase 2.6 / polish

1. **`arrival-prep` agent** — design references this as shared with Operations; needs to actually exist somewhere (likely `_repo/src/features/ai-agents/bookings/arrival-prep.ts`). Writes to `arrival_prep_checklist`.
2. **Channel-specific cancellation overrides** — `cancellation-policy.ts` explicitly defers this ("today the function treats every channel identically"). Airbnb's strict/moderate/flexible should override the default ladder when source channel is Airbnb.
3. **Hero strip clarity** — verify whether `arrival-calendar.tsx` is the "today's arrivals + departures" hero strip or just a per-date calendar widget. If the hero strip isn't shipped, build it.
4. **Activity timeline as dedicated brick** — currently inlined in detail page; design implies separate audit tab.
5. **Reverse-deltas on cancellation** — when refund issued, finance ledger should reverse-out the booking's revenue lines. Cross-cabinet wire needed.
6. **DB-level check-out > check-in constraint** — currently only Zod-enforced; add as DB CHECK.
7. **Activity / charges separation** — `[id]/page.tsx` likely handles charges inline; design implies a dedicated activity tab.

### 💭 P2

8. **Move rates sub-cabinet** out of `/bookings/rates` into `/pricing/rates` to align with cabinet 03 ownership. Big refactor — leave for Phase 2.7.
9. **Bulk actions on list** (mass-confirm, mass-cancel).
10. **Filter persistence** in URL.
11. **Travel-agent intake CRM** — currently treated as a channel type, but agents may need a richer record (commission terms, payment cycles).

---

## Things outside scope

- Guest-facing booking-status portal — owned by Guest cabinet stack (mig 0015+).
- Channel sync state machine — owned by cabinet 02 channels.
- Statement / revenue split — owned by cabinet 06 finance.
- Owner stays / personal blocks — owned by mig 0012 owner-stays schema (per cabinet 04 owner-calendar reference).

## Open questions for product

- **Form field count** — design says 7 fields, Zod schema has 13 (+ cross-field refine). Confirm whether 7 was an MVP-launch lock OR the design's hero number is rhetorical. Suggest: 7 visible by default, advanced fields collapsible.
- **Director override authentication** — `directorOverride: true` is a plain boolean flag in `RefundInput`. No auth check in pure fn (correct — that's the call-site's job). Confirm that `actions.ts` checks `canManageEntity()` or similar before flipping the flag.
- **Refund execution** — `computeRefund()` returns the amount; who actually issues the refund (Stripe API · WA notify · manual)? Linked-finance reverse-deltas implied but not modelled.
- **Travel-agent vs Direct channel** — both have commission semantics but distinct row tones / handling. Are they distinct enough to warrant separate row-tone or just same neutral tone?
- **Arrival-prep agent shape** — design says it "writes to `arrival_prep_checklist`". Confirm whether this is a cron (daily 06:00 generates day's checklist) or event-driven (on booking status `confirmed` → checklist seeded). Suggest cron, daily at WITA 06:00.
