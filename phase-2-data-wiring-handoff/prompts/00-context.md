# Phase 2 data-wiring — context for all 3 PRs

**Read this first.** Sets the conventions every prompt assumes.

## Source of truth

Two audit docs in the repo:

1. `docs/audits/2026-05-27-phase-2-data-wiring-scope.md` — the design doc. Lists every table, ALTER, agent registration, and seed-data requirement, with FK-dependency commentary. **Defer to this whenever a prompt seems ambiguous.**
2. `docs/audits/2026-05-28-cleanup-a-handoff-scope-correction.md` — explains why an earlier prompt batch was wrong. Useful as a guardrail: if the wiring you're writing references a table the design doc didn't list, you may have drifted off-spec.

## Schema conventions (verify before adding a file)

Layout: `src/lib/db/schema/<feature>.ts`, exported from `src/lib/db/schema/index.ts`. New files MUST be added to the index export.

Naming:
- `pgTable("snake_case_name", …)` for the DB-side table name
- Property keys are camelCase TS; column names are snake_case (e.g. `firedAt: timestamp("fired_at", { withTimezone: true })`)
- Default for `created_at` / `updated_at` columns: `withTimezone: true`, `.notNull().defaultNow()`. See `audit.ts`, `bookings.ts`.
- Primary keys: `uuid("id").primaryKey().defaultRandom()` unless the audit specifies otherwise.
- FKs: `.references(() => otherTable.id, { onDelete: "..." })`. Pick `restrict` for hard parents, `set null` for optional, `cascade` only when the audit explicitly calls for it.
- Enums: prior audit-style enums (`status`, `kind`, `severity`, etc.) are stored as `text("…").notNull().default("…")` with a code-side TS union type. **Do NOT introduce `pgEnum`** — the existing schema deliberately doesn't use them.

Indices: every new table gets at least one index on its primary FK + an index on whatever column drives the most common query (status, timestamp, etc.). Mirror the patterns in `bookings.ts`.

Types: every new table exports `export type X = typeof xTable.$inferSelect;` and `export type NewX = typeof xTable.$inferInsert;`.

Migrations: Drizzle generates them — DO NOT hand-write `drizzle/0NNN_*.sql`. Run `pnpm db:generate <name>` after the TS schema is correct.

## Audit logging

Use the existing `auditEvents` in `src/lib/db/schema/audit.ts` for any privileged action (payout edit, statement override, etc.). Pattern: insert one row per logged action with a dotted `action` string. See `audit.ts` for the field list.

## AI agent registration

Two pieces:

1. `src/features/ai-agents/registry.ts` — declares agent codes. Currently only `statement-preparer` and `owner-intelligence` are present. Each prompt's "agent registrations" section adds entries.
2. `src/features/jobs/definitions.ts` + `actions.ts` — cron schedule. Pattern: one file per job (e.g. `statement-anomaly-detector-job.ts`), registered in `definitions.ts`, wired in `actions.ts`.

Agent business logic is **already written** in `src/features/ai-agents/<domain>/*.ts`. You're not writing the agents — you're plumbing the cron + registry.

## Seed data

Lands in `db/seed/phase-2-data.ts`. Each PR adds its own product-scoped section to that file (mgmt → dev → owner). The seed must be **idempotent** — wrapped in upserts keyed on a deterministic field (booking_code, ref, etc.) so re-running doesn't double up.

## Validation per PR

Each PR ends with:

- `pnpm db:generate phase-2-mgmt|dev|owner` (or whatever the slice is named) — produces a new `drizzle/NNNN_*.sql`
- `pnpm db:migrate` — applies clean against a fresh DB
- `pnpm db:seed` — applies clean after migrate
- `pnpm typecheck` — clean
- `pnpm lint` — clean
- `pnpm smoke:routes` — 819 routes, 0 fatal

If any of those fail, the PR isn't ready. Don't push.

## Commit message format

```
feat(phase-2-data-wiring/<slice>): land <count> tables, <ALTER list>, <agent count> agent crons

Per docs/audits/2026-05-27-phase-2-data-wiring-scope.md.
<one-line summary of which UIs this unblocks>

Refs: phase-2-data-wiring
```
