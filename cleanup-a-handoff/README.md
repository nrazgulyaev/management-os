# Phase 2.5 cleanup-A — Claude Code handoff

**Six small PRs** that wire the deferred `queries.ts` reads from Phase 2.2-2.4.

## What's inside

```
prompts/
  README.md                 Same as this file
  00-seed-cleanup-a.md      Read first — context + scope + rules
  01-channels.md            PR 1 — Mgmt · Channels
  02-front-office.md        PR 2 — Mgmt · Front office
  03-concierge.md           PR 3 — Mgmt · Concierge
  04-site-reports.md        PR 4 — Dev  · Site reports
  05-sales.md               PR 5 — Dev  · Sales
  06-investors.md           PR 6 — Dev  · Investors
```

## How to ship to the repo

In the `management-os` repo, the canonical location for Claude Code prompts is
`.claude/prompts/<batch>/`. Copy this batch in:

```bash
mkdir -p .claude/prompts/cleanup-a
cp /path/to/cleanup-a-handoff/prompts/*.md .claude/prompts/cleanup-a/
```

Then in Claude Code, run prompts in order 00 → 06. Each is self-contained and
targets a different file — PRs 01-06 can land in parallel after 00 is read.

## What changed about the original assumption

The Phase 2.4 commit messages said "schema migrations deferred to a follow-up
data-wiring PR." Reading the repo at HEAD revealed:

- **All required Drizzle migrations are already in main** (last is `0111`).
- **All write paths** (`actions.ts`, `services.ts`) **are already wired** to
  real Drizzle — verified by grep, no `TODO/FIXME/stub` markers in those files.
- **Six `queries.ts` modules return empty arrays / null** — they're explicitly
  documented in their file headers as "Today returns empty / stubbed."

That's the actual gap. No new tables. No schema PR needed. Six small read-path
PRs, ~50-200 lines each.

The seventh Phase 2.4 cabinet (Dynamic pricing) is already fully wired — its
reads live in `services.ts`, not a `queries.ts` file. The only stub there is
`channel-push-stub.ts`, which is the **outbound channel-manager integration**
(separate concern, not cleanup-A).

## Validation per PR

- `pnpm typecheck` clean
- `pnpm lint` clean (no new ignores)
- `pnpm test -- features/<cabinet>` if a test file exists
- Manual smoke on the cabinet route — confirm it renders with real data AND
  degrades gracefully when DB is empty (no fixtures yet — that's a separate
  cleanup-B follow-up)
