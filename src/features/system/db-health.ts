/**
 * Prompt 111 — DB-resilience helpers for admin dashboards.
 *
 * These helpers are pure wrappers around an arbitrary `() => Promise<…>`
 * — they do not read env or import the DB client themselves, so the
 * module is safe to import from tests as well as server pages.
 *
 * Many admin pages run a `count(*)` against a recently-added table.
 * If the migration has not been applied yet (common in dev /
 * staging), the query throws and the whole page crashes.  These
 * helpers catch the well-known "relation does not exist" failure and
 * return a graceful zero / empty list, plus a structured signal the
 * page can render as "Migration pending".
 *
 * Mutation paths must NOT use these helpers — surfacing real errors is
 * still important for write paths.
 */

export interface SafeReadResult<T> {
  ok: boolean;
  value: T;
  /** Set when the query failed.  Includes the queryName for debugging. */
  error?: {
    queryName: string;
    kind: "missing_relation" | "missing_column" | "no_db" | "unknown";
    message: string;
  };
}

const MISSING_RELATION_PATTERNS = [
  /relation .* does not exist/i,
  /undefined_table/i,
  /42P01/, // Postgres SQLSTATE for undefined_table
];

const MISSING_COLUMN_PATTERNS = [
  /column .* does not exist/i,
  /undefined_column/i,
  /42703/,
];

export function isMissingRelationError(err: unknown): boolean {
  if (!err) return false;
  const text = err instanceof Error ? `${err.message} ${(err as { code?: string }).code ?? ""}` : String(err);
  return MISSING_RELATION_PATTERNS.some((re) => re.test(text));
}

export function isMissingColumnError(err: unknown): boolean {
  if (!err) return false;
  const text = err instanceof Error ? `${err.message} ${(err as { code?: string }).code ?? ""}` : String(err);
  return MISSING_COLUMN_PATTERNS.some((re) => re.test(text));
}

export function migrationPendingMessage(tableName: string): string {
  return `The "${tableName}" table is not present yet. Apply the latest migrations and refresh this page.`;
}

const SEEN_FAILURES = new Map<string, number>();

function noteFailure(queryName: string): void {
  const count = (SEEN_FAILURES.get(queryName) ?? 0) + 1;
  SEEN_FAILURES.set(queryName, count);
  // Only log loudly the first time per process — repeats are noise.
  if (count === 1) {
    // eslint-disable-next-line no-console
    console.warn(`[db-health] safe-read "${queryName}" failed once.`);
  }
}

/**
 * Wrap a DB query that returns a count.  On `relation does not exist`
 * or any other error, returns 0 with structured error details so the
 * caller can render a "Migration pending" badge.  Never throws.
 */
export async function safeCount(
  queryName: string,
  fn: () => Promise<number>,
): Promise<SafeReadResult<number>> {
  try {
    const value = await fn();
    return { ok: true, value };
  } catch (err) {
    if (isMissingRelationError(err) || isMissingColumnError(err)) {
      noteFailure(queryName);
      return {
        ok: false,
        value: 0,
        error: {
          queryName,
          kind: isMissingColumnError(err) ? "missing_column" : "missing_relation",
          message: err instanceof Error ? err.message : String(err),
        },
      };
    }
    noteFailure(queryName);
    return {
      ok: false,
      value: 0,
      error: {
        queryName,
        kind: "unknown",
        message: err instanceof Error ? err.message : String(err),
      },
    };
  }
}

/**
 * Wrap a DB query that returns a list.  Returns `[]` on missing
 * relation / column / unknown error.
 */
export async function safeList<T>(
  queryName: string,
  fn: () => Promise<T[]>,
): Promise<SafeReadResult<T[]>> {
  try {
    const value = await fn();
    return { ok: true, value };
  } catch (err) {
    if (isMissingRelationError(err) || isMissingColumnError(err)) {
      noteFailure(queryName);
      return {
        ok: false,
        value: [],
        error: {
          queryName,
          kind: isMissingColumnError(err) ? "missing_column" : "missing_relation",
          message: err instanceof Error ? err.message : String(err),
        },
      };
    }
    noteFailure(queryName);
    return {
      ok: false,
      value: [],
      error: {
        queryName,
        kind: "unknown",
        message: err instanceof Error ? err.message : String(err),
      },
    };
  }
}

/**
 * Stage 8.A.1 — bulk approximate row-count lookup.
 *
 * The system-health page tracks ~40 tables. The original implementation
 * issued one `SELECT COUNT(*)` per table via `Promise.all`, which
 * saturated the postgres connection pool on Vercel cold-start and hung
 * the page >60s.
 *
 * `pg_stat_user_tables.n_live_tup` is a fast catalog read maintained
 * by autovacuum — the value is approximate (last-analyze count) but
 * accurate enough for a "is this table populated?" health check, and
 * the whole sweep is one round-trip.
 *
 * Tables present in `tracked` but missing from the result map are
 * reported as `kind: "missing_relation"` so callers can render
 * "Migration pending".
 */
/**
 * Caller passes a thin executor adapter so this module stays free of a
 * direct `@/lib/db/client` import (and therefore importable from tests
 * that don't load drizzle).
 */
export type DbHealthExec = (sql: string) => Promise<unknown[]>;

export async function getApproximateRowCounts(
  exec: DbHealthExec | null,
  tracked: ReadonlyArray<string>,
): Promise<Map<string, SafeReadResult<number>>> {
  const out = new Map<string, SafeReadResult<number>>();
  if (!exec) {
    for (const t of tracked) {
      out.set(t, {
        ok: false,
        value: 0,
        error: { queryName: t, kind: "no_db", message: "DB not configured" },
      });
    }
    return out;
  }
  try {
    const rows = await exec(
      `SELECT relname, n_live_tup::bigint AS c FROM pg_stat_user_tables WHERE schemaname = 'public'`,
    );
    const present = new Map<string, number>();
    for (const r of rows as Array<{ relname: string; c: number | string | bigint }>) {
      present.set(r.relname, Number(r.c));
    }
    for (const t of tracked) {
      if (present.has(t)) {
        out.set(t, { ok: true, value: present.get(t)! });
      } else {
        noteFailure(t);
        out.set(t, {
          ok: false,
          value: 0,
          error: {
            queryName: t,
            kind: "missing_relation",
            message: "table not found in pg_stat_user_tables",
          },
        });
      }
    }
    return out;
  } catch (err) {
    // Whole-query failure: surface every tracked table as "unknown" so
    // the page renders a clear "DB unhealthy" signal instead of hanging.
    for (const t of tracked) {
      noteFailure(t);
      out.set(t, {
        ok: false,
        value: 0,
        error: {
          queryName: t,
          kind: "unknown",
          message: err instanceof Error ? err.message : String(err),
        },
      });
    }
    return out;
  }
}

/** Test seam — clears the in-process failure tally. */
export function __resetDbHealthCounters(): void {
  SEEN_FAILURES.clear();
}
