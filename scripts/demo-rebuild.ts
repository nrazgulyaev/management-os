/**
 * Prompt 112 — Demo projection rebuild.  Runs the four projection
 * jobs that derive owner-facing data from the canonical tables.
 *
 * Usage:
 *   npm run demo:rebuild
 *   (under the hood: node --env-file=.env.local --import tsx scripts/demo-rebuild.ts)
 *
 * Idempotent — safe to re-run.  No external API calls.  Failures on
 * any one step are logged but do not abort the rest.
 */

const url = process.env.DIRECT_URL ?? process.env.DATABASE_URL;
if (!url) {
  console.error(
    "DIRECT_URL or DATABASE_URL must be set. Copy .env.example to .env.local first.",
  );
  process.exit(1);
}

async function step<T>(label: string, fn: () => Promise<T>): Promise<void> {
  process.stdout.write(`→ ${label}…`);
  const start = Date.now();
  try {
    const out = await fn();
    const ms = Date.now() - start;
    process.stdout.write(
      ` ✓ ${ms}ms${out ? ` ${JSON.stringify(out)}` : ""}\n`,
    );
  } catch (err) {
    process.stdout.write(` ✗\n`);
    console.error(err instanceof Error ? err.message : err);
  }
}

async function main() {
  console.log("→ Arconique demo projection rebuild");
  console.log("  This refreshes owner-facing projections from the canonical tables.");
  console.log("");

  // Owner-visible events (Prompt 102).
  await step("Owner-visible events", async () => {
    const { rebuildOwnerVisibleEventsForAllOwners } = await import(
      "@/features/guest-journey/owner-events-rebuild"
    );
    const today = new Date();
    const from = new Date(today.getTime() - 90 * 24 * 60 * 60 * 1000)
      .toISOString()
      .slice(0, 10);
    const to = new Date(today.getTime() + 120 * 24 * 60 * 60 * 1000)
      .toISOString()
      .slice(0, 10);
    return rebuildOwnerVisibleEventsForAllOwners(from, to);
  });

  // Owner-booking projection (Prompt 108).
  await step("Owner-booking projection", async () => {
    const { rebuildOwnerBookingSummariesForAllOwners } = await import(
      "@/features/owner-bookings/projection"
    );
    return rebuildOwnerBookingSummariesForAllOwners();
  });

  // Owner-revenue source mix (Prompt 108).
  await step("Owner-revenue source mix", async () => {
    const { rebuildOwnerRevenueSourceMonthlyForAllOwners } = await import(
      "@/features/owner-bookings/projection"
    );
    return rebuildOwnerRevenueSourceMonthlyForAllOwners();
  });

  // Statement transparency (Prompt 110).
  await step("Statement transparency", async () => {
    const { rebuildAllStatementTransparency } = await import(
      "@/features/statement-transparency/rebuild"
    );
    return rebuildAllStatementTransparency();
  });

  console.log("");
  console.log("✓ Demo rebuild complete.");
}

main().catch((err) => {
  console.error("✗ Demo rebuild failed:", err);
  process.exit(1);
});

export {};
