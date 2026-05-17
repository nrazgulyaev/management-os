import { readdir } from "node:fs/promises";
import { resolve } from "node:path";
import postgres from "postgres";

const url = process.env.DIRECT_URL ?? process.env.DATABASE_URL!;
const dir = resolve(process.cwd(), "drizzle");

async function main() {
  const sql = postgres(url, { max: 1, prepare: false });
  const all = (await readdir(dir))
    .filter((f) => f.endsWith(".sql") && f !== "seed.sql")
    .sort();
  // Mark every migration ≤ 0103 as applied — they already ran historically.
  const upTo = "0103";
  const backfill = all.filter((f) => f.slice(0, 4) <= upTo && /^\d{4}_/.test(f));
  console.log(`Backfilling ${backfill.length} migrations as applied.`);
  for (const file of backfill) {
    await sql`
      INSERT INTO _arconique_migrations (filename, applied_by)
      VALUES (${file}, ${"legacy_backfill_manual"})
      ON CONFLICT (filename) DO NOTHING
    `;
  }
  console.log("Done.");
  await sql.end();
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
