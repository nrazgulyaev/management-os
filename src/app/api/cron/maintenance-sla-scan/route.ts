import { NextResponse, type NextRequest } from "next/server";
import { verifyCronAuthFromRequest } from "@/features/jobs/auth";
import { runMaintenanceSlaScan } from "@/features/jobs/maintenance-sla-scan-job";

/**
 * Maintenance SLA breach scan — cron route.
 *
 * Recomputes SLA status for every open maintenance ticket and logs an
 * `sla_breaches` row (deduped per open breach) for any past its p0–p3
 * target window. CRON_SECRET-protected via verifyCronAuthFromRequest
 * (production always requires the bearer; localhost/dev allowed when
 * CRON_SECRET is unset). Invoked by the project's job dispatcher like the
 * other /api/cron/* routes — registered in features/jobs/definitions.ts
 * (key `maintenance_sla_scan`, every 30 min).
 */

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const auth = verifyCronAuthFromRequest(request);
  if (!auth.ok) {
    return NextResponse.json(
      { ok: false, error: auth.reason ?? "unauthorised" },
      { status: 401 },
    );
  }

  try {
    const result = await runMaintenanceSlaScan();
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : "scan failed" },
      { status: 500 },
    );
  }
}

// Allow POST as well (some dispatchers POST to cron endpoints).
export const POST = GET;
