# Stage 10.6.A CHECKPOINT 5 — Executive summary + locked roadmap

**Date**: 2026-05-13
**Inputs**: CHECKPOINT 1-3 prior reports + CHECKPOINT 4 four sub-reports + 11 commits of 10.6.B.4 partial execution + operator decisions (option 3 for B.4 carry-over + "all good go next").
**Output**: scope-locked Stage 10.6.B-F roadmap + 8 architecture defaults + per-sub-phase launch readiness checklist.

---

## 1. Executive summary

### 1.1 Where Stage 10.6 stands today

**Phase 10.6.A audit**: ✅ COMPLETE (CHECKPOINT 1-5 shipped).

**Phase 10.6.B critical fixes**: 80% complete.
- ✅ 10.6.B.1 demo seed (+ 1-fix organization_id propagation) — operator-verified populated cabinets
- ✅ 10.6.B.2 + 2-fix + 2-fix.2 — 91 BROKEN → 0 expected after deploy (operator verifies)
- ✅ 10.6.B.3 AI runner per-org — universal blocker removed
- ✅ 10.6.B.4 Modal-First helper — 46/60 violators closed (77%); 14 carry-over to 10.6.C per operator option 3
- ⏸ 10.6.B.5 Missing Delete operations — folded into 10.6.C.2/.3 per operator default below
- ⏸ 10.6.B.6 Cancel + edge case fixes — folded into 10.6.C.2/.3

**Phase 10.6.C-F**: Not started. Roadmap locked below.

### 1.2 Net delta from Stage 10 baseline

| Metric | Stage 10 end | Today (10.6.A complete + 10.6.B 80%) | Target (10.6.F complete) |
|---|---|---|---|
| Production P0 BROKEN | 13 | 0-2 expected (post-deploy verify) | 0 |
| AI agents activatable per-org | 0 | 9 | 9 |
| Modal-First Add violators | ~60 | 14 | 0 |
| Cabinets populated | empty | 10 populated | 10 polished + populated |
| External integration UIs at parity | 0 | 1 (AI) | 6+ (Stripe Connect + Resend + WhatsApp + channels + Maps + Calendar) |
| SubscriptionOS workspace | none | none | shipped (1 workspace + 6 admin pages) |
| Award-winning UI vibe | not earned | not earned | earned (10.6.C.1-.4) |

### 1.3 Confidence by phase

| Phase | Scope confidence | Effort confidence | Risk |
|---|---|---|---|
| 10.6.B.5 + .6 (folded into C) | HIGH | HIGH | LOW — concrete operator-flagged list |
| 10.6.C.1 cabinet polish | HIGH (UI gap doc + screenshots locked) | HIGH | LOW — additive token application |
| 10.6.C.2 list pages | MEDIUM-HIGH | MEDIUM | MEDIUM — 50 pages × variable complexity |
| 10.6.C.3 detail + forms | MEDIUM | MEDIUM | MEDIUM — varied existing patterns |
| 10.6.C.4 public + auth | HIGH | HIGH | LOW — small scope |
| 10.6.D.1 AI agent polish | HIGH | HIGH (lighter than master plan — 10.6.B.3 did most of it) | LOW |
| 10.6.D.2 external integrations | HIGH | MEDIUM | MEDIUM-HIGH — depends on 7 broken UIs healing post-deploy |
| 10.6.E.1 SubscriptionOS arch | HIGH (foundation already shipped) | HIGH | LOW — mostly URL + workspace + roles |
| 10.6.E.2 SubscriptionOS MVP | HIGH (CHECKPOINT 4 audit) | HIGH | LOW — reads from existing tables |
| 10.6.F.1 owner stays | MEDIUM | MEDIUM | MEDIUM — equivalence groups + finance bridge are non-trivial |
| 10.6.F.2 maintenance + ops | MEDIUM | MEDIUM | MEDIUM — window suggestions algorithm |
| 10.6.F.3 front office + journey | MEDIUM | MEDIUM | MEDIUM — real-time UI + automation rules |

---

## 2. Locked roadmap — Phases 10.6.B-F

### 2.1 Sub-phase sequence + estimates

| # | Sub-phase | Effort | Halt + verify |
|---|---|---|---|
| 1 | **10.6.C.1** Cabinet visual polish (10 cabinets) | 5 days (~32h) | Operator visual review all 10 cabinets vs reference screenshots |
| 2 | **10.6.C.2** List pages modernization + absorb 10.6.B.4 carry-overs (14 list pages) + absorb 10.6.B.5 deletes | 6 days (~38h) | Operator spot-checks 10-15 list pages |
| 3 | **10.6.C.3** Detail pages + forms + absorb 10.6.B.6 cancel/edge-case fixes | 5 days (~32h) | Operator tests detail flows + 5 forms |
| 4 | **10.6.C.4** Public pages + auth polish | 3 days (~20h) | Operator visual review public + auth pages |
| 5 | **10.6.D.1** AI agent UI polish (per-org config + test conn + usage) | 2 days (~14h) | Operator runs 1 agent per provider |
| 6 | **10.6.D.2** External integrations (Stripe Connect, Resend, WhatsApp, channels, Maps + heal post-deploy residuals) | 5 days (~36h) | Operator tests 5 integration flows end-to-end |
| 7 | **10.6.E.1** SubscriptionOS architecture (URL + workspace + roles + 0-1 migration) | 2 days (~14h) | Operator applies migration if any + reviews architecture doc |
| 8 | **10.6.E.2** SubscriptionOS MVP (6 admin pages + impersonation) | 5 days (~32h) | Operator tests SubscriptionOS end-to-end |
| 9 | **10.6.F.1** Owner stays + policies + equivalence groups + finance bridge | 5 days (~32h) | Operator tests owner stay flow + finance reconciliation |
| 10 | **10.6.F.2** Maintenance scheduling + window suggestions + risk feed + recurring tasks + vendor assignment | 5 days (~32h) | Operator schedules 1 maintenance task per villa |
| 11 | **10.6.F.3** Front office today / check-in-out / guest journey rules / direct bookings / dynamic pricing | 5 days (~32h) | Operator tests check-in flow + journey automation |

**Total**: ~48 working days = **~10 weeks** of focused work after CHECKPOINT 5 sign-off.

Saves 3-4 weeks vs the master plan's 13-week estimate by:
- Folding 10.6.B.5 + .6 into 10.6.C.2/.3 (saves 1.5 weeks)
- 10.6.D.1 lighter because 10.6.B.3 already did the runtime work (saves 0.5 week)
- 10.6.E.1 lighter because Stage 7.D already shipped subscription FSM + Stripe + workspace switcher (saves 0.5 week)
- 10.6.B.4 already 77% done (saves 1 week)

### 2.2 Customer-readiness milestones

| Milestone | After | What you can sell |
|---|---|---|
| **Functional MVP** | 10.6.C.1 (week 1) | Operator-grade tool with populated cabinets that look modern |
| **Beta-launch ready** | 10.6.C.4 (week 4) | Public site + auth + full UI polish — can invite 3-5 beta users |
| **Self-serve customer** | 10.6.D.2 (week 6) | Customer can configure their own integrations (Stripe / Resend / WhatsApp / channels / maps) without operator handholding |
| **Operator-can-sell** | 10.6.E.2 (week 8) | SubscriptionOS lets operator manage trials / conversions / churn / support without SQL |
| **Differentiated product** | 10.6.F.3 (week 10) | Equivalence groups + maintenance intelligence + journey automation = features competitors don't have |

---

## 3. 8 architecture decisions — defaults + operator override path

CHECKPOINT 4 raised 8 questions. Operator's "ALL GOOD GO NEXT" defaults to my recommendations below. Any of these can be overridden at the relevant sub-phase launch — none of them block CHECKPOINT 5 sign-off.

| # | Question | Default decision | Locked at |
|---|---|---|---|
| 1 | 10.6.B.5/.6 fold into 10.6.C? | ✅ **YES — fold into 10.6.C.2 + .3** | This checkpoint |
| 2 | SubscriptionOS URL prefix | ✅ **`/subscriptions`** (operator-friendly; "platform-admin" is more system-y) | 10.6.E.1 launch |
| 3 | Permission model for SubscriptionOS | ✅ **Split: `platform_owner` + `customer_support`** (cleaner long-term; small migration adds 2 role rows) | 10.6.E.1 launch |
| 4 | Support tickets: in-app or external? | ✅ **External (Plain / Linear / Intercom)** for v1; in-app deferred to Stage 11. Just add "Open ticket" mailto-link per org in SubscriptionOS. | 10.6.E.2 launch |
| 5 | Stripe Customer Portal per-org link | ✅ **YES, in 10.6.E.2 scope** (~1h to wire if Stripe Customer Portal configured in Stripe dashboard) | 10.6.E.2 launch |
| 6 | Greeting personalization (`Good morning, [name]!`) | ✅ **YES — pull from `getCurrentUserContext().appUser.fullName`**; default to "there" if no full name; gradient avatar fallback | 10.6.C.1 launch |
| 7 | Dark mode parity expected during 10.6.C.1? | ✅ **YES — every new token gets a `.dark` override**; references are light but the system is dark-mode-supporting today and we should preserve | 10.6.C.1 launch |
| 8 | Custom draggable dashboard layouts (PPC reference style) | ⛔ **NO — defer to Stage 11+**; out of 10.6.C.1 scope. The reference inspiration is for visual rhythm (mixed card sizes), not for drag-rearrange. | This checkpoint (final) |

If operator disagrees with any default: reply with corrections before that sub-phase launches. Defaults stand otherwise.

---

## 4. Cadence enforcement — locked

Per master plan's "MANDATORY HALT after each sub-phase":

- ✅ 11 sub-phases ahead × ~30 min operator review per halt = **~5.5h total operator review time** spread across 10 weeks.
- ✅ AI codes one sub-phase, ships, halts. Operator verifies. Operator says "go {next}". AI codes next.
- ✅ No auto-launch. No combining. No scope drift without flag.

Process violation responses (per master plan):
- Sub-phase ships before previous halt confirmed → STOP, acknowledge, re-anchor.
- Scope drift detected → FLAG immediately, don't accept renamed scope.
- Tests pass but functionality questionable → FLAG, request manual verify.
- Migration involved → STOP after writing file, wait for operator manual production apply.

---

## 5. CHECKPOINT 5 deliverables — status

| Deliverable | Status |
|---|---|
| Combined severity rankings | ✅ Implicit via § 1.2 + § 2.2 milestones |
| Phase 10.6.B-F roadmap with hour estimates | ✅ § 2.1 |
| Executive summary | ✅ § 1 |
| 10.6.C.1 launch prompt seed (first post-audit sub-phase) | ✅ separate file: `tmp/stage-10-6-c-1-launch-prompt.md` |
| Other sub-phase scopes finalized | ✅ § 2.1 + master plan inheritance |

---

## 6. Operator action — verification + sign-off

Before launching 10.6.C.1:

1. **Read this report + 10.6.C.1 launch prompt** (~15 min).
2. **Verify 10.6.B.2-fix production deploy** (~2 min):
   ```bash
   node --env-file=.env.audit.local --import tsx scripts/audit-production-pages.ts \
     --auth --concurrency=2 --timeout=45000 \
     --out=tmp/audit-post-checkpoint-5.json
   ```
   Expected: 0-2 BROKEN. If ≥3 BROKEN, those become 10.6.D.2 prerequisites.
3. **Optional**: Mobile sweep at 375×667 on 10-15 cabinet pages — informs whether 10.6.C.1 needs an explicit mobile-first pass per cabinet.
4. **Override any of the 8 defaults in § 3** if you disagree.
5. Reply **"go 10.6.C.1"** to launch first post-audit sub-phase.

---

## 7. Files this checkpoint produced

```
tmp/stage-10-6-a-checkpoint-5-master.md   (this report)
tmp/stage-10-6-c-1-launch-prompt.md       (first sub-phase launch instructions)
```

No code, no migrations, no tests this checkpoint.

---

⛔ **STAGE 10.6.A AUDIT COMPLETE.** Operator review + sign-off → launch 10.6.C.1.
