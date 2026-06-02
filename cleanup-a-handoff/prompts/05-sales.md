# cleanup-A · PR 5 — Sales cabinet data wiring

**Goal.** Wire `getPipelineLanes`, `getPipelineCards`, `transitionLead`,
`getFunnelStages` in `src/features/sales/queries.ts`.

## Files

- Edit: `src/features/sales/queries.ts`
- Read for context: `src/features/sales/stage-machine.ts`,
  `src/features/sales/offer-policy.ts`,
  `src/lib/db/schema/buyers.ts`,
  `src/lib/db/schema/development.ts` (for projects),
  `src/components/sales/{pipeline-board,funnel-chart,buyer-detail,contract-page,payment-ladder,offer-modal}.tsx`

## Reference migrations

- `0036_development_os_stage_2_2_b.sql` — buyer leads / stages
- `0050_development_os_stage_4_b_3_buyer_portal_writes.sql` — stage events writes
- `0063-0065_*marketing/content/conversation_review.sql` — attribution + funnel sources

The six canonical stages (from `stage-machine.ts`):
`['lead', 'discovery', 'tour', 'offer', 'reservation', 'won']`. Plus terminal
states `'lost'` and `'on_hold'` which are not lanes (filtered out of the board
but counted in funnel).

## Per-function contract

### `getPipelineLanes(input)`

Return one lane per non-terminal stage for `project_id = input.projectId`,
scoped to org. Lane shape:
- `id` = stage code
- `label` = human label (look up via `stage-machine.ts` `STAGE_LABELS`)
- `count` = COUNT(*) of `buyer_leads` in that stage for the project
- `valueIdr` = SUM(`expected_value_idr`) for the same set
- `tone` derived from `stage-machine.ts` `STAGE_TONES`

Always return all six lanes (zero-fill missing) so the board renders the empty
columns consistently.

### `getPipelineCards(input)`

Return all `buyer_leads` for the project (non-terminal stages only) ordered by
`stage_position asc, updated_at desc`. Cap 500.

Map to `PipelineCard`:
- `id`, `stage`, `position`, `buyerName`, `unitLabel` (joined `units`), `expectedValueIdr`, `currency`
- `lastTouchAt`, `nextActionAt` from `stage_events` (latest touch / nearest future)
- `ownerUserName` from joined users
- `tags` from `buyer_leads.tags_json`
- `flags`: `{ stale: now() - last_touch > 7d, offerPending: stage='offer' && offer_status='draft' }`

### `transitionLead(input)`

1. Look up the lead by `input.cardId`.
2. Validate transition via `stage-machine.ts` `canTransition(from, to)`. If invalid, throw.
3. Update `buyer_leads.stage` to `input.to`, `stage_position = input.position`,
   `updated_at = now()`, `updated_by = input.actorUserId`.
4. Insert `stage_events` row: `lead_id`, `from_stage`, `to_stage`, `actor_user_id`,
   `note = input.note ?? null`, `at = now()`.
5. If `to === 'offer'`: also create a stub `offers` row in `draft` state so the
   offer modal has something to load. Skip if one already exists.
6. Wrap in transaction. Return `{ ok: true, eventId }`.

### `getFunnelStages(input)`

Return `FunnelStage[]` for the chart — all stages (including terminal):

```ts
['lead', 'discovery', 'tour', 'offer', 'reservation', 'won', 'lost', 'on_hold']
```

Each `{stage, label, count, conversionFromPrev}` where:
- `count` = COUNT(*) of leads that **ever reached** this stage (i.e. any
  `stage_events.to_stage = stage` row exists, not current stage). Use
  `SELECT lead_id FROM stage_events WHERE to_stage = ? GROUP BY lead_id` then count.
- `conversionFromPrev` = `count[i] / count[i-1]` formatted as % (null for `lead`).

## Acceptance

- Board renders six lanes with non-empty counts on a seeded project.
- Drag a card from `tour` → `offer` writes a `stage_events` row AND the offer stub.
- Invalid transition (e.g. `lead` → `won`) throws cleanly, no partial state.
- Funnel chart conversion percentages match a hand-computed example.
- `pnpm typecheck && pnpm lint` clean.

## Commit message

```
feat(sales): wire pipeline, transitions, funnel

Replaces Phase 2.4 dev-02 read stubs with real Drizzle queries against
buyer_leads + stage_events. transitionLead validates via stage machine
and writes the event row (and offer stub for stage='offer').

Refs: cleanup-A
```
