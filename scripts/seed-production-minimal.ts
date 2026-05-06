/**
 * Prompt 113 — Production-minimal seed.
 *
 * For now this script is intentionally a documented stub.  Production
 * environments should be seeded with reference data only:
 *   - roles + permissions (already inserted by migration 0000)
 *   - default notification templates
 *   - default booking channels
 *   - default tax / finance categories where applicable
 *   - the cron job catalog
 *
 * Demo owners / villas / bookings / guests / tokens / MFA factors are
 * NEVER created in production.  The full demo seed lives in
 * `drizzle/seed.sql` and is gated behind `npm run db:seed` —
 * production deployments should never run that command.
 *
 * This stub prints what it would do and exits.  When we are ready to
 * automate the production-only inserts, replace the body with a thin
 * SQL applier that reads only the production-safe sections.
 */

const url = process.env.DIRECT_URL ?? process.env.DATABASE_URL;
if (!url) {
  console.error(
    "DIRECT_URL or DATABASE_URL must be set to inspect the database.",
  );
  process.exit(2);
}

console.log("Production-minimal seed");
console.log("=======================");
console.log(
  "This script is currently a documented stub — see docs/PRODUCTION-SEED-STRATEGY.md",
);
console.log("");
console.log("Production must include:");
console.log("  - roles + permissions (auto-applied by migration 0000)");
console.log("  - default notification templates (auto-applied by migrations)");
console.log("  - default booking channels (re-apply via migration if missing)");
console.log("  - the cron job catalog (auto-seeded on first job-runner request)");
console.log("");
console.log(
  "Production must NEVER include: demo owners / demo villas / demo bookings /",
);
console.log(
  "demo guests / demo tokens / demo AI conversations / demo MFA factors.",
);
console.log("");
console.log(
  "If you need to provision a fresh production database, follow the steps in",
);
console.log(
  "docs/SUPABASE-PROVISIONING-CHECKLIST.md and docs/DEPLOYMENT-RUNBOOK.md.",
);
console.log("");
console.log(
  "Stub exit (no rows inserted).  Replace this file with the production",
);
console.log(
  "applier when it's time to automate.  npm run db:seed is intentionally",
);
console.log("the demo seed — keep it out of production pipelines.");

process.exit(0);

export {};
