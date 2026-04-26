import { type NextRequest } from "next/server";
import { handleCronJobRequest } from "@/features/jobs/cron-handler";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  return handleCronJobRequest(request, "bridge_pending_material_usage");
}

export async function POST(request: NextRequest) {
  return handleCronJobRequest(request, "bridge_pending_material_usage");
}
