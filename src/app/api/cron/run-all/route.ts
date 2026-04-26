import { type NextRequest } from "next/server";
import { handleCronRunAllRequest } from "@/features/jobs/cron-handler";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  return handleCronRunAllRequest(request);
}

export async function POST(request: NextRequest) {
  return handleCronRunAllRequest(request);
}
