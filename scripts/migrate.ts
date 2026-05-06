/**
 * Apply migrations against `DIRECT_URL` (preferred) or `DATABASE_URL` in
 * lexical order, tracking applied files in `_arconique_migrations`.
 *
 *   npx tsx scripts/migrate.ts          # apply all pending
 *   npx tsx scripts/migrate.ts 0037     # only files starting with "0037"
 *   npx tsx scripts/migrate.ts --force  # re-apply pending+already-applied
 *                                       #   (idempotent SQL is required)
 *
 * Each migration is hand-authored and idempotent. Re-running with no
 * pending migrations completes in < 2 seconds: a single SELECT against
 * `_arconique_migrations`.
 *
 * The first time this runner sees a database that already has
 * migrations 0000..NNNN applied (the legacy state — Stage 2.2.B and
 * earlier), it backfills those names into `_arconique_migrations` so
 * the next run sees them as applied. Detection: the legacy schema
 * always has `app_users` (created in 0000); when present without a
 * registry row, we backfill every `.sql` file whose lexical prefix is
 * <= the highest schema marker we can detect, then fall through to
 * apply only the truly-new files.
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
const args = process.argv.slice(2);
const force = args.includes("--force");
const only = args.find((a) => !a.startsWith("--"));

async function main() {
  const all = (await readdir(dir))
    .filter((f) => f.endsWith(".sql") && f !== "seed.sql")
    .sort();

  if (all.length === 0) {
    console.error("No migration files found.");
    process.exit(1);
  }

  const client = postgres(url!, {
    max: 1,
    prepare: false,
    onnotice: () => {
      /* suppress harmless NOTICE logs from idempotent DDL */
    },
  });
  try {
    // 1) Ensure the registry exists. The registry is a tiny table and is
    // intentionally NOT under RLS (operational metadata only).
    await client.unsafe(`
      CREATE TABLE IF NOT EXISTS _arconique_migrations (
        filename TEXT PRIMARY KEY,
        applied_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        applied_by TEXT
      );
    `);

    // 2) Legacy backfill: if the schema already has tables from 0000
    // (`app_users` is the canonical marker) but the registry is empty,
    // backfill all migration filenames at or below the highest one we
    // can prove is applied (we use 0036 as the Stage 2.2.B marker via
    // `dev_notification_rules` table).
    const [{ count: registered }] = await client.unsafe<{ count: number }[]>(
      `SELECT count(*)::int AS count FROM _arconique_migrations`,
    );
    if (registered === 0) {
      const [{ exists: hasAppUsers }] = await client.unsafe<{ exists: boolean }[]>(
        `SELECT EXISTS (SELECT 1 FROM information_schema.tables
         WHERE table_schema='public' AND table_name='app_users') AS exists`,
      );
      if (hasAppUsers) {
        const [{ exists: hasDevNotif }] = await client.unsafe<{ exists: boolean }[]>(
          `SELECT EXISTS (SELECT 1 FROM information_schema.tables
           WHERE table_schema='public' AND table_name='dev_notification_rules') AS exists`,
        );
        // Conservatively backfill every file up to the highest known
        // applied marker. If 0036's table exists, every 00xx ≤ 0036 is
        // applied. Otherwise, the highest contiguous block before
        // dev_notification_rules is whatever has table evidence; for the
        // current codebase we just walk the file list and check a couple
        // of cheap markers.
        const cutoff = hasDevNotif ? "0036" : "0033";
        const backfill = all.filter(
          (f) => f.slice(0, 4) <= cutoff && /^\d{4}_/.test(f),
        );
        if (backfill.length > 0) {
          console.log(
            `→ Legacy backfill: marking ${backfill.length} pre-existing migrations as applied (cutoff ${cutoff}).`,
          );
          for (const file of backfill) {
            await client`
              INSERT INTO _arconique_migrations (filename, applied_by)
              VALUES (${file}, ${"legacy_backfill"})
              ON CONFLICT (filename) DO NOTHING
            `;
          }
        }
      }
    }

    // 3) Compute pending list.
    const applied = new Set(
      (
        await client.unsafe<{ filename: string }[]>(
          `SELECT filename FROM _arconique_migrations`,
        )
      ).map((r) => r.filename),
    );
    let pending = all.filter((f) => force || !applied.has(f));
    if (only) pending = pending.filter((f) => f.startsWith(only));

    if (pending.length === 0) {
      console.log("→ No pending migrations.");
      return;
    }

    console.log(`→ Applying ${pending.length} migration(s):`);
    for (const file of pending) {
      const path = resolve(dir, file);
      const startedAt = Date.now();
      console.log(`  → ${file}`);
      const sqlText = await readFile(path, "utf8");
      await client.unsafe(sqlText);
      await client`
        INSERT INTO _arconique_migrations (filename, applied_by)
        VALUES (${file}, ${"migrate.ts"})
        ON CONFLICT (filename) DO UPDATE SET applied_at = now()
      `;
      console.log(`  ✓ ${file} (${Date.now() - startedAt}ms)`);
    }
  } finally {
    await client.end({ timeout: 5 });
  }
}

main().catch((err) => {
  console.error("✗ Migration failed:", err);
  process.exit(1);
});
