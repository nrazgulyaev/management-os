import { type NextRequest } from "next/server";
import { handleCronJobRequest } from "@/features/jobs/cron-handler";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  return handleCronJobRequest(request, "dev_os_vendor_performance");
}

export async function POST(request: NextRequest) {
  return handleCronJobRequest(request, "dev_os_vendor_performance");
}
