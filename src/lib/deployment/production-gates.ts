/**
 * Prompt 113 — Production deployment gates.
 *
 * Each `assert*` helper throws when called on production with a
 * dangerous configuration.  The runtime callers (preflight script,
 * deployment dashboard) catch and surface these as fatal errors.
 *
 * Pure — no DB, no `server-only`.  Safe to import from CLI.  Helpers
 * never throw outside production / staging unless documented.
 */

import { detectMode, validateEnv, type EnvMode } from "../env/validation";

export interface GateResult {
  key: string;
  ok: boolean;
  /** "info" / "warning" / "critical" */
  severity: "info" | "warning" | "critical";
  message: string;
}

const PRODUCTION_MODES: ReadonlyArray<EnvMode> = ["staging", "production"];

function isProductionMode(mode: EnvMode): boolean {
  return PRODUCTION_MODES.includes(mode);
}

export function assertNoDemoModeInProduction(mode: EnvMode = detectMode()): GateResult {
  if (!isProductionMode(mode)) {
    return {
      key: "no_demo_mode",
      ok: true,
      severity: "info",
      message: `Skipped (mode=${mode}).`,
    };
  }
  const force = process.env.ARCONIQUE_FORCE_MOCK;
  const publicDemo = process.env.NEXT_PUBLIC_ENABLE_DEMO_MODE;
  if (force === "1") {
    return {
      key: "no_demo_mode",
      ok: false,
      severity: "critical",
      message:
        "ARCONIQUE_FORCE_MOCK=1 in production — refusing.  Unset before deploying.",
    };
  }
  if (publicDemo === "1" && mode === "production") {
    return {
      key: "no_demo_mode",
      ok: false,
      severity: "warning",
      message: "NEXT_PUBLIC_ENABLE_DEMO_MODE=1 in production — confirm intentional.",
    };
  }
  return { key: "no_demo_mode", ok: true, severity: "info", message: "OK." };
}

export function assertNoDevCronBypassInProduction(
  mode: EnvMode = detectMode(),
): GateResult {
  if (!isProductionMode(mode)) {
    return {
      key: "no_dev_cron_bypass",
      ok: true,
      severity: "info",
      message: `Skipped (mode=${mode}).`,
    };
  }
  const allowDev = process.env.ALLOW_DEV_CRON_WITHOUT_SECRET;
  if (allowDev === "1") {
    return {
      key: "no_dev_cron_bypass",
      ok: false,
      severity: "critical",
      message:
        "ALLOW_DEV_CRON_WITHOUT_SECRET=1 in production — cron routes would be unauthenticated.",
    };
  }
  if (!process.env.CRON_SECRET) {
    return {
      key: "no_dev_cron_bypass",
      ok: false,
      severity: "critical",
      message: "CRON_SECRET missing — cron routes would refuse all requests.",
    };
  }
  return {
    key: "no_dev_cron_bypass",
    ok: true,
    severity: "info",
    message: "CRON_SECRET set; no dev bypass active.",
  };
}

export function assertSecuritySecretsPresentInProduction(
  mode: EnvMode = detectMode(),
): GateResult {
  if (!isProductionMode(mode)) {
    return {
      key: "security_secrets",
      ok: true,
      severity: "info",
      message: `Skipped (mode=${mode}).`,
    };
  }
  const missing: string[] = [];
  for (const k of [
    "SECURITY_ENCRYPTION_SECRET",
    "STAY_LINK_KMS_SECRET",
    "CRON_SECRET",
    "SUPABASE_SERVICE_ROLE_KEY",
  ]) {
    if (!process.env[k]) missing.push(k);
  }
  if (missing.length > 0) {
    return {
      key: "security_secrets",
      ok: false,
      severity: "critical",
      message: `Missing in production: ${missing.join(", ")}.`,
    };
  }
  return {
    key: "security_secrets",
    ok: true,
    severity: "info",
    message: "All required secrets set.",
  };
}

export function assertNotificationModeExplicit(
  mode: EnvMode = detectMode(),
): GateResult {
  if (!isProductionMode(mode)) {
    return {
      key: "notifications_mode",
      ok: true,
      severity: "info",
      message: `Skipped (mode=${mode}).`,
    };
  }
  const dryRun = process.env.NOTIFICATIONS_DRY_RUN;
  if (dryRun === undefined || dryRun === "") {
    return {
      key: "notifications_mode",
      ok: false,
      severity: "critical",
      message:
        "NOTIFICATIONS_DRY_RUN must be explicitly `0` or `1` in production.",
    };
  }
  if (dryRun === "0") {
    const missing: string[] = [];
    if (!process.env.RESEND_API_KEY) missing.push("RESEND_API_KEY");
    if (!process.env.RESEND_FROM_EMAIL) missing.push("RESEND_FROM_EMAIL");
    if (missing.length > 0) {
      return {
        key: "notifications_mode",
        ok: false,
        severity: "critical",
        message: `NOTIFICATIONS_DRY_RUN=0 but missing: ${missing.join(", ")}.`,
      };
    }
  }
  return {
    key: "notifications_mode",
    ok: true,
    severity: "info",
    message: `NOTIFICATIONS_DRY_RUN=${dryRun}.`,
  };
}

const PLACEHOLDER_VALUES = new Set([
  "dev",
  "test",
  "changeme",
  "change-me",
  "secret",
  "todo",
  "tbd",
  "local",
  "local-secret",
  "placeholder",
  "example",
]);

export function assertBootstrapSecretStrong(
  mode: EnvMode = detectMode(),
): GateResult {
  const v = process.env.ADMIN_BOOTSTRAP_SECRET ?? "";
  if (!v) {
    return {
      key: "bootstrap_secret",
      ok: true,
      severity: "info",
      message:
        "ADMIN_BOOTSTRAP_SECRET unset — bootstrap route is disabled.",
    };
  }
  const lower = v.toLowerCase();
  if (PLACEHOLDER_VALUES.has(lower) || v.length < 16) {
    return {
      key: "bootstrap_secret",
      ok: false,
      severity: isProductionMode(mode) ? "critical" : "warning",
      message:
        "ADMIN_BOOTSTRAP_SECRET is short or placeholder-like.  Generate with `openssl rand -hex 32`.",
    };
  }
  return {
    key: "bootstrap_secret",
    ok: true,
    severity: "info",
    message: "OK.",
  };
}

/**
 * P114 — AI dry-run must be explicit in production.  Default-on
 * dry-run is fine, but an unset value masks intent and can lead to a
 * surprise switch when the env eventually changes.
 */
export function assertAiModeExplicit(
  mode: EnvMode = detectMode(),
): GateResult {
  if (!isProductionMode(mode)) {
    return {
      key: "ai_mode",
      ok: true,
      severity: "info",
      message: `Skipped (mode=${mode}).`,
    };
  }
  const dryRun = process.env.AI_DRY_RUN;
  if (dryRun === undefined || dryRun === "") {
    return {
      key: "ai_mode",
      ok: false,
      severity: "warning",
      message: "AI_DRY_RUN should be explicit (`0` or `1`) in production.",
    };
  }
  if (dryRun === "0" && !process.env.ANTHROPIC_API_KEY) {
    return {
      key: "ai_mode",
      ok: false,
      severity: "critical",
      message: "AI_DRY_RUN=0 but ANTHROPIC_API_KEY missing.",
    };
  }
  return {
    key: "ai_mode",
    ok: true,
    severity: "info",
    message: `AI_DRY_RUN=${dryRun}.`,
  };
}

/**
 * P114 — `ALLOW_DEMO_SECURITY_FALLBACKS=1` lets the encryption helpers
 * use the deterministic dev fallback key.  Production must never set
 * this — otherwise MFA TOTP secrets and Wi-Fi passwords would be
 * unwrappable from any clone of the codebase.
 */
export function assertNoDemoSecurityFallbacksInProduction(
  mode: EnvMode = detectMode(),
): GateResult {
  if (!isProductionMode(mode)) {
    return {
      key: "no_demo_security_fallbacks",
      ok: true,
      severity: "info",
      message: `Skipped (mode=${mode}).`,
    };
  }
  if (process.env.ALLOW_DEMO_SECURITY_FALLBACKS === "1") {
    return {
      key: "no_demo_security_fallbacks",
      ok: false,
      severity: "critical",
      message:
        "ALLOW_DEMO_SECURITY_FALLBACKS=1 in production — encryption would use the deterministic dev key.",
    };
  }
  return {
    key: "no_demo_security_fallbacks",
    ok: true,
    severity: "info",
    message: "OK.",
  };
}

/**
 * P114 — A bare `DEMO_MODE` env var has no business in any non-dev
 * environment.  Some teams set it inadvertently during local debug.
 * Catch it before it reaches production.
 */
export function assertNoBareDemoModeInProduction(
  mode: EnvMode = detectMode(),
): GateResult {
  if (!isProductionMode(mode)) {
    return {
      key: "no_bare_demo_mode",
      ok: true,
      severity: "info",
      message: `Skipped (mode=${mode}).`,
    };
  }
  const v = process.env.DEMO_MODE;
  if (v && v !== "0" && v.toLowerCase() !== "false") {
    return {
      key: "no_bare_demo_mode",
      ok: false,
      severity: "critical",
      message: `DEMO_MODE=${v} in production — refuse.  Unset before deploying.`,
    };
  }
  return {
    key: "no_bare_demo_mode",
    ok: true,
    severity: "info",
    message: "OK.",
  };
}

export function getProductionGateReport(
  mode: EnvMode = detectMode(),
): {
  mode: EnvMode;
  results: GateResult[];
  ok: boolean;
  envReadinessOk: boolean;
} {
  const results = [
    assertNoDemoModeInProduction(mode),
    assertNoBareDemoModeInProduction(mode),
    assertNoDemoSecurityFallbacksInProduction(mode),
    assertNoDevCronBypassInProduction(mode),
    assertSecuritySecretsPresentInProduction(mode),
    assertNotificationModeExplicit(mode),
    assertAiModeExplicit(mode),
    assertBootstrapSecretStrong(mode),
  ];
  const env = validateEnv(mode);
  return {
    mode,
    results,
    ok: results.every((r) => r.ok) && env.ok,
    envReadinessOk: env.ok,
  };
}
