import { type NextRequest } from "next/server";
import { handleCronJobRequest } from "@/features/jobs/cron-handler";

/**
 * INSIGHTS-PUSH-0600 — morning owner-intelligence digest cron.
 * Auth: shared CRON_SECRET bearer envelope (house pattern via
 * handleCronJobRequest). Scheduled in vercel.json at 22:00 UTC, which is
 * 06:00 WITA (Asia/Makassar) — Vercel crons are UTC-only.
 */

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  return handleCronJobRequest(request, "owner_intel_daily");
}

export async function POST(request: NextRequest) {
  return handleCronJobRequest(request, "owner_intel_daily");
}
