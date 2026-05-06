/**
 * Prompt 114 — Static check that every cron route refuses unauthorised
 * requests by going through `handleCronJobRequest` /
 * `handleCronRunAllRequest` (both call `verifyCronAuthFromRequest`,
 * which is gated on `CRON_SECRET` and the production env).
 *
 * Live HTTP is NOT required.  This script:
 *   1. Walks `src/app/api/cron/*` and confirms each `route.ts` calls
 *      one of the shared handlers.
 *   2. Source-greps `src/features/jobs/auth.ts` for the production
 *      gate (`isProduction()` short-circuit + bearer comparison) so a
 *      future refactor cannot accidentally drop the rejection path.
 *
 * The full pure-decision matrix for `verifyCronAuth` lives in
 * `tests/p114-staging-smoke-hardening.test.ts` — there we can run each
 * env permutation in a fresh module instance.
 */

import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(here, "..");
const cronDir = join(repoRoot, "src/app/api/cron");
const authFile = join(repoRoot, "src/features/jobs/auth.ts");

interface RouteAuthResult {
  dir: string;
  usesHandler: boolean;
}

function listCronRoutes(): RouteAuthResult[] {
  if (!existsSync(cronDir)) return [];
  const out: RouteAuthResult[] = [];
  for (const name of readdirSync(cronDir)) {
    const full = join(cronDir, name);
    if (!statSync(full).isDirectory()) continue;
    const route = join(full, "route.ts");
    if (!existsSync(route)) {
      out.push({ dir: name, usesHandler: false });
      continue;
    }
    const body = readFileSync(route, "utf-8");
    const usesHandler =
      body.includes("handleCronJobRequest") ||
      body.includes("handleCronRunAllRequest");
    out.push({ dir: name, usesHandler });
  }
  return out;
}

const lines: string[] = [];
lines.push("Cron auth verification");
lines.push("======================");

let fatal = 0;

const routes = listCronRoutes();
for (const r of routes) {
  if (!r.usesHandler) {
    lines.push(
      `  ✗ ${r.dir}: does not call handleCronJobRequest / handleCronRunAllRequest — auth not enforced.`,
    );
    fatal += 1;
  } else {
    lines.push(`  ✓ ${r.dir}: routes auth via shared handler.`);
  }
}

lines.push("");
lines.push("Auth helper invariants (source-grep):");

if (!existsSync(authFile)) {
  lines.push(`  ✗ ${authFile} missing.`);
  fatal += 1;
} else {
  const body = readFileSync(authFile, "utf-8");
  const checks: { ok: boolean; label: string }[] = [
    {
      ok: body.includes("isProduction()"),
      label: "production gate calls isProduction()",
    },
    {
      ok: /env\.server\.CRON_SECRET/.test(body),
      label: "reads expected secret from env.server.CRON_SECRET",
    },
    {
      ok: /Bearer\s/.test(body),
      label: "expects Authorization: Bearer <secret>",
    },
    {
      ok: /LOCAL_HOSTS|localhost/.test(body),
      label: "limits dev fallback to localhost",
    },
    {
      ok: /missing or invalid bearer token/.test(body),
      label: "emits a typed reason on rejection",
    },
  ];
  for (const c of checks) {
    if (c.ok) {
      lines.push(`  ✓ ${c.label}`);
    } else {
      lines.push(`  ✗ ${c.label}`);
      fatal += 1;
    }
  }
}

lines.push("");
lines.push(
  `${routes.length} cron route(s) inspected, ${routes.filter((r) => r.usesHandler).length} via shared handler.`,
);
lines.push(`Overall: ${fatal === 0 ? "OK" : "FAILED"} (${fatal} fatal)`);

console.log(lines.join("\n"));
process.exit(fatal === 0 ? 0 : 1);

export {};
