/**
 * Prompt 114 — Static smoke test of the route inventory.
 *
 * Walks `src/app/**` via `discoverRoutes`, prints a per-audience
 * breakdown, and asserts the inventory meets a minimum coverage bar
 * (≥80 routes, every audience non-empty).  Never makes a live HTTP
 * request — this is a CI-friendly check that can run with no DB,
 * no env, and no Next.js server.
 */

import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  discoverRoutes,
  summariseByAudience,
  isFetchable,
  type RouteAudience,
} from "../src/features/smoke-tests/route-inventory";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(here, "..");
const appDir = join(repoRoot, "src/app");

const routes = discoverRoutes(appDir);
const breakdown = summariseByAudience(routes);

const lines: string[] = [];
lines.push("Route inventory smoke test");
lines.push("===========================");
lines.push(`Total routes discovered: ${routes.length}`);
lines.push(`Fetchable (no-auth GET): ${routes.filter(isFetchable).length}`);
lines.push("");
lines.push("By audience:");
for (const b of breakdown) {
  lines.push(`  ${b.audience.padEnd(16)} ${b.count}`);
}
lines.push("");

const REQUIRED_AUDIENCES: RouteAudience[] = [
  "public",
  "auth",
  "internal",
  "owner",
  "guest",
  "field",
  "vendor",
  "api-cron",
  "api-public",
];

let fatal = 0;
const present = new Set(breakdown.map((b) => b.audience));
for (const a of REQUIRED_AUDIENCES) {
  if (!present.has(a)) {
    lines.push(`  ✗ Audience "${a}" has no routes — expected at least one.`);
    fatal += 1;
  }
}

const MIN_ROUTES = 80;
if (routes.length < MIN_ROUTES) {
  lines.push(
    `  ✗ Discovered ${routes.length} routes; expected at least ${MIN_ROUTES}.`,
  );
  fatal += 1;
}

const cronRoutes = routes.filter((r) => r.audience === "api-cron");
for (const r of cronRoutes) {
  if (r.expectedStatus !== "401") {
    lines.push(
      `  ✗ Cron route ${r.path} should expect 401 without secret; got ${r.expectedStatus}.`,
    );
    fatal += 1;
  }
}

const internalRoutes = routes.filter((r) => r.audience === "internal");
for (const r of internalRoutes.slice(0, 20)) {
  if (r.expectedStatus !== "302") {
    lines.push(
      `  ! Internal route ${r.path} should expect 302 (redirect to login); got ${r.expectedStatus}.`,
    );
  }
}

lines.push("");
lines.push(`Overall: ${fatal === 0 ? "OK" : "FAILED"} (${fatal} fatal)`);

if (process.argv.includes("--verbose")) {
  lines.push("");
  lines.push("All routes:");
  for (const r of routes) {
    lines.push(
      `  [${r.audience}] ${r.kind === "route" ? "API " : "PAGE"} ${r.path} (${r.expectedStatus})`,
    );
  }
}

console.log(lines.join("\n"));
process.exit(fatal === 0 ? 0 : 1);

export {};
