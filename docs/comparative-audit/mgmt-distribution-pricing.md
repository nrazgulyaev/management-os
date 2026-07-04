# Comparative Functional Audit — Management: Distribution, Bookings & Pricing (PMS core)

Date: 2026-07-02 · Cluster owner: distribution/bookings/pricing agent
Scope: `src/app/(dashboard)/dashboard/{bookings,direct-bookings,channels,availability,pricing,front-office}` + backing `src/features/*`.
Cross-tenant IDOR NOT re-audited (already swept, PRs #273–#302). Verdict basis = actual code read, not comments.

---

## 1. Status table (by area)

| Area | Verdict | Evidence (file:line) | Notes |
|---|---|---|---|
| **bookings — list/detail** | **WORKS** | `bookings/[id]/page.tsx`, `_status-actions.tsx`, `bookings/actions.ts:55–140` | Full detail (5 tabs, rail, editable notes, charges, guests, payments). Status FSM buttons real. |
| **bookings — create** | **WORKS** | `features/bookings/actions.ts:73` (`assertHoldDatesStillAvailable`) | Atomic overlap guard against bookings + holds + blocks (half-open interval). Real double-booking prevention. |
| **bookings — lifecycle FSM** | **PARTIAL** | `bookings/[id]/_status-actions.tsx:15–17,31–48` | inquiry→confirmed→checked_in→checked_out + cancel/no_show wired & audit-logged. But **transition map is UI-only; server `setBookingStatusAction` accepts any enum** (self-documented L15–17). No settlement is *triggered* on check-out. |
| **bookings — settlement** | **PARTIAL / DISPLAY-ONLY** | `bookings/[id]/page.tsx:263–313` `settlementPanel`; `booking-detail-queries.ts:27–28` | Settlement panel *renders* "settles into" + payment, but comment L28 admits "per-line charges, Stripe settlement... no backing table". Check-out does not post a settlement. |
| **bookings — sync (calendar feeds)** | **WORKS (inbound iCal only)** | `bookings/sync/page.tsx`; `features/integrations/calendar-sync/{ical.ts,actions.ts:259,282}` | Real: `fetch(feed.feedUrl)` + hand-rolled VEVENT/DTSTART/DTEND parser → upsert bookings. One-way **import** from OTA iCal URLs. |
| **bookings — rates / calendar / export** | **WORKS** | `bookings/rates/page.tsx`, `bookings/calendar/page.tsx`, `bookings/export/route.ts` | Standard views + CSV export. |
| **direct-bookings — deposits** | **WORKS (manual capture)** | `direct-booking/deposits.ts`, `deposit-actions.ts:61–293` | Full deposit FSM (draft→pending→paid/manually_marked_paid→expired/refunded). **PSP capture NOT live** — `manually_marked_paid` is the real path (matches deferred-PSP posture). |
| **direct-bookings — reconciliation** | **WORKS** | `direct-booking/finance-reconciliation.ts`; `.../reconciliation/page.tsx` | Real finance-link FSM (pending→posted/skipped/failed/reversed) + metrics + reconcile button. |
| **direct-bookings — holds/requests/messages/guest-status** | **WORKS (holds)** / **PARTIAL (messages)** | `direct-bookings/{holds,requests,messages,guest-status}/page.tsx` | Holds atomically validated against live state. Messages = internal thread, NOT a unified OTA inbox. |
| **channels — registry/connect** | **PARTIAL (mock catalog)** | `features/channels/services.ts:19–25` | Channel catalog (Airbnb/Booking/Agoda/Expedia/Direct/…) is `source: "mock"` hard-coded rows, not a live provider registry. Connect wizard stores config only. |
| **channels — manager (ARI push / conflicts / health)** | **MOCK / SIMULATED** | `channels/manager/page.tsx:56–58`; `channels/manager-actions.ts:30–32,146–147,369–370` | Self-declared: "push execution is simulated — live OTA API deferred to launch." `channel_push_events.status` lands on `'simulated'`, never `'sent'`. Retry writes "Simulated retry". Conflict *detection* is real (`detectDoubleBookings`); resolution push is simulated. |
| **availability — day board** | **WORKS** | `availability/page.tsx`; `features/availability/services.ts` | Real 7-day board over bookings/holds/blocks/owner-stays; block types drive cells. |
| **availability — blocks** | **WORKS** | `availability/blocks/page.tsx`; `CalendarBlockAddButton` | Create maintenance/OOO/deep-clean blocks; feed calendar guard. |
| **pricing — dynamic calendar / rule sets / quote / logs** | **WORKS (rules)** | `pricing/page.tsx:3–11`; `features/dynamic-pricing/services.ts` (`quoteDynamicCalendar`, `listPricingRulesForSet`) | 60-night forward curve on a **real rule-stack engine** (season/DOW/occupancy/event/pin/clamp evaluated from DB rules). Comp set empty-states (no data source). |
| **pricing — channel-push** | **STUB** | `pricing/channel-push/page.tsx`; `dynamic-pricing/channel-push-stub.ts:13,85` | "Outbound channel-manager STUB — does not call any real API." Writes a simulated `channel_push_events` row. |
| **pricing — comp similarity** | **PARTIAL** | `features/pricing/comp-similarity.ts:11,80` | Photo/vision similarity is a placeholder ("until vision model wires"). |
| **front-office — arrivals/departures/in-house/readiness/requests/watch** | **WORKS** | `front-office/*/page.tsx`; `components/front-office/check-in-out-buttons.tsx` | Real arrivals/departures boards, check-in/out buttons feed the same FSM action. |

**Counts:** WORKS 13 · PARTIAL 6 · MOCK/SIMULATED 3 · STUB 2 · BROKEN 0.

### Engine duplication note (latent tech-debt, not user-facing bug)
There are **two pricing engines**: `features/pricing/engine.ts` (`runPricingEngine`, 8-step) is **dead — zero callers repo-wide** (`grep runPricingEngine` → only its own file). The live UI uses `features/dynamic-pricing/services.ts`. Likewise `features/pricing/quote.ts` is largely superseded. Consolidate or delete to avoid future confusion.

---

## 2. Defects, prioritized (file:line)

### P0 — launch-blocking for a real distribution business
1. **No real 2-way OTA channel sync (Airbnb/Booking.com/VRBO API).** Push is *simulated end-to-end* — `channels/manager-actions.ts:146–147,369–370`, `dynamic-pricing/channel-push-stub.ts:13`. Availability/rates changed here are **never transmitted to any OTA**. Only inbound iCal import exists. This is the single biggest gap vs every competitor; overbooking risk is real because outbound blocking relies on OTAs iCal-pulling us, and **we generate no outbound .ics either** (grep for `BEGIN:VCALENDAR` → none in mgmt). Result: a booking made here does NOT block the same villa on Airbnb.
2. **Booking status FSM not enforced server-side.** `bookings/[id]/_status-actions.tsx:15–17` — `setBookingStatusAction` accepts any status enum; only the button visibility gates transitions. An orphaned/scripted call can jump checked_out→confirmed etc. Money/occupancy states can desync.

### P1 — correctness / completeness
3. **Check-out does not create a settlement.** `bookings/[id]/page.tsx:263–313` renders a settlement panel but `booking-detail-queries.ts:27–28` confirms no backing settlement/charge posting. Lifecycle "check-out → settle" is a display, not a transaction.
4. **Direct-booking deposit PSP capture is manual-only.** `deposit-actions.ts:123–137` — real path is `manually_marked_paid`; no gateway capture. Consistent with the deferred-PSP decision but means the "direct booking website + pay securely" competitor parity is not met.
5. **Channel catalog is mock rows.** `features/channels/services.ts:19–25` (`source:"mock"`). Commission % is static defaults, not fetched from live connections.

### P2 — polish / debt
6. **Dead pricing engine** `features/pricing/engine.ts` — no callers; delete or wire.
7. **Comp-set / comp-similarity has no data source + vision placeholder** — `pricing/page.tsx` comp table empty-states; `comp-similarity.ts:80`.
8. **No unified guest inbox** — `direct-bookings/messages` is an internal thread; OTA guest messages don't flow in.

---

## 3. Competitor benchmark & gap map

Analogs: Guesty, Hostaway, Lodgify (VR PMS + channel mgr), Cloudbeds/Mews (hotel PMS), PriceLabs/Beyond (pricing).

| Capability (2025–26 baseline) | Competitor reality | This system | Gap |
|---|---|---|---|
| **Real 2-way OTA API sync** (Airbnb/Booking/VRBO/Expedia: availability+rates+bookings+content+messaging) | Guesty/Hostaway/Lodgify all ship deep 2-way API; "iCal too slow, overbooking risk" | **Simulated push + inbound iCal only** | **P0 — largest gap** |
| **Outbound iCal export** (fallback blocking) | Universal | **None generated** | **P0** |
| **Unified guest inbox** (OTA + direct + WhatsApp in one thread) | Guesty/Hostaway standard | Internal messages only | **P1** |
| **Direct-booking website + secure payment capture** | Lodgify's flagship (Stripe-powered, in-product) | Direct-booking module + deposits, but **capture is manual** | **P1** |
| **Dynamic pricing engine** | PriceLabs/Beyond; native in Guesty/Lodgify | **Real rule-stack engine (season/DOW/occ/event/pin/clamp)** live | **PARITY** (rules) — gap only on ML/comp-set + no push to OTA |
| **OTA reconciliation** (payout vs booking) | Guesty/Hostaway | **Real** direct-booking finance reconciliation FSM | **PARITY** (for direct); no OTA-payout recon since no OTA link |
| **Multi-calendar / availability board** | Universal | **Real** day board + blocks + atomic overlap guard | **PARITY** |
| **Folio / reservation mgmt** | Cloudbeds/Mews folio | Booking detail w/ charges+payments+guests | **NEAR-PARITY** (no true folio settlement post) |
| **Double-booking prevention** | Universal | **Real** atomic guard on create + hold | **PARITY** (within-system); breaks across OTAs (no sync) |

### Differentiation (where this system is *ahead* or unusually strong)
- Villa/owner-centric model (owner-stays, owner reconciliation) beyond generic STR PMS.
- Audit-logged, permission-gated every write; strong tenancy posture post-sweep.
- Pricing rule *explainer* + per-step audit array (`dynamic-pricing/explainer.ts`) — more transparent than most.

---

## 4. Recommendations (build order)

1. **P0 — Ship outbound iCal export first** (cheapest overbooking mitigation): generate per-villa `.ics` route from bookings+holds+blocks so OTAs can pull. Small, unblocks the double-booking-across-channels hole without full API certification.
2. **P0 — Real OTA API connector** (start with one: Airbnb or Booking.com). Replace `channel-push-stub.ts` + `manager-actions.ts` simulate path with a real client; flip `channel_push_events.status` to `sent/failed`. Certification is the long pole — begin now.
3. **P1 — Server-side booking FSM.** Add the transition map (already in `_status-actions.tsx:31–48`) into `setBookingStatusAction`; reject illegal jumps.
4. **P1 — Post a settlement on check-out.** Turn the display panel into a real transaction (charges → folio → payout line), reusing the finance payout-line FSM.
5. **P1 — Unified inbox + PSP capture** — track with the launch-PSP (Xendit/QRIS for ID) decision; wire OTA + WhatsApp + direct threads into one view.
6. **P2 — Delete dead `features/pricing/engine.ts` + `quote.ts`; wire comp-set data source; ship vision comp-similarity when model available.**

Sources: Hostaway/Lodgify/Guesty channel-manager 2-way-API comparisons (hostaway.com, eviivo.com, staystra.com); Lodgify Payments/Stripe + direct-booking engine (lodgify.com); PriceLabs/Beyond dynamic pricing (2026 comparisons).
