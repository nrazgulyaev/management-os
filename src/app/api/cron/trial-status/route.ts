/**
 * Stage 10.I.6 — Daily trial-status sweep cron.
 *
 * Finds orgs where trial_status='active' AND trial_ends_at < now() and
 * flips them to 'expired'. Idempotent — re-runs only touch newly-
 * expired rows. Runs daily at 03:10 UTC (vercel.json).
 *
 * Auth: standard CRON_SECRET envelope shared by every other cron route
 * (Stage 8.E.1 / 10.G).
 */

import { type NextRequest } from "next/server";
import { handleCronJobRequest } from "@/features/jobs/cron-handler";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  return handleCronJobRequest(request, "trial_status");
}

export async function POST(request: NextRequest) {
  return handleCronJobRequest(request, "trial_status");
}
