# Phase 2 data-wiring · Packet C — second-layer gaps

**Status:** Packet A/B (PRs 1-3) closed — schemas + ALTERs + 4 owner-portal queries wired. Commits `2754de9`, `675c424`, `340294a`.

Packet C closes the **honest gaps flagged in those PRs' commit bodies** — the second-layer work needed to take the Owner Portal off mock data end-to-end + the cron-runner plumbing for two registered agents.

## What's inside

```
prompts/
  README.md                Read this first (this file)
  00-context.md            Conventions (same as Packet A; cross-ref)
  01-owner-data-l2.md      PR 1 — 3 new tables + 3 query fns
  02-pdf-bundle.md         PR 2 — src/lib/pdf/ + generate-bundle wiring
  03-cron-runners.md       PR 3 — statement-preparer + owner-concierge plumbing
```

## What lands

| # | PR | Scope | Sessions |
|---|---|---|---|
| 1 | `phase-2-data-l2(owner)` | 3 tables (`villa_photos`, `owner_stays`, `owner_activity_log`) + wire `get-villa.ts` photos + maintenance log, `get-calendar.ts` events + pipeline, `get-home.ts` recentActivity. Seed extension. | ~1 |
| 2 | `phase-2-data-l2(pdf)` | New `src/lib/pdf/` module (PDF stitcher utility) + wire `generate-bundle.ts` off its stub URL. | ~1 |
| 3 | `phase-2-data-l2(cron)` | Job-runner files for `statement-preparer` (1st-of-month cron) and `owner-concierge` (post-insert action hook on `owner_messages`). Wires both into `definitions.ts` / action layer. | ~1 |

Plus the small base-seed hotfix (`hotfix-base-seed-conflict.md` — already on disk) should land first or alongside, so auto-seed unblocks.

## Sequence

1. **Apply base-seed hotfix** (separate prompt, 5 lines) → `pnpm db:seed` runs clean again
2. **PR 1 (owner-data-l2)** — biggest piece, unblocks Home / Calendar / Villa pages of Owner Portal
3. **PR 2 (pdf-bundle)** — independent, can run in parallel with PR 3
4. **PR 3 (cron-runners)** — independent, can run in parallel with PR 2

## After Packet C lands

Owner Portal renders real data end-to-end. Mgmt's statement-preparer runs on schedule. The concierge agent triggers on owner messages. Phase 2 data-wiring is genuinely done — no more "deferred" lines in commit bodies for this domain.

Next horizon: Packet B (route refactor — switching cabinet routes from `services.ts` to forward-looking `queries.ts` surfaces). Separate batch, separate context.
