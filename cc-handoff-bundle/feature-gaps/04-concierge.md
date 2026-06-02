# Feature gap · 04 · Concierge (Mgmt P2)

> ## ⚠️ GROUND-TRUTH CORRECTION (2026-05-29 · GitHub pull · see `_ground-truth-2026-05-29.md`)
> Built. Route `/dashboard/concierge`: `page.tsx` **12.6kb**; plus `guest-ai-concierge/` feature + `/dashboard/guest-ai`. Pure fns confirmed: `concierge/{escalation.ts (URGENT 30-min SLA), comp-policy.ts, queries.ts}`. **The cabinet's agent is the real `concierge_handoff` (mig 0101), not a fictional name.** Discard "not built"; keep only design↔code deltas verified against the feature files.

**Design sources**
- Desktop: `cabinets/mgmt-p2/concierge.html` — 5 sections (hero board, layout variants, single-stay page, mobile, schema)
- Mobile: `mobile-pass-2.4-cabinets.html` § cabinet 04 — 2-pane swipe between inbox + thread
- Phase: 2.4 mgmt-04 · commit `d663a38`

**Repo paths (state as of feature-gap audit window)**
- Pure domain: `_repo/src/features/concierge/{comp-policy,escalation,queries}.ts` — 3 files
- Agents: `_repo/src/features/ai-agents/concierge/{comp-policy-checker,concierge-agent}.ts` — comp-policy-checker is *real* (wraps the pure fn), concierge-agent is stub
- Schema · in-stay guest concierge (mig 0018): `guest_ai_concierge_sessions/messages/runs`
- Schema · concierge handoffs (mig 0019/0020): `guest_ai_handoffs`, `guest_ai_handoff_replies`
- Schema · guest journey automation (mig 0024): `guest_journey_rules/suggestions/runs/events`
- Schema · supervisor copilot registration (mig 0101): `concierge_handoff` row in copilot registry with full Claude prompt
- Schema · direct-booking guest messaging (mig 0031): `direct_booking_guest_message_threads/messages`
- **Not imported into this project:** `src/components/concierge/*` (request-inbox, thread, journey-timeline, comp-watch all referenced by `queries.ts` type imports), `src/app/(dashboard)/dashboard/concierge/*`.

## TL;DR

Concierge is **two solid pure-fn modules + a Claude prompt + heavy schema infrastructure, all waiting for a unified read layer**. The two pure modules — `comp-policy.ts` (500k IDR threshold + 2M IDR/7d director gate) and `escalation.ts` (30-min URGENT timer) — encode the two Critical UX Rules verbatim and are shared between the comp-policy-checker agent and the dashboard. The schema is rich but **fragmented**: in-stay AI concierge has its own session/messages/runs (mig 0018), direct-booking guests have their own thread/messages (mig 0031), journey automation has its own rules/runs/events (mig 0024). The cabinet's hero promise — "active stays · 11 guests · 7 villas · open requests across all stays" — requires a unified `concierge_requests` view that doesn't exist; `queries.ts.getInbox()` returns `[]` not because mocks are missing but because the join model isn't there. The other gap: **no `comp_offered` table**, so `getCompOffered()` literally has nowhere to read from despite the comp-policy code being the most polished module in the whole codebase.

---

## Section-by-section

### 01 · Hero · "Active stays · 11 guests · 7 villas"

| Element | Design | Repo | Status | Priority |
|---|---|---|---|---|
| Left rail: open requests across all stays | designed | `queries.ts.getInbox()` returns `[]`; no unified `concierge_requests` table | 🔴 missing read model | 🔥 P0 |
| Right pane: focused stay (Volkov, AC issue) | designed | `queries.ts.getThread(stayId)` returns `null`; data sources exist across mig 0018/0024/0031 but no unified seam | 🟡 mixed | 🔥 P0 |
| Bottom: agent activity log | designed | `guest_journey_events` + `guest_ai_concierge_runs` + `guest_ai_handoffs` all shipped ✅; no aggregated read fn | 🟡 schema ready | ⭐ P1 |
| URGENT badge with 30min countdown | designed | `escalation.ts.evaluateEscalation()` ✅ pure fn shipped | ✅ logic shipped | — |
| Manager-bell aggregation | designed | gated on escalation_events / unified `concierge_escalations` table | 🔴 missing | ⭐ P1 |
| Agent attribution (terra-tint, "agent" tag) visible to staff | designed | `guest_ai_handoffs` carries author + handoff state ✅ | ✅ schema | — |
| Agent attribution stripped from guest-facing copy | Critical UX rule 1 | `concierge-agent.ts` reply shape supports this; no enforcement layer | 🟡 design rule, no code guard | ⭐ P1 |

### 02 · Layout variants

| Element | Design | Repo | Status | Priority |
|---|---|---|---|---|
| **Variant A**: stay-centric (default — focused stay in right pane) | designed | implied default | 🔴 not picked in code | 💭 P2 (gate on pick) |
| **Variant B**: request-centric (guests as cards, requests are status pills) | designed | not in repo | 🔴 design only | 💭 P2 |

**Recommendation:** Variant A — matches the journey-events shape (events are per-booking/per-stay), matches the mobile 2-pane swipe pattern (inbox → thread), matches the supervisor copilot prompt that ranks per-session. Variant B would force the same data through a card layout and lose the thread anchor. Lock A.

### 03 · Single stay · full page

| Element | Design | Repo | Status | Priority |
|---|---|---|---|---|
| Standalone at `/concierge/stay/[bookingId]` | designed | route not in proj | 🟡 unknown | ⭐ P1 |
| Same thread + journey + comp + escalation as right pane | designed | individual data sources exist; aggregation fn missing | 🟡 partial | ⭐ P1 |
| Comp-watch panel (running comp list for the booking) | designed | `queries.ts.getCompOffered()` returns `[]`; **no `comp_offered` table** | 🔴 missing | 🔥 P0 |
| Journey timeline (moments: pre-arrival, check-in, mid-stay, departure) | designed | `guest_journey_events` shipped ✅, `guest_journey_runs` shipped ✅ | ✅ schema | — |
| Action menu (offer comp · dispatch HK · escalate · close request) | designed | no `actions.ts` in concierge feature folder; comp-policy fn ready | 🔴 actions not surfaced | 🔥 P0 |
| Staff message composer | designed | `queries.ts.postStaffMessage()` returns `{messageId:"stub"}` | 🟡 stub | 🔥 P0 |

### 04 · Mobile · 2-pane swipe

| Element | Design | Repo | Status | Priority |
|---|---|---|---|---|
| Inbox on home tab | designed | no mobile component | 🔴 design only | ⭐ P1 |
| Tap row → swap to thread view | designed | swipe transition; no impl | 🔴 design only | ⭐ P1 |
| Agent activity as inline messages (not separate tab) | designed | data shape supports inline (mixed thread); no UI | 🟡 schema ready | ⭐ P1 |
| Quick-action sheet (offer comp / dispatch HK / escalate) | implied | gated on comp-policy + dispatch action | 🟡 logic ready | ⭐ P1 |

### 05 · Schema · agents · routes

| Element | Design | Repo | Status | Priority |
|---|---|---|---|---|
| In-stay AI concierge sessions/messages/runs | designed | shipped (mig 0018) ✅ | ✅ | — |
| AI handoff + handoff replies | designed | shipped (migs 0019, 0020) ✅ | ✅ | — |
| Guest journey rules/suggestions/runs/events | designed | shipped (mig 0024) ✅ | ✅ | — |
| Concierge-handoff copilot registry | designed | shipped (mig 0101) ✅ with full Claude prompt for ranking attention urgency | ✅ | — |
| Unified `concierge_requests` table (joins handoff + journey + direct-booking-thread) | designed (implied) | 🔴 not in any migration | 🔴 missing | 🔥 P0 |
| `comp_offered` table (running comp ledger per booking) | designed | 🔴 not in any migration | 🔴 missing | 🔥 P0 |
| `concierge_escalations` (URGENT-timer fires + manager bell) | designed (implied by escalation.ts) | 🔴 not in any migration | 🔴 missing | ⭐ P1 |
| comp-policy-checker agent | designed | ✅ wraps real `checkCompPolicy()` — only agent in the entire repo that returns real output today | ✅ shipped | — |
| concierge-agent (routes routine vs issue) | designed | 🟠 stub — returns `{route:"issue", confidence:0}` | 🟠 stub | 🔥 P0 |

---

## Cross-cutting

### Data wiring

| Concern | Status |
|---|---|
| `getInbox()` returns aggregate of open requests across stays | 🔴 hard-blocked on unified `concierge_requests` view or materialized table |
| `getThread()` reads messages for a stay | 🟡 sources exist in 3 places (mig 0018 / 0019-0020 / 0031); needs union view or normalisation |
| `getJourney()` reads moments timeline | 🟡 `guest_journey_events` ready; fn just doesn't read |
| `getCompOffered()` reads running comp list | 🔴 blocked on `comp_offered` table |
| `postStaffMessage()` writes a staff message | 🟡 stub; target table is `guest_ai_concierge_messages` (with `author_type='staff'`) — needs choosing |
| Escalation evaluation runs on a schedule | 🟡 `escalation.ts.evaluateEscalation()` ready; no cron consuming it |

### Agents

| Agent | Declared | Real impl | Notes |
|---|---|---|---|
| `comp-policy-checker` | ✅ | ✅ **real** — wraps pure `checkCompPolicy()` | The only agent in the audited set that returns real output today |
| `concierge-agent` | ✅ | 🟠 stub returns `{route:"issue", confidence:0}` | Needs Claude call + intent classification + (when routine) auto-reply generation |
| `concierge_handoff` (supervisor copilot) | ✅ via registry mig 0101 | 🟡 prompt declared, runtime status unclear (not in `_repo/src/features/ai-agents/concierge/`) | Different code path — feeds the cross-stay supervisor view, not the per-message router |

### Mobile parity

Mobile design's "agent activity as inline messages" is the right call for the data shape — `guest_journey_events` rows can be cast as message-shaped objects in the thread view. No separate mobile component needed if the desktop thread is responsive.

### Schema fragmentation

Three parallel guest-message stacks exist:
1. **mig 0018 · `guest_ai_concierge_sessions/messages/runs`** — in-stay AI concierge (guest is logged in to guest portal)
2. **mig 0031 · `direct_booking_guest_message_threads/messages`** — pre-stay direct-booking thread (guest hasn't checked in yet)
3. **mig 0019/0020 · `guest_ai_handoffs/handoff_replies`** — AI-to-human handoffs

The cabinet's "11 guests · 7 villas" implies a single inbox across all three. Either: (a) add a `concierge_requests` materialized view union, (b) normalise into one table, or (c) ship 3 inboxes side-by-side. Recommend (a) — keeps source tables stable, materialised view refreshed on write.

---

## Recommended additions (prioritized)

### 🔥 P0 — ship before claiming "concierge complete"

1. **Add `comp_offered` table** — `id · org_id · booking_id · proposed_at · proposed_by_user_id · proposed_by_agent ('comp-policy-checker') · amount_idr · reason · outcome (auto/staff/director/rejected) · resolved_at · audit_payload_jsonb`. Schema reflects the comp-policy outcome enum.
2. **Build unified `concierge_requests` materialised view** — UNION across the 3 source stacks (mig 0018/0031 messages + 0019 handoffs + 0024 journey events flagged as needing-attention). Indexed on `(org_id, stay_id, priority, last_activity_at DESC)`. Refreshed on insert via trigger.
3. **Wire `getInbox()`, `getThread()`, `getJourney()` to real reads** — sources are in place, fns just need real Drizzle queries.
4. **Wire `postStaffMessage()`** — pick target table (recommend: `guest_ai_concierge_messages` with `author_type='staff'`), write + return real `messageId`.
5. **`concierge-agent` real impl** — Claude call that classifies `routine` vs `issue`. For `routine`: generate reply + optional side-effect action. For `issue`: escalate with priority hint.
6. **Stay-detail action surface** — comp offer (calls `checkCompPolicy()` + writes `comp_offered`), dispatch HK (writes to `operation_tasks`), escalate (writes to `concierge_escalations` if added), close request.

### ⭐ P1 — Phase 2.6

7. **Add `concierge_escalations` table** — `id · org_id · request_id · triggered_by ('escalation.ts' / 'manual') · triggered_at · resolved_at · resolved_by · staff_seen_at · manager_bell_cleared_at`.
8. **Schedule `escalation.ts.evaluateEscalation()` as cron** (every 5 min) — scans open URGENT requests, writes escalation rows when ≥ 30min elapsed.
9. **Lock Variant A** in design copy.
10. **Single-stay page route + DetailPage brick** — re-uses Phase 2.1 bricks.
11. **Mobile 2-pane swipe component** — inbox → thread transition.
12. **Agent-attribution stripping enforcement** — middleware in `postGuestMessage` paths that ensures agent-authored content marked with `agent` flag is rendered to guest without attribution but to staff with terra-tint badge.

### 💭 P2

13. **Variant B layout** documented as alternate, not built.
14. **Comp-watch panel inline animation** — when comp offered, animate from comp-policy-checker → comp_offered → thread message.

---

## Things outside scope

- Owner-facing concierge view — owner cabinet has its own inbox (cabinet 20 owner-inbox, audited separately).
- Guest-portal AI concierge (guest-side surface) — separate Guest cabinet (not in 22-cabinet audit scope).
- Phone integration (incoming calls routed to staff) — design implies WhatsApp-only; voice is out of scope.

## Open questions for product

- **Unified inbox sort order** — design implies "URGENT first, then unresolved, then by recent activity". Confirm.
- **Comp denominations** — comp-policy is IDR-only. What about non-Indonesia properties (if any)? Suggest: hard-code IDR for v1, add per-currency thresholds in v2.
- **2M IDR / 7d director gate** — what counts in the 7d window? All comps on the booking? All comps by the staff member? Confirm — design copy says "per booking" but doesn't pin it.
- **Auto-reply tone calibration** — `concierge-agent` is supposed to handle routine queries. Who calibrates the tone / language register? Per-org system prompt? Confirm.
- **Supervisor copilot (`concierge_handoff`) vs `concierge-agent`** — both are AI surfaces over the same data. Are they separate runtimes? The 0101 prompt suggests the supervisor reads handoffs + ranks attention; `concierge-agent` routes individual messages. Confirm split.
