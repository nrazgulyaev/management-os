/**
 * Prompt 113 — Static check that every cron route in
 * `src/app/api/cron/*` is wired to a known job key, gated by
 * `handleCronJobRequest` (which requires `CRON_SECRET`), and listed
 * in `docs/VERCEL-CRON-CHECKLIST.md`.
 */

import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(here, "..");

const cronDir = join(repoRoot, "src/app/api/cron");
const checklistPath = join(repoRoot, "docs/VERCEL-CRON-CHECKLIST.md");

function listCronRoutes(): string[] {
  if (!existsSync(cronDir)) return [];
  return readdirSync(cronDir).filter((f) => {
    const s = statSync(join(cronDir, f));
    return s.isDirectory();
  });
}

function loadKnownJobKeys(): Set<string> {
  const out = new Set<string>();
  const actionsPath = join(repoRoot, "src/features/jobs/actions.ts");
  if (!existsSync(actionsPath)) return out;
  const body = readFileSync(actionsPath, "utf-8");
  // Parse the inline KNOWN_JOBS Set initializer.
  const m = body.match(/KNOWN_JOBS\s*=\s*new\s+Set\(\[([\s\S]*?)\]\)/);
  if (m) {
    for (const k of m[1].matchAll(/"([a-z0-9_]+)"/g)) out.add(k[1]);
  }
  return out;
}

const lines: string[] = [];
lines.push("Cron route configuration check");
lines.push("==============================");

let fatal = 0;
let warning = 0;
const routes = listCronRoutes();
const checklistBody = existsSync(checklistPath)
  ? readFileSync(checklistPath, "utf-8")
  : "";
const knownJobs = loadKnownJobKeys();

if (!existsSync(checklistPath)) {
  lines.push("  ✗ docs/VERCEL-CRON-CHECKLIST.md is missing.");
  fatal += 1;
}

for (const dir of routes) {
  const routeFile = join(cronDir, dir, "route.ts");
  if (!existsSync(routeFile)) {
    lines.push(`  ! ${dir}: no route.ts found — skipping.`);
    warning += 1;
    continue;
  }
  const body = readFileSync(routeFile, "utf-8");
  const usesHandler =
    body.includes("handleCronJobRequest") ||
    body.includes("handleCronRunAllRequest");
  if (!usesHandler) {
    lines.push(
      `  ✗ ${dir}: route does not call handleCronJobRequest or handleCronRunAllRequest.`,
    );
    fatal += 1;
  }
  // Extract job key from `handleCronJobRequest(request, "<key>")`.
  const keyMatch = body.match(/handleCronJobRequest\([^,]+,\s*"([a-z0-9_]+)"\)/);
  if (keyMatch) {
    const jobKey = keyMatch[1];
    if (!knownJobs.has(jobKey)) {
      lines.push(
        `  ✗ ${dir}: job key "${jobKey}" not in KNOWN_JOBS in src/features/jobs/actions.ts.`,
      );
      fatal += 1;
    }
    if (checklistBody && !checklistBody.includes(jobKey)) {
      lines.push(`  ✗ ${dir}: job key "${jobKey}" missing from VERCEL-CRON-CHECKLIST.md.`);
      fatal += 1;
    }
  }
  // Path coverage in the checklist.
  const routePath = `/api/cron/${dir}`;
  if (checklistBody && !checklistBody.includes(routePath)) {
    lines.push(`  ! ${dir}: route path "${routePath}" missing from checklist.`);
    warning += 1;
  }
}
lines.push("");
lines.push(`${routes.length} cron route(s) inspected, ${knownJobs.size} known job keys.`);
lines.push(`Overall: ${fatal === 0 ? "OK" : "FAILED"} (${fatal} fatal, ${warning} warning)`);
console.log(lines.join("\n"));
process.exit(fatal === 0 ? 0 : 1);

export {};
