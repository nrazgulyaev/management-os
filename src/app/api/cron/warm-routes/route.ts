/**
 * Stage 8.E.1 — warm-up cron route.
 *
 * Wakes a small set of high-traffic routes every 10 min so customers
 * don't pay cold-start latency on first hit. See
 * `src/features/jobs/warm-routes-job.ts` for the route list and
 * rationale; the audit findings driving this cron are in
 * `tmp/stage-8-c-workflow-findings.md`.
 *
 * Auth: shares the standard `CRON_SECRET` envelope every other cron
 * uses (verified in `handleCronJobRequest`).
 *
 * Schedule: `*\/10 * * * *` (Vercel cron; documented in
 * docs/VERCEL-CRON-CHECKLIST.md).
 */

import { type NextRequest } from "next/server";
import { handleCronJobRequest } from "@/features/jobs/cron-handler";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  return handleCronJobRequest(request, "warm_routes");
}

export async function POST(request: NextRequest) {
  return handleCronJobRequest(request, "warm_routes");
}
