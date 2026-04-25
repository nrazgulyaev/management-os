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
