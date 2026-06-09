import { NextResponse, type NextRequest } from "next/server";
import { evaluateHealth } from "@/features/system/health-check";
import { logger } from "@/lib/observability/logger";

/**
 * OBSERVABILITY-SPINE-H — platform liveness probe.
 *
 * Returns HTTP 200 + `{ healthy: true, ... }` when the platform is well, and
 * HTTP 503 + `{ healthy: false, ... }` when a threshold is breached (DB
 * unreachable, or a job stuck `running` past HEALTH_STALE_JOB_MINUTES).
 *
 * NOTE — this is the ONE route under /api/cron/* that is intentionally NOT a
 * scheduled job and NOT behind the CRON_SECRET bearer: an uptime monitor must
 * be able to hit it anonymously, and it leaks no sensitive data (booleans +
 * short, non-secret detail strings only). It is registered as an explicit
 * exemption in `scripts/check-cron-config.ts` (HEALTH_PROBE_ROUTES) so the
 * cron-checklist invariant still holds for every real job route.
 */

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(_request: NextRequest) {
  let report;
  try {
    report = await evaluateHealth();
  } catch (e) {
    // The probe itself failed — treat as unhealthy rather than throwing a 500
    // white-screen at the monitor.
    const message = e instanceof Error ? e.message : "health probe threw";
    logger.error("Health probe threw", { area: "cron.health", error: message });
    return NextResponse.json(
      { healthy: false, checkedAt: new Date().toISOString(), error: message },
      { status: 503 },
    );
  }

  if (!report.healthy) {
    // Emit a structured error so the observability sink (Sentry/Logtail) sees
    // the breach even if the uptime monitor's own alerting is misconfigured.
    logger.error("Health threshold breached", {
      area: "cron.health",
      checks: report.checks,
    });
  }

  return NextResponse.json(report, { status: report.healthy ? 200 : 503 });
}

export async function POST(request: NextRequest) {
  return GET(request);
}
