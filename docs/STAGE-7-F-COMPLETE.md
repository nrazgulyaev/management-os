# Stage 7.F — Operator UX Completion — CLOSURE

**Date**: 2026-05-07
**Hours budget**: 115h across 4 phases
**Tests delivered**: 4731 → **4842** (+111)
**Migrations**: 0 (UI-only stage by design)
**Build**: clean | **Cron registry**: 101 routes / 0 fatal

---

## Stage shape

Stage 7.F closed the operator-facing UX gaps identified by the Stage 7 Functionality Audit, without introducing new providers, schema, or migrations. Four phases ran sequentially with halt+report gates:

| Phase | Focus | Hours | Tests | Status |
|---|---|---|---|---|
| 1 | Workflow death-points (check-in/-out, maintenance assign, dev-os RFQ approve) | 30h | +21 | ACCEPTED |
| 2 | Connection UIs — marketing, Google Workspace, banking | 34h | +27 | ACCEPTED |
| 3 | Medium-leverage UIs — payment processor admin, WhatsApp credentials | 22h | +18 | ACCEPTED |
| 4 | Polish — RFQ-from-BOQ, cabinet gating helper, notifications status | 29h | +11 (D.2 deferred) | ACCEPTED |

---

## Audit gap closure

| Audit section | Pre-7.F state | Post-7.F state |
|---|---|---|
| Front-office arrivals/departures | Read-only — no status transitions in UI | ✅ Check-in / check-out buttons land state changes via `setBookingStatusAction` |
| Operations → Maintenance | Tickets created + read-only — no assignment flow | ✅ Assignee dropdown + scheduled date via `assignMaintenanceTicketAction` (bridged through linked `operation_task`) |
| Development OS → Procurement requests | Approve/reject server actions present, no UI surface | ✅ `<DevOsPurchaseRequestActions>` with role-gated approve/reject |
| Marketing → Connections | Empty state with "deferred to P5" stub | ✅ 7-provider connect form (GA4, Google Ads, Meta Pixel, Meta Ads, TikTok Ads, Mailchimp, ConvertKit), test/sync/disconnect actions, list + detail pages |
| Google Workspace settings | OAuth helpers shipped in 6.P5, no UI | ✅ `/settings/google-workspace` hub with Connect/Reconnect/Disconnect, scope display, full callback flow |
| Banking | Schema only, no operator surface | ✅ 5-provider form (Revolut, Wise, Mandiri, BCA, manual), list + detail pages, test/sync/disconnect (auto-sync supported by Wise + Revolut, manual + Indonesian banks gated) |
| Payments → Providers | Legacy direct-booking catalog only | ✅ New section showing `payment_processor_connections` rows + Stripe/Wise Payments/PayPal/Manual connect flow with webhook URL surfacing |
| WhatsApp settings | Env-var checklist only | ✅ Per-org credential form (encrypted to `oauth_connections`, `provider='twilio_whatsapp'`) + live test message via existing env-based runtime, with prominent banner explaining the env-vs-DB compromise |
| BOQ → Procurement | No path from BOQ to RFQ | ✅ `<GenerateRfqFromBoqButton>` materializes draft purchase requests for all BOQ items in one click |
| Plan-tier cabinet gating | Subscription plans seeded, no helper | ✅ `gateCabinet(orgId, slug)` helper + `CABINET_TO_FLAG` mapping for 8 paid-tier cabinets (rollout to cabinet `page.tsx` files is a 1-liner-per-page follow-up) |
| Notifications settings | Channel preferences only, no provider visibility | ✅ Provider configuration section showing Resend/Twilio configured state + DRY RUN/LIVE mode badge |

**Connection-UI coverage (audit metric)**: 22% → 100%.

---

## Pattern decisions made and held

1. **Plaintext credential storage for marketing + banking + payments** — existing `service.ts` read paths in those subsystems read `(conn.credentials as <Type>)` directly without decryption. Encrypting at the connection-actions layer would have broken cron sync paths. Decision: ship plaintext in this stage, document inline that envelope encryption is a coordinated cross-cutting follow-up. WhatsApp uses encrypted envelope (`STAY_LINK_KMS_SECRET`) because `oauth_connections` was already encryption-from-day-one for OAuth tokens.

2. **Maintenance assignment without new schema** — bridged through linked `operation_task`. If a ticket has no `taskId`, action creates a task + writes back; if it has one, action updates the existing assignee. Honors the "no new migration" constraint.

3. **Dev-os procurement requests action is a thin wrapper** — `transitionPurchaseRequest` already validated FSM transitions. The new UI component just calls it with role gating; no duplicate logic.

4. **Stage 7.E tenant subdomain not yet integrated** — Google Workspace OAuth callback resolves org via `getOrganizationByCode("ARCONIQUE_DEFAULT")` fallback. Documented as known compromise; lifts cleanly when subdomain middleware lands.

5. **WhatsApp env-vs-DB runtime** — runtime stays env-based per Stage 7.F constraint "DO NOT touch existing agent prompts/behaviors". Form persists per-org credentials to `oauth_connections` as future-proofing for the runtime swap; test-message button fires through existing env-based provider so operators verify configuration end-to-end. Banner on settings page makes the env-vs-DB story visible.

6. **Cabinet-flag map split into pure-constants module** — `cabinet-flags.ts` carries the `CABINET_TO_FLAG` mapping; `cabinet-gating.ts` re-exports it and adds `gateCabinet()` (which transitively requires `server-only` via `pageGate`). The split keeps the constant testable without `server-only` polluting the test runtime.

7. **D.2 (empty-state CTA sweep) explicitly deferred** — audit's gap concentration was Connection UIs (Phases 2+3), not empty states. Deferring D.2 doesn't reduce stage value; it's incremental polish that can land alongside future feature work.

---

## Verification

```
$ npx tsx --test tests/*.test.ts
# tests 4842
# pass 4842
# fail 0

$ npm run build
✓ build clean

$ npm run check:cron
101 cron route(s) inspected, 100 known job keys.
Overall: OK (0 fatal, 0 warning)
```

Files added in Stage 7.F: ~30 new components/actions/routes across phases 1-4.
Files modified in Stage 7.F: ~12 existing pages + service signatures.

---

**STAGE 7.F ACCEPTED.**

Master plan ([starry-jingling-noodle.md](../../../.claude/plans/starry-jingling-noodle.md)) Stage 7.F objectives delivered. Stage 7 commerce + multi-tenancy foundation (7.A through 7.E) remains the prerequisite for any new paid-tier rollout; Stage 7.F closed the operator-facing usability deficit blocking that rollout.
