/**
 * Stage 8.E.1 — Vercel cold-start mitigation.
 *
 * Periodically issues HEAD requests against a small set of high-traffic
 * dashboard routes so their function instances stay warm. Without this
 * the Stage 7.G + 8.C audits observed cold-start latency exceeding
 * Playwright's default timeout for 95+ routes; a customer landing on
 * an unwarmed route can pay 3-5s of cold-start before the first byte.
 *
 * Schedule: every 10 min (cron expression in docs/VERCEL-CRON-CHECKLIST.md).
 * Auth: same `CRON_SECRET` envelope every other cron uses.
 *
 * Deliberately NOT GET — HEAD is enough to wake Next's serverless
 * function and any per-deployment caches without rendering the page or
 * burning DB queries. (If a route doesn't accept HEAD it falls back to
 * GET via the redirect rules.)
 *
 * The route list intentionally excludes the four hub pages still
 * timing out under cold start (`/dashboard/direct-bookings`,
 * `/dashboard/pricing`, etc.) — their cold-start cost is the slow
 * underlying queries, not function spin-up; warming the function
 * doesn't help. Their fix is per-query optimization, tracked in
 * tmp/stage-8-c-workflow-findings.md.
 */

import "server-only";

import type { JobOutcome, JobRunHandle } from "./runner";
import { env } from "@/lib/env";

/**
 * Routes whose function instances should stay warm. Order doesn't matter;
 * fetches are issued in parallel and per-route failures are tolerated.
 */
export const WARM_ROUTES = [
  "/",
  "/pricing",
  "/sign-up",
  "/login",
  "/dashboard",
  "/development-os",
  "/dashboard/front-office/arrivals",
  "/dashboard/front-office/departures",
  "/dashboard/front-office/in-house",
  "/dashboard/operations/maintenance",
  "/dashboard/system/health",
  "/development-os/ai-agents",
  "/development-os/marketing/connections",
  "/development-os/banking",
] as const;

export async function runWarmRoutesJob(
  handle: JobRunHandle,
): Promise<JobOutcome> {
  const base = env.server.APP_BASE_URL ?? null;
  if (!base) {
    await handle.event(
      "warning",
      "APP_BASE_URL not configured — skipping warm-up sweep.",
    );
    return {
      status: "success",
      summary: "Skipped — APP_BASE_URL unset.",
      metrics: { warmed: 0, failed: 0, total: 0 },
    };
  }

  const startedAt = Date.now();
  const results = await Promise.allSettled(
    WARM_ROUTES.map(async (route) => {
      const url = `${base.replace(/\/$/, "")}${route}`;
      const t0 = Date.now();
      const resp = await fetch(url, {
        method: "HEAD",
        headers: { "x-warm-up": "1" },
        // Keep timeout tight — if a route is genuinely slow we don't
        // want the warm-up to itself become a slow request.
        signal: AbortSignal.timeout(8_000),
      });
      return {
        route,
        status: resp.status,
        durationMs: Date.now() - t0,
      };
    }),
  );

  const ok = results.filter(
    (r) => r.status === "fulfilled" && r.value.status < 500,
  ).length;
  const failed = results.length - ok;
  const fulfilled: Array<{ route: string; status: number; durationMs: number }> = [];
  for (const r of results) {
    if (r.status === "fulfilled") fulfilled.push(r.value);
  }
  const slowest = fulfilled
    .sort((a, b) => b.durationMs - a.durationMs)
    .slice(0, 3)
    .map((r) => `${r.route}=${r.durationMs}ms`)
    .join(", ");

  if (failed > 0) {
    await handle.event(
      "warning",
      `${failed} of ${results.length} warm-up requests did not return 2xx/3xx/4xx (counted as warmed if status<500).`,
    );
  }
  await handle.event(
    "info",
    `Slowest 3: ${slowest || "—"}; total wall ${Date.now() - startedAt}ms.`,
  );

  return {
    status: failed === 0 ? "success" : "partial_success",
    summary: `Warmed ${ok}/${results.length} routes.`,
    metrics: {
      warmed: ok,
      failed,
      total: results.length,
      durationMs: Date.now() - startedAt,
    },
  };
}
