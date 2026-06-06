/**
 * STAGING-DB-1 safety guard.
 *
 * Refuses to proceed unless the currently-loaded environment is explicitly a
 * STAGING environment — i.e. `ARCONIQUE_DB_ENV=staging`, which is set ONLY in
 * `.env.staging.local`. This stops `db:migrate:staging` (and any caller that
 * chains this guard) from ever running against production credentials, even if
 * a prod `DATABASE_URL` happens to be exported in the ambient shell.
 *
 * It also prints the resolved DB host (no secrets) so you can eyeball the
 * target before anything writes.
 *
 * Used via `&&` in the `db:migrate:staging` npm script.
 */
const dbEnv = process.env.ARCONIQUE_DB_ENV;
if (dbEnv !== "staging") {
  console.error(
    "[staging-guard] REFUSING: ARCONIQUE_DB_ENV must be 'staging' " +
      "(set it in .env.staging.local).\n" +
      "This guard prevents staging migrations/seeds from touching production.",
  );
  process.exit(1);
}

const conn = process.env.DIRECT_URL ?? process.env.DATABASE_URL;
if (!conn) {
  console.error(
    "[staging-guard] REFUSING: no DIRECT_URL/DATABASE_URL found. " +
      "Fill them in .env.staging.local first.",
  );
  process.exit(1);
}

try {
  const u = new URL(conn);
  console.log(
    `[staging-guard] OK — env=staging, target host=${u.hostname}, db=${u.pathname.slice(1)}.\n` +
      "Verify this is your STAGING Supabase (NOT prod) before continuing.",
  );
} catch {
  console.log("[staging-guard] OK — env=staging (DB host could not be parsed for display).");
}

export {};
