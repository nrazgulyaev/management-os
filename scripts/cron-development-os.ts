/**
 * Dev OS cron orchestrator — for environments that schedule jobs via
 * GitHub Actions / external schedulers instead of Vercel Cron.
 *
 * Loops over the seven Dev OS JobKeys and calls the same `executeJob`
 * dispatcher the HTTP routes use. Each job is wrapped by
 * `withJobRun` and `acquireJobLock` (inside `executeJob`), so behavior
 * matches the HTTP path exactly.
 *
 * Usage:
 *   npx tsx scripts/cron-development-os.ts            # run all 7
 *   npx tsx scripts/cron-development-os.ts <jobKey>   # run one
 */

import { executeJob } from "@/features/jobs/actions";
import { DEV_OS_JOB_KEYS } from "@/lib/development/server/cron";

const TARGET = process.argv[2];

async function main() {
  const jobs = TARGET
    ? [TARGET as (typeof DEV_OS_JOB_KEYS)[number]]
    : DEV_OS_JOB_KEYS;

  if (TARGET && !DEV_OS_JOB_KEYS.includes(TARGET as never)) {
    console.error(`Unknown Dev OS job key: ${TARGET}`);
    console.error(`Valid keys: ${DEV_OS_JOB_KEYS.join(", ")}`);
    process.exit(2);
  }

  console.log(`→ Running ${jobs.length} Dev OS job${jobs.length === 1 ? "" : "s"}`);

  let failed = 0;
  for (const jobKey of jobs) {
    console.log(`\n[${jobKey}] starting`);
    try {
      const { jobRunId, outcome } = await executeJob(jobKey, "cron", null);
      console.log(
        `[${jobKey}] ${outcome.status} · jobRunId=${jobRunId ?? "-"} · ${outcome.summary}`,
      );
      if (outcome.status === "failed") failed += 1;
    } catch (err) {
      const msg = err instanceof Error ? err.message : "unknown";
      console.error(`[${jobKey}] uncaught: ${msg}`);
      failed += 1;
    }
  }

  console.log(`\nDone. ${failed} failed.`);
  process.exit(failed > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error("✗ cron-development-os crashed:", err);
  process.exit(1);
});
