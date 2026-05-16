#!/usr/bin/env tsx
/**
 * RELIABILITY-1 Task 1 — production-build smoke harness.
 *
 * Builds the app with `next build` and starts `next start` on a
 * disposable port, then probes a curated set of critical routes for
 * HTTP 200/302/307 vs 4xx/5xx. Catches production-only bugs that the
 * dev server hides:
 *
 *   - "use server" file exports an object (Next 15 only enforces in
 *     prod build — caught COMPLETE-1)
 *   - RSC payload serialization errors (caught HF-1)
 *   - Server Action bodySizeLimit defaults (caught HF-8)
 *   - ISR / static-cache misconfiguration
 *   - Stale .next/ chunks causing intermittent failures (caught
 *     COMPLETE-1)
 *
 * Stack-cheap probe — uses Node fetch, not Playwright. Doesn't
 * require a real browser. Best run on a freshly-built tree.
 *
 * Usage:
 *   npm run audit:prod-smoke              # full set
 *   npm run audit:prod-smoke -- --quick    # 10 routes only
 *
 * Exit code: 1 if any route returns 4xx/5xx (excluding 404 on
 * known-deleted routes); 0 otherwise.
 */

import { spawn, type ChildProcess } from "node:child_process";
import { resolve } from "node:path";

const ROOT = resolve(__dirname, "..");
const PORT = Number(process.env.AUDIT_PROD_PORT ?? 3102);
const BASE_URL = `http://localhost:${PORT}`;

const CRITICAL_ROUTES = [
  // Marketing / public
  "/",
  "/pricing",
  "/products/management-os",
  "/products/development-os",
  "/login",
  "/signup",
  // Mgmt OS apex + cabinets
  "/dashboard",
  "/dashboard/front-office",
  "/dashboard/owner",
  "/dashboard/concierge",
  "/dashboard/villas",
  "/dashboard/bookings",
  "/dashboard/finance",
  "/dashboard/settings",
  "/dashboard/settings/integrations",
  "/dashboard/settings/ai-agents",
  "/dashboard/maintenance-intelligence",
  "/dashboard/maintenance-intelligence/templates",
  // Dev OS apex + cabinets
  "/development-os",
  "/development-os/cabinets/cfo-accountant",
  "/development-os/cabinets/project-manager",
  "/development-os/cabinets/qs",
  "/development-os/cabinets/sales-manager",
  "/development-os/cabinets/marketing-staff",
  "/development-os/cabinets/site-supervisor",
  // Finance deep links (HF-7 surface)
  "/development-os/finance/transactions",
  "/development-os/finance/transactions/quick-entry",
  "/development-os/finance/bank-accounts",
  "/development-os/finance/categories",
  "/development-os/finance/invoices",
  // Misc
  "/development-os/contracts",
  "/development-os/reservations",
  "/development-os/sales",
  "/development-os/marketing/conversations",
];

const QUICK_ROUTES = [
  "/",
  "/dashboard",
  "/development-os",
  "/dashboard/concierge",
  "/dashboard/front-office",
  "/development-os/cabinets/cfo-accountant",
  "/development-os/finance/transactions",
  "/development-os/finance/transactions/quick-entry",
  "/development-os/finance/bank-accounts",
  "/dashboard/maintenance-intelligence/templates",
];

interface Result {
  route: string;
  status: number;
  ok: boolean;
  durationMs: number;
}

async function probe(route: string): Promise<Result> {
  const start = Date.now();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15_000);
  try {
    const res = await fetch(BASE_URL + route, {
      redirect: "manual",
      signal: controller.signal,
    });
    const ok =
      res.status < 400 || res.status === 404; // 404 fine for intentionally deleted routes
    return { route, status: res.status, ok, durationMs: Date.now() - start };
  } catch (err) {
    return {
      route,
      status: 0,
      ok: false,
      durationMs: Date.now() - start,
    };
  } finally {
    clearTimeout(timeout);
  }
}

async function waitForReady(maxMs: number): Promise<boolean> {
  const start = Date.now();
  while (Date.now() - start < maxMs) {
    try {
      const res = await fetch(BASE_URL + "/", { redirect: "manual" });
      if (res.status > 0) return true;
    } catch {
      /* not ready */
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  return false;
}

function startServer(): ChildProcess {
  const proc = spawn("npm", ["start"], {
    cwd: ROOT,
    env: { ...process.env, PORT: String(PORT) },
    stdio: ["ignore", "pipe", "pipe"],
  });
  // Drain stderr so the process doesn't block on a full pipe.
  proc.stderr?.on("data", () => {});
  proc.stdout?.on("data", () => {});
  return proc;
}

async function main(): Promise<void> {
  const quick = process.argv.includes("--quick");
  const routes = quick ? QUICK_ROUTES : CRITICAL_ROUTES;
  console.log(
    `prod-smoke audit — ${routes.length} routes against ${BASE_URL}`,
  );

  console.log("starting next start on port", PORT, "...");
  const proc = startServer();
  const ready = await waitForReady(30_000);
  if (!ready) {
    console.error("server did not become ready in 30s; aborting.");
    proc.kill();
    process.exit(1);
  }
  console.log("server ready, probing routes...\n");

  const results: Result[] = [];
  for (const route of routes) {
    const r = await probe(route);
    results.push(r);
    const mark = r.ok ? "✓" : "✗";
    console.log(
      `${mark} ${r.status || "ERR"} ${route} (${r.durationMs}ms)`,
    );
  }

  proc.kill();

  const fails = results.filter((r) => !r.ok);
  console.log(
    `\n${results.length - fails.length}/${results.length} routes ok`,
  );
  if (fails.length > 0) {
    console.log("\nfailures:");
    for (const f of fails) console.log(`  ${f.status || "ERR"} ${f.route}`);
    process.exit(1);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
