# Feature gap · 01 · Front office (Mgmt P2)

> ## ⚠️ GROUND-TRUTH CORRECTION (2026-05-29 · GitHub pull · see `_ground-truth-2026-05-29.md`)
> Audit written against the partial `_repo` import (no `src/app/**`). **The cabinet is built deep.** Route `/dashboard/front-office`: `page.tsx` **17.4kb** + `arrivals` / `departures` / `in-house` / `readiness` (7.3kb) / `requests`. Feature layer: `front-office/{services.ts 13.7kb, readiness-services.ts 8.6kb, checkin-state, room-board, tax-export-gate, transitions, actions, queries}`. **Discard any "route/page/data-fn not built" finding.** Surviving gaps are design↔code only — re-verify each against `front-office/services.ts` + drizzle before trusting; most "missing" claims here are import artifacts.

**Design sources**
- Desktop: `cabinets/mgmt-p2/front-office.html` — 6 sections (hero board, layout variants, check-in flow, guest registry, mobile, schema)
- Mobile: `mobile-pass-2.4-cabinets.html` § cabinet 03 — today board + 4-step check-in FSM
- Phase: 2.4 mgmt-03 · commit `995307e`

**Repo paths (state as of 2026-05-28 / commit c07ca82)**
- Routes: `src/app/(dashboard)/dashboard/front-office/{page,arrivals,in-house,departures,readiness,requests}.tsx`
- Components: `src/components/front-office/{check-in-out-buttons,checkin-flow,guest-card,id-ocr-preview,registry-table,request-row-actions,today-board,turnover-monitor}.tsx`
- Data: `src/features/front-office/{actions,services,readiness-services,queries,checkin-state,transitions,room-board,tax-export-gate}.ts`
- Agents: `src/features/ai-agents/front-office/{id-ocr,visa-watcher,vip-prep,turnover-monitor}.ts` — all four declared, all four stubbed
- Schema: `checkin_checkout_requests` (mig 0011), front-office copilot tables (mig 0099), housekeeping turnovers (mig 0100)

## TL;DR

Front office has the most complete code coverage of any Phase 2.4 cabinet — **8 components, 6 routes, 4 agents, 9 data-layer files**. UI is solid for arrivals/in-house/departures and check-in flow. The hollow parts are the **agents** (all 4 return zero / empty) and the **2 alternate layout variants** (timeline-by-hour, per-villa grid) which exist only in design. The `queries.ts` returns mocks — routes consume `services.ts` + `readiness-services.ts` for real data, so the mock isn't visible. The most consequential gaps: visa-watcher (currently invisible — no badges surface), id-ocr (preview component exists but agent doesn't extract), VIP brief (placeholder).

---

## Section-by-section

### 01 · Hero · "Today" 3-column board

| Element | Design | Repo | Status | Priority |
|---|---|---|---|---|
| 3-column board (arrivals / in-house / departures) | ✅ designed | `today-board.tsx` (component) + `/front-office/page.tsx` | ✅ shipped | — |
| Live clock + WITA pulse dot | designed | `today-board.tsx` shows date; no live clock element | 🟡 partial | 💭 P2 |
| Per-card status badges (VIP, ID pending, late, turn) | designed | `guest-card.tsx` exposes badge slot | 🟡 UI ready, data wiring | ⭐ P1 |
| "Arrive / In-house / Depart / Late" 4-up KPI strip (mobile) | mobile-only | not surfaced in any component | 🔴 designed only | ⭐ P1 |
| Card → drawer with full booking | designed (mentioned in section copy) | links to `/dashboard/bookings/[id]` (uses Phase 2.1 detail bricks) | ✅ shipped (via different surface) | — |
| Drag-card-between-columns to manually transition status | not designed (would be off-spec) | — | ⚪ | — |

### 02 · Layout variants (Variant B + Variant C)

| Element | Design | Repo | Status | Priority |
|---|---|---|---|---|
| **Variant B**: timeline-by-hour view | designed | nothing — no `timeline-board.tsx` | 🔴 designed only | 💭 P2 |
| **Variant C**: per-villa grid (14 villas × today) | designed | nothing — no `villa-grid.tsx` | 🔴 designed only | 💭 P2 |
| Layout switcher chip in topbar | designed | not in `page.tsx` | 🔴 designed only | 💭 P2 |

**Recommendation:** ship one of the two variants in Phase 2.6 / P3 wave. Per-villa grid is closer to ops reality (each villa is a physical thing); timeline is more familiar (hotel-style). Pick one, drop the other from scope.

### 03 · Check-in flow (4-step FSM)

| Element | Design | Repo | Status | Priority |
|---|---|---|---|---|
| Full-screen modal at `/front-office/checkin/[bookingId]` | designed (route hint) | `checkin-flow.tsx` exists but no route file under `/front-office/checkin/[id]/` | 🟡 component-only | 🔥 P0 |
| Step 1 · Identity (passport/KITAS/KTP scan) | designed | `id-ocr-preview.tsx` component, `id-ocr.ts` agent (stub) | 🟡 UI + stub agent | 🔥 P0 |
| Step 2 · Confirm stay details (party, dates, charges) | designed | `checkin-flow.tsx` — yes | ✅ shipped | — |
| Step 3 · Sign forms (immigration card, MSA acks) | designed | not surfaced in repo | 🔴 designed only | ⭐ P1 |
| Step 4 · Handover (welcome briefing, key, wifi) | designed | not surfaced | 🔴 designed only | ⭐ P1 |
| Multi-adult support (each adult scanned separately) | mobile-only design | not in repo | 🔴 designed only | ⭐ P1 |
| Save-&-pause bookmark (mid-flow handoff to colleague) | mobile-only design | no checkin draft / bookmark column on `checkin_checkout_requests` | 🔴 designed only | ⭐ P1 |
| `canTransition()` FSM guard | designed | `transitions.ts` — `requested → reviewing → approved → completed` (4-state) | 🟡 different shape | ⭐ P1 |

**Note:** designed FSM has 4 steps (identity → stay → sign → handover) but repo `transitions.ts` is a 4-state request lifecycle (`requested → approved → completed`). These are different concerns — request lifecycle is about housekeeping/concierge tasks, not the check-in arc. Need a separate `checkin_steps` state machine.

### 04 · Guest registry (ID + visa)

| Element | Design | Repo | Status | Priority |
|---|---|---|---|---|
| Registry table (218 guests · 4 visa flags pending) | designed | `registry-table.tsx` component + page hooks | ✅ shipped | — |
| Visa flags column with severity tone | designed | column exists, but `visa_flags` table not surfaced | 🟡 UI ready, no flag rows | 🔥 P0 |
| KITAS / VOA expiration counters | designed | not surfaced | 🟡 data fields exist on `guest_ids`, no UI | ⭐ P1 |
| Monthly tax-export gate | designed | `tax-export-gate.ts` data fn exists | 🟡 logic exists, no export button surfaced | ⭐ P1 |
| Tax-export download (CSV / official format) | designed | nothing | 🔴 designed only | ⭐ P1 |

**Note:** `visa-watcher` agent is supposed to populate `visa_flags`. Agent is stubbed (returns `{flagsCreated:0, flagsResolved:0}`). The registry column renders the empty state honestly — but the cabinet's promise ("4 visa flags pending") is unmet until the agent runs.

### 05 · Mobile · single-column · time-sorted

| Element | Design | Repo | Status | Priority |
|---|---|---|---|---|
| Single vertical scroll grouped by time-to-next-action | designed | desktop components likely render responsively; no mobile-specific layout | 🟡 partial | ⭐ P1 |
| Check-in FSM as 4-step phone flow | mobile design | depends on step 3+4 above — not in repo | 🔴 designed only | ⭐ P1 |
| Phone camera-first ID scan (vs upload) | mobile design | `id-ocr-preview.tsx` is file-upload only | 🟡 desktop pattern | ⭐ P1 |

### 06 · Schema · states · agents (design-side documentation)

| Element | Design | Repo | Status | Priority |
|---|---|---|---|---|
| `id-ocr` agent | declared in design | `id-ocr.ts` stub | 🟠 stub only | 🔥 P0 |
| `visa-watcher` agent (daily 07:00 cron) | declared in design | `visa-watcher.ts` stub, cron expr `0 7 * * *` declared | 🟠 stub only | 🔥 P0 |
| `vip-prep` agent (24h-before-arrival brief) | declared in design | `vip-prep.ts` stub | 🟠 stub only | ⭐ P1 |
| `turnover-monitor` agent | declared in design | `turnover-monitor.ts` stub | 🟠 stub only | ⭐ P1 |
| Agent registration in `registry.ts` | implied | only `statement-preparer` + `owner-intelligence` listed | 🔴 not registered | 🔥 P0 |
| Cron triggers in `definitions.ts` / `actions.ts` | implied | no entries | 🔴 not registered | 🔥 P0 |

---

## Cross-cutting

### Data wiring

`queries.ts` exists with `getTodayBoard`, `getRegistry`, `getTurnovers`, `getCheckinFlowState`. Currently returns mocks (per cleanup-A scope-correction audit). However, **routes consume `services.ts` + `readiness-services.ts`** (435 + 283 lines) which DO use real Drizzle. So in practice, the cabinet renders live data — `queries.ts` is dead code waiting for the Packet B route refactor.

| Concern | Status |
|---|---|
| Today board reads from `bookings` + `villaReadinessStates` | ✅ live (via services.ts) |
| Registry reads from `guests` + `guest_ids` | ✅ live |
| Turnover monitor reads from `operationTasks` | ✅ live |
| Visa flags rendered from `visa_flags` rows | 🔴 visa_flags table not in schema; agent gap |

### Mobile parity

The mobile pass introduced 7 new patterns (KPI strip 4-up, save-&-pause across steps, camera-first scan, multi-adult append, etc.) — none have desktop equivalents. These are net-new ops requirements surfaced by the mobile pass.

### Tablet vs phone

Design says check-in flow is "tablet-first" (modal). Mobile pass redesigns as full-screen steps. Need to decide:
- **A.** Tablet sees the modal, phone sees the steps. Two layouts.
- **B.** Both use the steps (mobile pass wins). Simpler. — recommended

---

## Recommended additions (prioritized)

### 🔥 P0 — ship before claiming "front office complete"

1. **Wire all 4 agents** (id-ocr, visa-watcher, vip-prep, turnover-monitor) — they're declared in design and stubbed in code, so the cabinet's promises ("4 visa flags pending", "VIP brief", "OCR extraction") are unmet. Implementation belongs to a Phase 2.5+ AI batch; registry + cron registration is in `phase-2-data-wiring` Packet PR 1.
2. **Check-in route + 4-step state machine** — `checkin-flow.tsx` exists as a component but there's no `/front-office/checkin/[id]/` route, and the 4-step transition table isn't in `checkin-state.ts` (verify). The current `transitions.ts` covers a different domain (requests, not check-ins).
3. **`visa_flags` table** — without it, the registry column has nothing to render.

### ⭐ P1 — ship in Phase 2.6 / P3 wave

4. **Step 3 (sign) + Step 4 (handover) UIs** for check-in flow — designed, not built.
5. **Multi-adult support** in identity step — design implies multiple identity sub-cards.
6. **Save-&-pause** for check-in flow — needs a `checkin_session_drafts` table or a JSON column on the request.
7. **Tax-export download** — `tax-export-gate.ts` logic exists; surface a button + CSV writer.
8. **VIP badge wiring** on Today board cards — UI slot exists, needs `vip` flag computed from `vip-prep` agent output.
9. **Camera-first scan** flow for phones — currently `id-ocr-preview.tsx` is file-upload.

### 💭 P2 — nice-to-have

10. **Variant B (timeline) OR Variant C (per-villa grid)** — pick one for Phase 2.6.
11. **Live clock + WITA pulse** in topbar.

---

## Things outside scope

- Drag-cards-between-columns (would conflict with FSM)
- Bulk check-in (assume 1 booking at a time)
- Guest self-check-in (separate Guest portal cabinet, not Front office)

---

## Open questions for product

- **Step 3 forms** — which forms exactly? Indonesian immigration card (a.k.a. arrival card) is standard; what else? MSA acknowledgements? Confirm with operations team.
- **Save-&-pause persistence window** — how long does an in-progress check-in stay resumable? Design doesn't say. Suggest: 24h or until guest's check-in date passes.
- **`visa-watcher` cron timezone** — declared `0 7 * * *` (server time). Should this be 07:00 WITA? Confirm.
