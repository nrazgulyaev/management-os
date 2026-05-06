/**
 * Prompt 113 — Production-grade environment validation.
 *
 * Deliberately tolerant in development (warnings only) and strict in
 * staging / production (fatal where security depends on a value).
 * Pure — no DB, no `server-only`.  Safe to import from CLI scripts.
 */

import {
  ENV_REGISTRY,
  type EnvCategory,
  type EnvVarSpec,
  isPublicKey,
} from "./registry";

export type EnvMode = "development" | "staging" | "production" | "test";

export type EnvItemStatus =
  | "ok"
  | "missing"
  | "warning"
  | "fatal"
  | "not_required";

export interface EnvReportItem {
  key: string;
  category: EnvCategory | "unknown";
  status: EnvItemStatus;
  public: boolean;
  redactedValue?: string;
  message: string;
}

export interface EnvReadinessReport {
  ok: boolean;
  mode: EnvMode;
  fatalCount: number;
  warningCount: number;
  okCount: number;
  items: EnvReportItem[];
}

const PLACEHOLDER_VALUES = new Set([
  "",
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

/** Return `true` when the value looks like a real secret rather than a
 *  copy-pasted placeholder. */
function looksStrong(value: string): boolean {
  if (!value) return false;
  if (PLACEHOLDER_VALUES.has(value.toLowerCase())) return false;
  if (value.length < 16) return false;
  return true;
}

export function redactEnvValue(
  key: string,
  value: string | undefined,
): string | undefined {
  if (value === undefined) return undefined;
  if (isPublicKey(key)) {
    // Public values are safe to display, but cap length to keep
    // dashboards tidy.
    return value.length > 64 ? `${value.slice(0, 60)}…` : value;
  }
  if (value.length === 0) return "";
  // Show first 4 + last 2 chars only.  Don't echo single tokens.
  if (value.length <= 8) return "***";
  return `${value.slice(0, 4)}…${value.slice(-2)}`;
}

export function detectMode(): EnvMode {
  const nodeEnv = (process.env.NODE_ENV ?? "").toLowerCase();
  const appEnv = (process.env.NEXT_PUBLIC_APP_ENV ?? "").toLowerCase();
  if (nodeEnv === "test") return "test";
  if (appEnv === "production" || nodeEnv === "production") return "production";
  if (appEnv === "staging") return "staging";
  return "development";
}

interface EvaluationContext {
  mode: EnvMode;
  values: Record<string, string | undefined>;
}

function evaluateSpec(
  spec: EnvVarSpec,
  ctx: EvaluationContext,
): EnvReportItem {
  const value = ctx.values[spec.key];
  const category = spec.category;
  const isProd = ctx.mode === "production" || ctx.mode === "staging";
  const present = value !== undefined && value !== "";

  // ----- Conditional gates -----
  if (spec.requirement === "conditional" && spec.conditionalOn) {
    const [depKey, depExpected] = spec.conditionalOn.split("=", 2);
    const depActual = ctx.values[depKey];
    const depMatches = depExpected
      ? depActual === depExpected
      : depActual !== undefined && depActual !== "";
    if (!depMatches) {
      return {
        key: spec.key,
        category,
        status: "not_required",
        public: spec.public,
        redactedValue: redactEnvValue(spec.key, value),
        message: `Not required (${spec.conditionalOn} not active).`,
      };
    }
    // Fall through: treat as production-required.
    if (!present && isProd) {
      return {
        key: spec.key,
        category,
        status: "fatal",
        public: spec.public,
        message: `Required because ${spec.conditionalOn}.  Missing in ${ctx.mode}.`,
      };
    }
  }

  // ----- Always-required -----
  if (spec.requirement === "always" && !present) {
    return {
      key: spec.key,
      category,
      status: isProd ? "fatal" : "warning",
      public: spec.public,
      message: `Required in every environment.  Currently missing.`,
    };
  }

  // ----- Production-required -----
  if (spec.requirement === "production" && !present) {
    return {
      key: spec.key,
      category,
      status: isProd ? "fatal" : "warning",
      public: spec.public,
      message: isProd
        ? `Required in ${ctx.mode}.  Missing.`
        : `Optional in dev.  Required in staging / production.`,
    };
  }

  // ----- Optional -----
  if (spec.requirement === "optional" && !present) {
    return {
      key: spec.key,
      category,
      status: "ok",
      public: spec.public,
      message: "Optional — using defaults.",
    };
  }

  // ----- Strength check -----
  if (present && spec.mustBeStrong && isProd && !looksStrong(value!)) {
    return {
      key: spec.key,
      category,
      status: "fatal",
      public: spec.public,
      redactedValue: redactEnvValue(spec.key, value),
      message: `Value looks like a placeholder or is shorter than 16 chars.  Generate a strong random value.`,
    };
  }
  if (present && spec.mustBeStrong && !isProd && !looksStrong(value!)) {
    return {
      key: spec.key,
      category,
      status: "warning",
      public: spec.public,
      redactedValue: redactEnvValue(spec.key, value),
      message: `Weak value — refresh before deploying to staging / production.`,
    };
  }

  // ----- Demo guards -----
  if (spec.key === "ARCONIQUE_FORCE_MOCK" && value === "1" && isProd) {
    return {
      key: spec.key,
      category,
      status: "fatal",
      public: spec.public,
      redactedValue: redactEnvValue(spec.key, value),
      message: `ARCONIQUE_FORCE_MOCK must not be enabled in ${ctx.mode}.`,
    };
  }
  if (
    spec.key === "NEXT_PUBLIC_ENABLE_DEMO_MODE" &&
    value === "1" &&
    ctx.mode === "production"
  ) {
    return {
      key: spec.key,
      category,
      status: "warning",
      public: spec.public,
      redactedValue: redactEnvValue(spec.key, value),
      message:
        "Demo banners are visible in production — only enable when intentional.",
    };
  }

  // ----- Service-role key never NEXT_PUBLIC -----
  if (spec.key === "SUPABASE_SERVICE_ROLE_KEY" && spec.public) {
    return {
      key: spec.key,
      category,
      status: "fatal",
      public: spec.public,
      message: "SUPABASE_SERVICE_ROLE_KEY must NEVER be NEXT_PUBLIC.",
    };
  }

  // ----- NOTIFICATIONS_DRY_RUN must be explicit in production -----
  if (
    spec.key === "NOTIFICATIONS_DRY_RUN" &&
    isProd &&
    (value === undefined || value === "")
  ) {
    return {
      key: spec.key,
      category,
      status: "fatal",
      public: spec.public,
      message:
        "NOTIFICATIONS_DRY_RUN must be set explicitly (`0` or `1`) in production.",
    };
  }

  return {
    key: spec.key,
    category,
    status: "ok",
    public: spec.public,
    redactedValue: redactEnvValue(spec.key, value),
    message: present ? "Set." : "Optional / using defaults.",
  };
}

export function validateEnv(mode: EnvMode = detectMode()): EnvReadinessReport {
  const ctx: EvaluationContext = {
    mode,
    values: collectEnvValues(),
  };
  const items = ENV_REGISTRY.map((spec) => evaluateSpec(spec, ctx));
  // Cross-cutting check: if any NEXT_PUBLIC_* key contains a service-role-style
  // name, fail fatal.
  for (const k of Object.keys(ctx.values)) {
    if (
      isPublicKey(k) &&
      /service[-_]?role|secret|password|api[-_]?key/i.test(k.replace(/^NEXT_PUBLIC_/, ""))
    ) {
      items.push({
        key: k,
        category: "core",
        status: "fatal",
        public: true,
        message:
          "Public env var name suggests it carries a secret.  Rename or remove from NEXT_PUBLIC_*.",
      });
    }
  }
  let fatalCount = 0;
  let warningCount = 0;
  let okCount = 0;
  for (const i of items) {
    if (i.status === "fatal") fatalCount += 1;
    else if (i.status === "warning") warningCount += 1;
    else if (i.status === "ok" || i.status === "not_required") okCount += 1;
  }
  return {
    ok: fatalCount === 0,
    mode,
    fatalCount,
    warningCount,
    okCount,
    items,
  };
}

export function getEnvReadinessReport(): EnvReadinessReport {
  return validateEnv(detectMode());
}

export function assertProductionEnvReady(): void {
  const report = validateEnv("production");
  if (!report.ok) {
    const fatals = report.items.filter((i) => i.status === "fatal");
    const lines = fatals.map(
      (i) => `  - ${i.key} (${i.category}): ${i.message}`,
    );
    throw new Error(
      `Environment is not production-ready (${report.fatalCount} fatal):\n${lines.join("\n")}`,
    );
  }
}

function collectEnvValues(): Record<string, string | undefined> {
  const out: Record<string, string | undefined> = {};
  for (const spec of ENV_REGISTRY) {
    out[spec.key] = process.env[spec.key];
  }
  // Pick up any other NEXT_PUBLIC_* keys that aren't in the registry —
  // we still want to flag them if they look like secrets.
  for (const k of Object.keys(process.env)) {
    if (k.startsWith("NEXT_PUBLIC_") && !(k in out)) {
      out[k] = process.env[k];
    }
  }
  return out;
}

export type { EnvVarSpec, EnvCategory } from "./registry";
