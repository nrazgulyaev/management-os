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

/** Test seam — clears the in-process failure tally. */
export function __resetDbHealthCounters(): void {
  SEEN_FAILURES.clear();
}
