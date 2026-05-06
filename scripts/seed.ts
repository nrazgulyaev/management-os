/**
 * Apply demo seed data against `DIRECT_URL`.
 *
 * Order of application:
 *   1. drizzle/seed.sql                         — base demo seed
 *   2. drizzle/seed/<*.sql in lexical order>    — per-stage incremental seeds
 *
 * Usage: npx tsx scripts/seed.ts
 * Idempotent — safe to re-run.
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

const baseFile = resolve(process.cwd(), "drizzle/seed.sql");
const extensionsDir = resolve(process.cwd(), "drizzle/seed");

async function listExtensions(): Promise<string[]> {
  try {
    const entries = await readdir(extensionsDir);
    return entries
      .filter((f) => f.endsWith(".sql"))
      .sort()
      .map((f) => resolve(extensionsDir, f));
  } catch {
    return [];
  }
}

async function main() {
  const client = postgres(url!, { max: 1, prepare: false });
  try {
    console.log("→ Reading base seed:", baseFile);
    await client.unsafe(await readFile(baseFile, "utf8"));
    console.log("✓ Base seed applied.");

    const extensions = await listExtensions();
    for (const file of extensions) {
      console.log(`→ Applying extension seed: ${file}`);
      await client.unsafe(await readFile(file, "utf8"));
      console.log(`✓ ${file}`);
    }
    if (extensions.length === 0) {
      console.log("(no per-stage extension seeds found in drizzle/seed/)");
    }
  } finally {
    await client.end({ timeout: 5 });
  }
}

main().catch((err) => {
  console.error("✗ Seed failed:", err);
  process.exit(1);
});
