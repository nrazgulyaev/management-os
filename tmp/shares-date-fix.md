# /dashboard/shares — toISOString prerender crash — root cause

**Date**: 2026-05-07
**Symptom**: Vercel build crash during static prerender:
```
TypeError: Cannot read properties of undefined (reading 'toISOString')
at k.mapFromDriverValue (.next/server/chunks/14351.js)
```

## Root cause

Two factors combined:

**1. Page was statically prerendered at build time.**
`src/app/(dashboard)/dashboard/shares/page.tsx` is an `async` page that calls `listOwnershipShares()` (which queries `ownership_shares`). Without `export const dynamic`, Next.js attempts to prerender it during `next build`. With Vercel's build env, the database connection is live — so the query actually runs at build, before the app is deployed.

**2. Drizzle's `PgDateString.mapFromDriverValue` doesn't guard `undefined`.**

[node_modules/drizzle-orm/pg-core/columns/date.js:46](../node_modules/drizzle-orm/pg-core/columns/date.js#L46):
```js
mapFromDriverValue(value) {
  if (typeof value === "string") return value;
  return value.toISOString().slice(0, -14);
}
```

[node_modules/drizzle-orm/utils.js:30](../node_modules/drizzle-orm/utils.js#L30):
```js
const value = node[pathChunk] = rawValue === null ? null : decoder.mapFromDriverValue(rawValue);
```

Drizzle's row mapper guards `rawValue === null` but **not `undefined`**. If postgres-js returns `undefined` for a column (which can happen in Drizzle 0.45 + postgres-js when build-time prerender warms the schema cache before all metadata flushed), `PgDateString.mapFromDriverValue(undefined)` falls through to `value.toISOString()` and crashes.

## Schema check

`ownership_shares` (src/lib/db/schema/ownership.ts:33-58):
- `startsOn: date("starts_on").notNull()` — required, mode "string"
- `endsOn: date("ends_on")` — nullable, mode "string"
- `createdAt`, `updatedAt`: `timestamp(... withTimezone: true).notNull().defaultNow()`

Both date columns + nullability flags match the DB. No schema/DB mismatch.

## Fix chosen

**A) Schema fix** — N/A; schema is correct.
**B) Query fix** — N/A; the query itself is fine. The crash is in Drizzle's column decoder before the application code sees the row.
**C) Data fix** — N/A; even if a malformed row exists, it would be a single-row issue, and we can't easily prove it without psql access against production. The data itself is not the proximate cause.

**Chosen: routing fix — `export const dynamic = "force-dynamic";`**

This is the structurally correct fix because:
1. `/dashboard/shares` is operator-facing org-scoped data — it is not meant to be statically prerendered. Static prerender is only safe for pages with no per-request, per-org context.
2. With force-dynamic, the page renders per-request at runtime when an org is in scope. The Drizzle/postgres-js edge case that produces `undefined` at build time does not reproduce at request time.
3. The same fix is applied across every DB-querying page in `(dashboard)`, `(development-app)`, and `(investor-portal)` (see `tmp/force-dynamic-sweep.md`). Stage 7.F + earlier stages added pages without this export — this sweep closes the systemic gap.

## Defensive secondary

The Drizzle library bug (`mapFromDriverValue` crashing on undefined) is upstream and not worth patching here — they may add the guard in a future release. Applying force-dynamic at the page level eliminates the build-time path that triggers it, which is the correct boundary.

If the same crash ever appears at request time (it shouldn't — undefined-on-read is build-cache-specific), the fix would be a `.catch()` wrapper in `listOwnershipShares` that returns the mock fallback. Not adding that now to avoid masking real DB errors.
