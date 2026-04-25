/**
 * Apply demo seed data against `DIRECT_URL`.
 * Usage: npx tsx scripts/seed.ts
 * Idempotent — safe to re-run.
 */
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import postgres from "postgres";

const url = process.env.DIRECT_URL ?? process.env.DATABASE_URL;
if (!url) {
  console.error(
    "DIRECT_URL (preferred) or DATABASE_URL must be set. Copy .env.example to .env.local first.",
  );
  process.exit(1);
}

const file = resolve(process.cwd(), "drizzle/seed.sql");

async function main() {
  console.log("→ Reading seed file:", file);
  const sql = await readFile(file, "utf8");
  const client = postgres(url!, { max: 1, prepare: false });
  try {
    console.log("→ Applying seed…");
    await client.unsafe(sql);
    console.log("✓ Seed applied.");
  } finally {
    await client.end({ timeout: 5 });
  }
}

main().catch((err) => {
  console.error("✗ Seed failed:", err);
  process.exit(1);
});
