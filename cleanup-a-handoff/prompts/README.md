# Phase 2.5 cleanup-A — Claude Code handoff

Six small PRs that wire the deferred `queries.ts` reads from Phase 2.2-2.4.

## What's inside

```
.claude/prompts/cleanup-a/
  00-seed-cleanup-a.md     Read first — context + scope + rules
  01-channels.md           PR 1
  02-front-office.md       PR 2
  03-concierge.md          PR 3
  04-site-reports.md       PR 4
  05-sales.md              PR 5
  06-investors.md          PR 6
```

## What changed about the original assumption

The Phase 2.4 commit messages said "schema migrations deferred to a follow-up
data-wiring PR." Reading the repo at HEAD revealed:

- **All required Drizzle migrations are already in main** (last is `0111`).
- **All write paths** (`actions.ts`, `services.ts`) **are already wired** to
  real Drizzle — verified by grep, no `TODO/FIXME/stub` markers in those files.
- **Six `queries.ts` modules return empty arrays / null** — they're explicitly
  documented as "Today returns empty / stubbed."

That's the actual gap. No new tables. No schema PR needed. Six small read-path
PRs, ~50-200 lines each.

The seventh Phase 2.4 cabinet (Dynamic pricing) is already fully wired — its
reads live in `services.ts`, not a `queries.ts` file. The only stub there is
`channel-push-stub.ts`, which is the **outbound channel-manager integration**
(separate concern, not cleanup-A).

## How to ship

1. Copy `.claude/prompts/cleanup-a/` into the repo's `.claude/prompts/`.
2. In Claude Code, run prompts in order 00 → 06. Each is self-contained and
   targets a different file, so PRs 01-06 can land in parallel after 00 is
   read.
3. CLAUDE.md update at the end of the batch (one line per PR landed).

## Validation per PR

- `pnpm typecheck` clean
- `pnpm lint` clean (no new ignores)
- `pnpm test -- features/<cabinet>` if a test file exists
- Manual smoke on the cabinet route — confirm it renders with real data AND
  degrades gracefully when DB is empty (no fixtures yet — that's a separate
  cleanup-B follow-up)
