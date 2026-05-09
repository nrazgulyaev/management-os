/**
 * Stage 10.L — Daily trial-expiry reminder cron.
 *
 * Finds active trials ending in the next 0-3 days, emails each org's
 * super_admin user(s) via the Stage 10.G transactional `sendEmail()`
 * (now wired to live Resend in 10.L).
 *
 * Auth: standard CRON_SECRET envelope shared by every other cron route
 * (Stage 8.E.1 / 10.G).
 */

import { type NextRequest } from "next/server";
import { handleCronJobRequest } from "@/features/jobs/cron-handler";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  return handleCronJobRequest(request, "trial_expiry_reminder");
}

export async function POST(request: NextRequest) {
  return handleCronJobRequest(request, "trial_expiry_reminder");
}
