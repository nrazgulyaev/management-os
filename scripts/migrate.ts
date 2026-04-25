/**
 * Apply migrations against `DIRECT_URL` in numeric order.
 *   npx tsx scripts/migrate.ts          # all migrations
 *   npx tsx scripts/migrate.ts 0001     # only files starting with "0001"
 *
 * Each migration file is hand-authored and idempotent — safe to re-run.
 * Files in drizzle/*.sql (excluding seed.sql) are applied in lexical order.
 */
import { readdir, readFile } from "node:fs/promises";
import { resolve } from "node:path";
import postgres from "postgres";

const url = process.env.DIRECT_URL ?? process.env.DATABASE_URL;
if (!url) {
  console.error(
    "DIRECT_URL (preferred) or DATABASE_URL must be set. Copy .env.example to .env.local first.",
  );
  process.exit(1);
}

const dir = resolve(process.cwd(), "drizzle");
const only = process.argv[2];

async function main() {
  const all = (await readdir(dir))
    .filter((f) => f.endsWith(".sql") && f !== "seed.sql")
    .filter((f) => !only || f.startsWith(only))
    .sort();

  if (all.length === 0) {
    console.error("No migration files found.");
    process.exit(1);
  }

  const client = postgres(url!, { max: 1, prepare: false });
  try {
    for (const file of all) {
      const path = resolve(dir, file);
      console.log(`→ Applying ${file}`);
      const sql = await readFile(path, "utf8");
      await client.unsafe(sql);
      console.log(`✓ ${file}`);
    }
  } finally {
    await client.end({ timeout: 5 });
  }
}

main().catch((err) => {
  console.error("✗ Migration failed:", err);
  process.exit(1);
});
