# Packet C · context (read first)

**This is the second-wave data-wiring batch.** Most conventions inherit from `phase-2-data-wiring/00-context.md` (Packet A) — read that first if you haven't.

Specific to Packet C:

## What's NOT new

This batch builds on the schema and patterns established in PRs 1-3 (commits 2754de9, 675c424, 340294a). No new conventions, no new helpers needed.

- Schema convention: same as Packet A — `pgTable("snake")`, camelCase TS, `text("…")` for enums, no `pgEnum`.
- Indices: at least one per FK + one on the most-queried column.
- Types: `$inferSelect` + `$inferInsert` exports.
- Migrations: Drizzle-generated; if `pnpm db:generate` hits the BigInt bug, hand-write the SQL following the pattern in `drizzle/0112_phase_2_mgmt.sql` + `0113` + `0114`.
- Seed: append to existing `drizzle/seed/phase-2-*.sql` files (one new section per PR) or create new sliced files.

## Honest accounting

Each PR's commit body should call out:
- What it landed
- What it skipped (and why — schema gap, missing fixture, etc.)
- Validation results

Same honesty norm as Packet A.

## Per-PR validation

```
pnpm db:generate <slice-name>        # or hand-write per the existing pattern
pnpm db:migrate                       # clean against fresh DB
pnpm db:seed                          # clean (requires base-seed hotfix applied)
pnpm typecheck && pnpm lint
pnpm smoke:routes                     # 819 routes, 0 fatal
```

Manual smoke per PR is described in each prompt's last section.

## Commit message format

```
feat(phase-2-data-l2/<slice>): <one-line summary>

<2-3 sentence body — what was the gap, what landed, what's next>

Refs: phase-2-data-wiring, packet-c
```
