# Feature gap · 19 · Owner · Calendar (Owner P1)

> ## ⚠️ GROUND-TRUTH CORRECTION (2026-05-29 · GitHub pull · see `_ground-truth-2026-05-29.md`)
> Built. Route `/owner/calendar` → `page.tsx` **14.4kb**, plus `/owner/preferences/calendar` (2.5kb) and `/owner/stays`(+`[id]`/`new`) for the personal-stay flow. **Discard "not built".** Surviving: design↔code deltas — verify against `owner-bookings/` + drizzle.

**Design sources**
- Desktop: `cabinets/owner-p1/04-calendar.html`
- Phase: 2.3 owner-04 · commit `01b03fb`

**Repo paths**
- Route: `src/app/(owner)/owner/calendar/page.tsx` (14.4kb)
- Components: `month-calendar.tsx`, `pipeline-list.tsx`, `personal-stay-modal.tsx`, `arrival-calendar.tsx` (owner-portal scope)
- Feature: `src/features/owner-portal/get-calendar.ts` + `calendar-pure.ts` + `calendar-services.ts`
- Schema · owner stays (mig 0012): `owner_stay_policies`, owner stay requests
- Schema · owner stay finance + notifications (mig 0013): finance + notification chain
- Schema · owner calendar health reports (mig 0023)

## TL;DR

Owner Calendar surfaces the **MonthCalendar + PipelineList + PersonalStayModal** trio per CLAUDE.md. 14.4kb single page handles personal-stay requests, pipeline of upcoming guest bookings, and the cross-cabinet wire to Bookings (owner_stay_request → Mgmt confirms via Bookings cabinet 05). The feature folder has pure + services split for calendar logic. **The personal-stay flow is the key cross-cabinet integration**: owner submits → goes to Mgmt's Bookings cabinet as `owner_stay_request` booking type → mgmt confirms or counter-proposes → owner sees confirmation. **0 P0** if owner_stay_policies quotas are enforced at write time.

---

## Section-by-section

### Month calendar
| Element | Status |
|---|---|
| `month-calendar.tsx` | ✅ |
| Per-day status (available / personal-stay / booked) | ✅ |
| Tap day → quick-action (block, request stay) | ✅ |

### Pipeline list
| Element | Status |
|---|---|
| `pipeline-list.tsx` | ✅ |
| Upcoming bookings with channel + revenue | ✅ |

### Personal-stay flow
| Element | Status |
|---|---|
| `personal-stay-modal.tsx` | ✅ |
| Submit → bookings cabinet as `owner_stay_request` | ✅ cross-cabinet |
| Quota enforcement via `owner_stay_policies` | ✅ schema |
| Notification chain on confirm/decline (mig 0013) | ✅ schema |

---

## Cross-cutting

### Cross-cabinet
- 05 Bookings: owner_stay_request booking type
- 18 Owner Villas: villa selector
- 04 Concierge: notification routing

---

## Recommended additions

### 🔥 P0 — none

### ⭐ P1
1. **Quota visualization** — owner needs to see remaining personal-stay nights against policy.
2. **Counter-proposal flow** — Mgmt counter-proposes → owner accepts/declines round-trip.
3. **Block dates** — separate from personal-stay (maintenance, owner-internal use, etc).

## Open questions
- **owner_stay_policies allowance reset** — calendar year? Anniversary? Per villa or pooled?
- **Counter-proposal SLA** — how long does Mgmt have to respond?
