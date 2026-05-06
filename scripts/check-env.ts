/**
 * Prompt 113 — Static env-readiness check.
 *
 * Usage:
 *   npm run check:env                  # detects mode from NODE_ENV / NEXT_PUBLIC_APP_ENV
 *   APP_ENV=staging npm run check:env  # force a mode
 *
 * Exit codes:
 *   0 — OK or warnings only
 *   1 — fatal env issues
 */

import { detectMode, validateEnv, type EnvMode } from "@/lib/env/validation";
import { formatEnvReport } from "@/lib/env/report";

function modeFromArgv(): EnvMode {
  const arg = process.argv.find((a) => a.startsWith("--mode="));
  if (arg) {
    const v = arg.split("=", 2)[1] as EnvMode;
    if (["development", "staging", "production", "test"].includes(v)) return v;
  }
  if (process.env.APP_ENV === "production") return "production";
  if (process.env.APP_ENV === "staging") return "staging";
  return detectMode();
}

const mode = modeFromArgv();
const report = validateEnv(mode);
console.log(formatEnvReport(report));
process.exit(report.ok ? 0 : 1);

export {};
