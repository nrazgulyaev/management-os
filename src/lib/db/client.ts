import "server-only";

import { drizzle, type PostgresJsDatabase } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";
import { env, isDbConfigured } from "@/lib/env";

export type DB = PostgresJsDatabase<typeof schema>;

declare global {
  // eslint-disable-next-line no-var
  var __arconique_pg__: ReturnType<typeof postgres> | undefined;
  // eslint-disable-next-line no-var
  var __arconique_db__: DB | undefined;
}

/**
 * Returns a Drizzle client when `DATABASE_URL` is configured. When the env
 * is missing we return `null` so services can fall back to mock data and
 * keep the marketing/demo experience usable without a backend.
 */
export function getDb(): DB | null {
  if (!isDbConfigured()) return null;
  if (!env.server.DATABASE_URL) return null;

  if (!global.__arconique_pg__) {
    global.__arconique_pg__ = postgres(env.server.DATABASE_URL, {
      max: 5,
      prepare: false,
      idle_timeout: 30,
    });
  }
  if (!global.__arconique_db__) {
    global.__arconique_db__ = drizzle(global.__arconique_pg__, { schema });
  }
  return global.__arconique_db__;
}

/**
 * Returns a guaranteed client. Throws when not configured — used in tooling
 * (migrations, seed) where missing config is a real error.
 */
export function requireDb(): DB {
  const db = getDb();
  if (!db) {
    throw new Error(
      "Database is not configured. Set DATABASE_URL (and DIRECT_URL for migrations).",
    );
  }
  return db;
}

export { schema };

/**
 * SHAPE-FIX-1 — narrow helper for unpacking `db.execute(sql\`…\`)` results.
 *
 * Drizzle's runtime result shape varies by driver:
 *   · `postgres-js` (this project)  → returns a tagged `Array<Row>` directly
 *                                       (rows live at `result[0]`, `result[1]`, …)
 *   · `node-postgres` / `pg`         → returns `{ rows, rowCount, fields, … }`
 *
 * A lot of in-repo code was originally written against the `pg` shape and casts
 * `(result as unknown as { rows: ... }).rows ?? []`. With the `postgres-js`
 * driver `.rows` is `undefined` so that expression silently evaluates to `[]`
 * — the row IS returned by the DB, the JS code just drops it. The bug is
 * undetectable from a try/catch because nothing throws.
 *
 * `rowsOf<T>(result)` is the surgical accessor for the two sites this fix
 * lands at (vault.ts + ai-hub-cabinet-queries.ts). The wider codemod across
 * the remaining ~130 sites is tracked as DB-SHAPE-CODEMOD-1 (see backlog).
 */
export function rowsOf<T>(execResult: unknown): T[] {
  return Array.isArray(execResult) ? (execResult as T[]) : [];
}
