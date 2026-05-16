/**
 * HF-9 — script-friendly Drizzle client.
 *
 * Mirror of `src/lib/db/client.ts` MINUS the `import "server-only"`
 * runtime guard and the `@/lib/env` indirection. Both pull in Next.js
 * runtime modules that aren't available when running raw `tsx
 * scripts/...`.
 *
 * Use this from any CLI script under `scripts/`. NEVER import this
 * from production code — the server-only-guarded `src/lib/db/client.ts`
 * is what protects DB credentials from accidentally leaking into a
 * client bundle. This file would not provide that protection.
 *
 * Pool config is intentionally tiny (`max: 1`) — scripts run, do
 * their work, exit. No long-lived connections.
 */

import { drizzle, type PostgresJsDatabase } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "../../src/lib/db/schema";

export type DB = PostgresJsDatabase<typeof schema>;

let cachedClient: ReturnType<typeof postgres> | null = null;
let cachedDb: DB | null = null;

/**
 * Returns the Drizzle client when DATABASE_URL is set. Throws on
 * missing config — scripts should fail loudly, not silently.
 */
export function getDb(): DB {
  if (cachedDb) return cachedDb;
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error(
      "DATABASE_URL is not set. Add it to .env.local or pass it inline before running the script.",
    );
  }
  cachedClient = postgres(url, {
    max: 1,
    prepare: false,
    idle_timeout: 30,
  });
  cachedDb = drizzle(cachedClient, { schema });
  return cachedDb;
}

/**
 * Explicit close — call at the end of a script so the process exits
 * cleanly instead of hanging on the open pool.
 */
export async function closeDb(): Promise<void> {
  if (cachedClient) {
    await cachedClient.end();
    cachedClient = null;
    cachedDb = null;
  }
}

export { schema };
