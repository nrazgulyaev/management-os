/**
 * Stage 8.F / 9.D — invariant-test DB shim.
 *
 * Tests under `tests/invariants/*.test.ts` need a Postgres connection
 * but cannot import `@/lib/db/client` because that module starts with
 * `import "server-only"` — a Next.js build-time sentinel that doesn't
 * resolve under `tsx --test`.
 *
 * This shim opens a `postgres` connection directly using DATABASE_URL
 * (preferring DIRECT_URL when set, since invariants often need to
 * bypass Supabase's pooler for cross-schema reads of `auth.users`).
 *
 * Connection is opened lazily and reused for the test process lifetime.
 * `closeInvariantDb()` is exported for tests that want explicit cleanup.
 */

import postgres from "postgres";

let cached: ReturnType<typeof postgres> | null = null;

function resolveUrl(): string | null {
  return process.env.DIRECT_URL || process.env.DATABASE_URL || null;
}

export function dbAvailable(): boolean {
  return Boolean(resolveUrl());
}

export function getInvariantSql(): ReturnType<typeof postgres> {
  if (cached) return cached;
  const url = resolveUrl();
  if (!url) {
    throw new Error(
      "[invariants] DATABASE_URL / DIRECT_URL is not set — call dbAvailable() first and skip the test if false.",
    );
  }
  cached = postgres(url, {
    prepare: false,
    // Single-process, short-lived: no need for a pool.
    max: 1,
    // Don't transform column names; we test against pg_class etc. with
    // raw snake_case identifiers.
    transform: undefined,
  });
  return cached;
}

export async function closeInvariantDb(): Promise<void> {
  if (!cached) return;
  await cached.end({ timeout: 1 });
  cached = null;
}
