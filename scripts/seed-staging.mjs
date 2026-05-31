// STAGING-DB-1 — seed the STAGING database with SYNTHETIC demo data only.
//
// NO production data is copied. Each seed runs in its own process loading ONLY
// .env.staging.local (never .env.production.local), so it physically cannot
// reach prod. A guard refuses to run unless ARCONIQUE_DB_ENV=staging.
//
// Run:  npm run seed:staging   (after `npm run db:migrate:staging`)
import { existsSync } from "node:fs";
import { execFileSync } from "node:child_process";

if (process.env.ARCONIQUE_DB_ENV !== "staging") {
  console.error(
    "[seed:staging] REFUSING: ARCONIQUE_DB_ENV must be 'staging' (set it in .env.staging.local).",
  );
  process.exit(1);
}

// Order matters: base demo orgs/villas/bookings → statements → team accounts → portal.
const SEEDS = [
  "scripts/seed-arconique-demo.ts",
  "scripts/seed-arconique-demo-2.ts",
  "scripts/seed-arconique-demo-3.ts",
  "scripts/seed-statements.ts",
  "scripts/seed-test-team-accounts.ts",
  "scripts/seed-owner-portal-demo.ts", // ships with PR #28; skipped here if not present yet
];

for (const seed of SEEDS) {
  if (!existsSync(seed)) {
    console.warn(`[seed:staging] SKIP (not on this branch): ${seed}`);
    continue;
  }
  console.log(`\n[seed:staging] === ${seed} ===`);
  // Inherit stdio; throws on non-zero exit so a failing seed stops the chain.
  execFileSync(
    "node",
    ["--env-file-if-exists=.env.staging.local", "--import", "tsx", seed],
    { stdio: "inherit" },
  );
}

console.log("\n[seed:staging] done — synthetic staging seed complete.");
